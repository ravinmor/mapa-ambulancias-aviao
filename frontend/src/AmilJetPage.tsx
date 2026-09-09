import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MapContainer, TileLayer, Marker, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import type { TrackedAircraft } from './types';
import { apiUrl } from './api';
import { isStage, trackedAircraftName, formatLastSeen } from './trackedAircraft';
import { formatAltitude, formatVelocity, formatVerticalRate, formatTrack, altitudeColor } from './aircraft';
import { useDeadReckoning } from './useDeadReckoning';
import { useMapSelection } from './useMapSelection';
import { useBreakpoint } from './useBreakpoint';
import { useAircraftActivityLog } from './useAircraftActivityLog';
import AmilTimelineArc from './AmilTimelineArc';
import AmilArcBackdrop from './AmilArcBackdrop';
import AmilCompassBackdrop from './AmilCompassBackdrop';
import AmilAltitudeTower from './AmilAltitudeTower';
import AmilMetadataPanel from './AmilMetadataPanel';
import AmilAircraftHeaderPanel from './AmilAircraftHeaderPanel';
import AmilFlightInfoPanel from './AmilFlightInfoPanel';
import AmilActivityLog from './AmilActivityLog';
import AmilSideTicks from './AmilSideTicks';
import AircraftTrail from './AircraftTrail';

// Pagina das aeronaves especificas da Amil, rota propria (/aviacao-executiva)
// e design proprio — NAO reaproveita Map.tsx nem TrackingPage.tsx de
// proposito (pedido do usuario, 2026-09-01): mapa mais escuro/"executivo",
// sem lista/filtro, e a linha do tempo em arco (AmilTimelineArc) no lugar da
// MissionTimeline das ambulancias.
//
// MULTIPLAS aeronaves (pedido do usuario, 2026-09-02) + MESMO sistema de
// zoom/foco do mapa das ambulancias (useMapSelection.ts, useCallback pra
// historyUrl, FitBounds no 1o carregamento) — nao mais um unico marcador
// centralizado na mao. Isso tambem elimina de raiz a classe de bug que a
// pagina tinha antes (setView manual + mapRef que podia nao estar pronto
// ainda — ver historico do bug do "aviao parado"): useMap() dentro do
// FitBoundsTracked so existe DEPOIS do mapa estar pronto de verdade, o
// react-leaflet garante isso.

const POLL_INTERVAL_MS = 15000;
const INITIAL_CENTER: [number, number] = [-23.5505, -46.6333]; // Sao Paulo — mesmo centro do mapa das ambulancias
// Mesmos valores do mapa das ambulancias (Map.tsx) — pedido do usuario,
// 2026-09-02: "adicione as quantidades de zoom do mapa de ambulancias".
// INITIAL_ZOOM bate com o zoom={12} do MapContainer de la; FOCUS_ZOOM com
// VEHICLE_FOCUS_ZOOM (exportado de Map.tsx) — a versao anterior usava o
// equivalente de AIRCRAFT_FOCUS_ZOOM (16), que o usuario achou "muito
// proximo do solo" pra essas aeronaves.
const INITIAL_ZOOM = 12;
const FOCUS_ZOOM = 14;
const ICON_SIZE = 30;

const AIRPLANE_PATH =
  '<path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor" ' +
  'stroke="rgba(2,8,20,0.85)" stroke-width="1.2" stroke-linejoin="round"/>';

// Selecionada = mesmo tamanho das outras, so pulsa (pedido do usuario,
// 2026-09-02: "baseie-se no pulsar do mapa de ambulancias") — nao aumenta
// de tamanho estatico como a 1a versao fazia.
//
// Cor por ALTITUDE (pedido do usuario, 2026-09-02: "mudar a cor do icone e
// do pulsar baseado na altitude tambem") — mesma funcao altitudeColor() ja
// usada no trajeto (AircraftTrail), pra o icone e a linha combinarem. A cor
// e definida INLINE (nao via classe CSS) porque cada aeronave tem sua
// propria altitude; o CSS (.amil-jet-marker svg, .is-active) so cuida do
// glow/pulso, usando currentColor pra sempre acompanhar essa cor sem
// precisar duplicar o calculo la.
//
// Ordem de validacao INVERTIDA a pedido do usuario (2026-09-02): 1o checa
// onGround (pousado -> ambar, --color-status-grounded, MESMO se offline —
// pra "Pouso" sempre aparecer ambar), SO DEPOIS checa isOnline (offline mas
// ainda voando -> cinza). altitudeColor so entra quando esta ONLINE e NAO
// esta no chao.
//
// Squawk de emergencia (R-15, pedido do usuario 2026-09-02) tem prioridade
// sobre TUDO — inclusive offline: se a aeronave sumiu de sinal DURANTE uma
// emergencia, o ultimo squawk conhecido continua no banco (nao e limpo no
// ciclo "nao apareceu", ver trackedAircraft.ts no sync-job), entao o alerta
// deve continuar visivel, nao voltar a cinza.
export const EMERGENCY_SQUAWK_LABELS: Record<string, string> = {
  '7500': 'sequestro',
  '7600': 'falha de radio',
  '7700': 'emergencia geral',
};
export function isEmergencySquawk(squawk: string | null): boolean {
  return squawk != null && squawk in EMERGENCY_SQUAWK_LABELS;
}

function jetMarkerColor(isOnline: boolean, onGround: boolean, altitude: number | null, squawk: string | null): string {
  if (isEmergencySquawk(squawk)) return 'var(--color-alert-400)';
  if (onGround) return 'var(--color-status-grounded)';
  if (!isOnline) return 'var(--color-gray-400)';
  return altitudeColor(altitude);
}

function buildJetIcon(
  trueTrack: number | null,
  altitude: number | null,
  isOnline: boolean,
  onGround: boolean,
  squawk: string | null,
  isActive: boolean,
  // Hover (R-30, pedido do usuario 2026-09-03: "o hover do mouse tambem
  // deve fazer o aviao aumentar de tamanho e pulsar") — classe propria
  // (`.is-hovered`), independente de `isActive` (selecionado): os dois
  // podem coexistir (aviao ja selecionado tambem pode estar em hover).
  isHovered: boolean,
): L.DivIcon {
  const rotation = trueTrack ?? 0;
  const color = jetMarkerColor(isOnline, onGround, altitude, squawk);
  const emergency = isEmergencySquawk(squawk);
  // Aumento de tamanho no hover vai INLINE junto do rotate (nao via CSS
  // animation) — uma animacao CSS de "transform" no SVG substituiria esse
  // rotate (perderia a rotacao), mesmo motivo pelo qual o pulso normal
  // (amil-jet-pulse) so anima "filter", nunca "transform" (ver comentario
  // no CSS). O scale aqui e estatico por render, suavizado por transicao
  // CSS (.amil-jet-marker svg { transition: transform }).
  const scale = isHovered ? 1.3 : 1;
  return L.divIcon({
    className: `amil-jet-marker${isOnline ? '' : ' is-offline'}${isActive ? ' is-active' : ''}${emergency ? ' is-emergency' : ''}${isHovered ? ' is-hovered' : ''}`,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
    html:
      `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}" style="color:${color};transform:rotate(${rotation}deg) scale(${scale})">` +
      AIRPLANE_PATH +
      `</svg>`,
  });
}

// Distancia (em px) que cada linha da mira para de desenhar antes de chegar
// no aviao — pedido do usuario, 2026-09-02: "chegando perto do aviao, uns 10
// pixels eu quero que fiquem invisiveis" (depois aumentado pra 20px).
const CROSSHAIR_GAP_PX = 20;
// Espessura MAXIMA de cada segmento da mira, no ponto mais grosso (perto do
// aviao/vao) — R-34, pedido do usuario 2026-09-03: "as linhas devem começar
// nas bordas bem finas e engrossarem ao se aproximar do avião". A forma
// afinando de verdade e feita via clip-path no CSS (ver
// .amil-crosshair-line-*-{left,right,top,bottom}); esta constante so define
// a caixa (altura/largura) que o clip-path recorta.
const CROSSHAIR_THICKNESS_PX = 4;

// Rotulo ICAO (R-30), 2 segmentos a partir do aviao: diagonal ate um
// vertice, depois horizontal ate o fim, com o texto centralizado ACIMA
// desse trecho horizontal. Invertido pra parte superior ESQUERDA (pedido do
// usuario, 2026-09-04: "coloque a linha ao contrario e na parte superior
// esquerda"), com o angulo da diagonal ajustado de 15° pra 20° (mesmo
// pedido: "aumente/diminua em 5° pois inverteu a direção" — a inversao por
// si so ja muda a leitura visual da inclinacao).
const DIAGONAL_ANGLE_DEG = 20;
// Diagonal reduzida em 1/4 (pedido do usuario, 2026-09-04: "o trecho
// diagonal diminua 1 quarto") — 30 * 0.75 = 22.5.
const LABEL_RISE_PX = 22.5; // altura total do rotulo acima do aviao (define onde o trecho horizontal fica)
const LABEL_START_GAP_PX = 22; // linha NAO comeca no centro do aviao, comeca um pouco pra fora (mesma direcao da diagonal)
// Trecho horizontal voltou a ser um tamanho FIXO, so que maior (pedido do
// usuario, 2026-09-04: "volte o mesmo esquema de tamanho do trecho
// horizontal só deixe ele maior" — a versao dinamica baseada na largura do
// texto foi revertida).
const LABEL_HORIZONTAL_RUN_PX = 220;

const DIAGONAL_ANGLE_RAD = (DIAGONAL_ANGLE_DEG * Math.PI) / 180;
// Negativo em X = espelhado pra ESQUERDA (era positivo/direita antes).
const DIAGONAL_UNIT_X = -Math.cos(DIAGONAL_ANGLE_RAD);
const DIAGONAL_UNIT_Y = -Math.sin(DIAGONAL_ANGLE_RAD); // negativo = pra cima

const LABEL_START_X = DIAGONAL_UNIT_X * LABEL_START_GAP_PX;
const LABEL_START_Y = DIAGONAL_UNIT_Y * LABEL_START_GAP_PX;
// BEND e o ponto onde a diagonal cruza a altura LABEL_RISE_PX — generico
// pra qualquer angulo (nao so 45°, onde dx=dy): BEND_X = RISE / tan(angulo).
// Negativo (espelhado) pelo mesmo motivo do DIAGONAL_UNIT_X acima.
const LABEL_BEND_X = -(LABEL_RISE_PX / Math.tan(DIAGONAL_ANGLE_RAD));
const LABEL_BEND_Y = -LABEL_RISE_PX;

// Geometria do rotulo — trecho horizontal fixo (LABEL_HORIZONTAL_RUN_PX),
// so o texto centraliza em cima dele.
function computeLabelHorizontalGeometry() {
  const run = LABEL_HORIZONTAL_RUN_PX;
  const offsetX = LABEL_BEND_X - run;
  const offsetY = LABEL_BEND_Y;
  const textX = (LABEL_BEND_X + offsetX) / 2;
  return { offsetX, offsetY, textX };
}

// Latitude/longitude em graus decimais com direcao (N/S, L/O) em vez de
// sinal — leitura mais direta pro pedido do usuario, 2026-09-02: "mira no
// mapa... com latitude/longitude pequenininhas do lado das linhas".
function formatLat(lat: number): string {
  return `Lat ${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
}
function formatLon(lon: number): string {
  return `Lon ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'L' : 'O'}`;
}

// Tempo decorrido (R-21) — formato de cronometro digital HH:MM:SS:mmm
// (pedido do usuario, 2026-09-03: era MM:SS:mmm, agora com hora tambem —
// faz sentido, voos comerciais passam facil de 60min). Negativo (relogio do
// navegador levemente atrasado em relacao ao servidor no instante exato da
// decolagem) vira 0, nao numero negativo estranho.
function formatElapsedDigital(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad3(millis)}`;
}

// Componente PROPRIO pro ticker do cronometro — de proposito, pra rodar seu
// proprio setInterval em vez de um estado no AmilJetPage inteiro. Girando a
// cada 50ms (pra os milissegundos rolarem visivelmente, efeito cronometro
// de verdade) dentro do componente PAI re-renderizaria o mapa/SVG inteiros
// 20x por segundo — aqui, so este <span> pequeno re-renderiza. Para de
// ticar sozinho quando a aeronave ja pousou (flightEndedAt preenchido): o
// valor congela, nao precisa de interval nenhum rodando a toa.
function FlightElapsedReadout({
  flightStartedAt,
  flightEndedAt,
}: {
  flightStartedAt: string;
  flightEndedAt: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (flightEndedAt) return;
    const timer = setInterval(() => setNowMs(Date.now()), 50);
    return () => clearInterval(timer);
  }, [flightEndedAt]);

  const startMs = new Date(flightStartedAt).getTime();
  const elapsedMs = flightEndedAt ? new Date(flightEndedAt).getTime() - startMs : nowMs - startMs;

  // "≈" na frente (pedido do usuario, 2026-09-03: "não temos o valor exato")
  // — flightStartedAt vem da 1a leitura REAL que detectou "no ar" (ver
  // resolveFlightTiming em sync-job/src/trackedAircraft.ts), nao do
  // instante exato da decolagem — pode estar ate ~5min atrasado (intervalo
  // de polling enquanto voando) do momento real que as rodas saíram do chao.
  return <span className="amil-flight-elapsed">≈ {formatElapsedDigital(elapsedMs)}</span>;
}

// Linha tracejada ate o destino (R-31 cont., pedido do usuario 2026-09-04:
// "quando a latitude e longitude [do destino existir], coloque uma linha
// branca tracejada que só aparece no avião selecionado e traça uma linha
// entre a aeronave e o destino sempre acompanhando a aeronave"). So existe
// com uma aeronave selecionada E com destino conhecido (adsbdb, R-18) — sem
// as 2 coisas, sem linha. Mesma tecnica de posicionamento em pixel de tela
// do AircraftCrosshair/AmilAircraftLabel (latLngToContainerPoint a cada
// posicao/pan/zoom/resize).
function AmilDestinationLine({ aircraft, hidden }: { aircraft: TrackedAircraft | null; hidden: boolean }) {
  const map = useMap();
  const [points, setPoints] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  const latitude = aircraft?.latitude ?? null;
  const longitude = aircraft?.longitude ?? null;
  const destinationLatitude = aircraft?.destinationLatitude ?? null;
  const destinationLongitude = aircraft?.destinationLongitude ?? null;

  useEffect(() => {
    if (latitude == null || longitude == null || destinationLatitude == null || destinationLongitude == null) {
      setPoints(null);
      return;
    }
    function update() {
      setPoints({
        from: map.latLngToContainerPoint([latitude as number, longitude as number]),
        to: map.latLngToContainerPoint([destinationLatitude as number, destinationLongitude as number]),
      });
    }
    update();
    map.on('move zoom resize', update);
    return () => {
      map.off('move zoom resize', update);
    };
  }, [map, latitude, longitude, destinationLatitude, destinationLongitude]);

  if (!points) return null;

  return (
    <svg className={`amil-destination-line-svg${hidden ? ' is-hidden' : ''}`} aria-hidden="true">
      <line
        x1={points.from.x}
        y1={points.from.y}
        x2={points.to.x}
        y2={points.to.y}
        className="amil-destination-line"
      />
    </svg>
  );
}

// Mira central: linha horizontal + vertical cruzando na posicao da aeronave
// SELECIONADA, com lat/lon do lado de cada linha (R-14). So existe uma
// "a aeronave" quando algo esta selecionado — sem selecao, nenhuma das 4 e
// "a" aeronave, entao a mira fica escondida (mesma logica do topbar, que so
// troca pro nome/dado de uma aeronave especifica apos selecionar).
//
// Posicao em PIXEL de tela, nao em lat/lon: useMap() + latLngToContainerPoint
// converte a cada render. Reage a 3 gatilhos — posicao mudou (dead reckoning,
// 1x/s), OU o mapa moveu/deu zoom (o avio ficou parado mas o pixel dele na
// tela mudou), OU o container mudou de tamanho. Precisa dos 3: só a posicao
// nao pega o usuario arrastando o mapa com a aeronave parada.
function AircraftCrosshair({ aircraft, hidden }: { aircraft: TrackedAircraft | null; hidden: boolean }) {
  const map = useMap();
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  // Tamanho do viewport do mapa — precisa pra calcular width/height EXPLICITOS
  // dos segmentos "right"/"bottom" (em vez de "right:0"/"bottom:0" com
  // largura implicita). Bug real encontrado (2026-09-03): animar uma largura
  // so definida implicitamente (via left+right, sem "width" proprio) com CSS
  // transition faz o navegador interpolar um valor absurdo (varios milhoes
  // de px) no meio da transicao — precisa de width/height EXPLICITOS nos 4
  // segmentos pra R-33 (suavizacao) funcionar direito.
  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null);

  const latitude = aircraft?.latitude ?? null;
  const longitude = aircraft?.longitude ?? null;

  useEffect(() => {
    if (latitude == null || longitude == null) {
      setPoint(null);
      return;
    }
    function update() {
      // latitude/longitude ja checados acima (nao mudam dentro do efeito).
      setPoint(map.latLngToContainerPoint([latitude as number, longitude as number]));
      const size = map.getSize();
      setMapSize({ width: size.x, height: size.y });
    }
    update();
    map.on('move zoom resize', update);
    return () => {
      map.off('move zoom resize', update);
    };
  }, [map, latitude, longitude]);

  if (!point || !mapSize || latitude == null || longitude == null) return null;

  return (
    <div className={`amil-crosshair${hidden ? ' is-hidden' : ''}`} aria-hidden="true">
      {/* As linhas NAO se cruzam por cima do aviao (pedido do usuario,
          2026-09-02) — cada uma vira 2 segmentos, com um vao de
          CROSSHAIR_GAP_PX de cada lado do ponto central. Cada segmento
          agora e um "wedge" (clip-path) que comeca fino na borda da tela e
          engrossa perto do aviao ate sumir no vao (R-34, pedido do
          usuario, 2026-09-03: "linhas... comecar nas bordas bem finas e
          engrossarem ao se aproximar do aviao"). left/top/width/height
          continuam animando via CSS transition (R-33, mesma tecnica do
          R-32 no marcador — ver .amil-crosshair-line-* no CSS). */}
      <div
        className="amil-crosshair-line-h amil-crosshair-line-h-left"
        style={{ top: point.y - CROSSHAIR_THICKNESS_PX / 2, left: 0, width: Math.max(0, point.x - CROSSHAIR_GAP_PX) }}
      />
      <div
        className="amil-crosshair-line-h amil-crosshair-line-h-right"
        style={{
          top: point.y - CROSSHAIR_THICKNESS_PX / 2,
          left: point.x + CROSSHAIR_GAP_PX,
          width: Math.max(0, mapSize.width - (point.x + CROSSHAIR_GAP_PX)),
        }}
      />
      <div
        className="amil-crosshair-line-v amil-crosshair-line-v-top"
        style={{ left: point.x - CROSSHAIR_THICKNESS_PX / 2, top: 0, height: Math.max(0, point.y - CROSSHAIR_GAP_PX) }}
      />
      <div
        className="amil-crosshair-line-v amil-crosshair-line-v-bottom"
        style={{
          left: point.x - CROSSHAIR_THICKNESS_PX / 2,
          top: point.y + CROSSHAIR_GAP_PX,
          height: Math.max(0, mapSize.height - (point.y + CROSSHAIR_GAP_PX)),
        }}
      />
      {/* Coordenada escrita EM CIMA de cada linha (pedido do usuario): lat
          na horizontal, leitura normal — lon na vertical, texto deitado
          (writing-mode), acompanhando a linha vertical. */}
      <span className="amil-crosshair-label-lat" style={{ left: point.x, top: point.y }}>
        {formatLat(latitude)}
      </span>
      <span className="amil-crosshair-label-lon" style={{ left: point.x, top: point.y }}>
        {formatLon(longitude)}
      </span>
    </div>
  );
}

// Rotulo flutuante ICAO24 + matricula ANAC (R-30, pedido do usuario,
// 2026-09-03: "quero que o rotulo apareça na parte superior direita da
// aeronave, sempre seguindo ela junto com os crosshair, e se o avião não
// estiver selecionado deverá aparecer no hover do mouse"). Mesma tecnica de
// posicionamento do AircraftCrosshair (latLngToContainerPoint a cada
// posicao/pan/zoom/resize) — duplicada aqui de proposito em vez de virar
// hook compartilhado: os 2 componentes tem ciclos de vida bem diferentes
// (o crosshair so existe com selecao, este tambem aparece so no hover).
function AmilAircraftLabel({ aircraft }: { aircraft: TrackedAircraft | null }) {
  const map = useMap();
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  const latitude = aircraft?.latitude ?? null;
  const longitude = aircraft?.longitude ?? null;
  const callsign = aircraft?.callsign ?? null;
  const icao24 = aircraft?.icao24 ?? null;

  useEffect(() => {
    if (latitude == null || longitude == null) {
      setPoint(null);
      return;
    }
    function update() {
      setPoint(map.latLngToContainerPoint([latitude as number, longitude as number]));
    }
    update();
    map.on('move zoom resize', update);
    return () => {
      map.off('move zoom resize', update);
    };
  }, [map, latitude, longitude]);

  if (!point || !aircraft || !icao24) return null;

  const { offsetX, offsetY, textX } = computeLabelHorizontalGeometry();

  return (
    <div className="amil-aircraft-label" style={{ left: point.x, top: point.y }} aria-hidden="true">
      {/* So texto, sem card/fundo. Linha em 2 segmentos (pedido do usuario,
          2026-09-03): comeca um pouco AFASTADA do centro do aviao, sobe na
          diagonal, e "desvia pra horizontal" servindo de linha embaixo do
          texto — branca, brilho sutil. */}
      <svg className="amil-aircraft-label-leader-svg" aria-hidden="true">
        <polyline
          points={`${LABEL_START_X},${LABEL_START_Y} ${LABEL_BEND_X},${LABEL_BEND_Y} ${offsetX},${offsetY}`}
          className="amil-aircraft-label-leader-line"
          fill="none"
        />
      </svg>
      <span className="amil-aircraft-label-dot" style={{ left: offsetX, top: offsetY }} />
      {/* Formato "outro-codigo: ICAO24" (pedido do usuario, 2026-09-04,
          exemplo: "GLO7641: E49EF1") — callsign em NEGRITO, ICAO24 em peso
          normal. Sem callsign (nulo), so o ICAO24 aparece. Centralizado
          ACIMA do trecho horizontal. */}
      <span className="amil-aircraft-label-text" style={{ left: textX, top: offsetY }}>
        {callsign ? (
          <>
            <strong>{callsign}</strong>: {icao24.toUpperCase()}
          </>
        ) : (
          icao24.toUpperCase()
        )}
      </span>
    </div>
  );
}

function fitToTrackedAircraft(map: LeafletMap, aircraft: TrackedAircraft[]): void {
  const points = aircraft.filter((a) => a.latitude != null && a.longitude != null);
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setView([points[0].latitude as number, points[0].longitude as number], FOCUS_ZOOM);
    return;
  }
  const bounds: LatLngBoundsExpression = points.map((a) => [a.latitude as number, a.longitude as number]);
  map.fitBounds(bounds, { padding: [60, 60] });
}

// Mesmo padrao do FitBounds em Map.tsx: so ajusta o zoom UMA vez, na 1a vez
// que os dados chegam — depois disso o usuario controla o mapa livremente.
// useMap() so funciona dentro do MapContainer, o que garante que o mapa ja
// esta pronto de verdade (nao depende de mapRef.current ter sido preenchido
// a tempo, como a versao antiga desta pagina dependia).
function FitBoundsTracked({ aircraft }: { aircraft: TrackedAircraft[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current) return;
    if (aircraft.filter((a) => a.latitude != null && a.longitude != null).length === 0) return;
    fitToTrackedAircraft(map, aircraft);
    hasFitted.current = true;
  }, [aircraft, map]);

  return null;
}

// Quanto tempo a camera fica "solta" depois que o usuario arrasta o mapa na
// mao, antes de voltar a travar sozinha no aviao (pedido do usuario,
// 2026-09-03: "ao arrastar o mapa nao volte pra camera travada, so depois
// de 30 segundos").
const CAMERA_LOCK_RESUME_MS = 30_000;

// Camera travada no avião selecionado (R-29, pedido do usuário, 2026-09-03:
// "coloque a câmera travada no avião" — item 2 da lista de redesenho de
// layout). O flyTo do useMapSelection só centraliza NO MOMENTO do clique;
// depois disso o avião pode andar pra fora da tela (posição estimada muda a
// cada 1s via useDeadReckoning). Este componente reage a CADA mudança de
// lat/lon do selecionado e usa panTo (sem mudar zoom) pra manter a câmera
// sempre em cima dele — animado, não um salto/snap.
//
// Ignora ENQUANTO isFocusing é true — nesse momento o flyTo inicial já está
// levando a câmera pro alvo com sua própria animação/zoom; um panTo
// concorrente aqui brigaria com ele.
//
// Tambem escuta "dragstart" (so dispara em arrasto do USUARIO, nunca em
// panTo/flyTo programatico) pra pausar o travamento por 30s, e renderiza um
// botao proprio de recentralizar (Leaflet control, mesmo canto do zoom) que
// forca a volta imediata + destrava.
function CameraFollowSelected({
  latitude,
  longitude,
  isFocusing,
}: {
  latitude: number | null;
  longitude: number | null;
  isFocusing: boolean;
}) {
  const map = useMap();
  const pausedUntilRef = useRef(0);
  const targetRef = useRef<{ latitude: number | null; longitude: number | null }>({ latitude, longitude });
  targetRef.current = { latitude, longitude };

  // Arrasto manual pausa o travamento — dragstart do Leaflet so dispara em
  // interacao real do usuario (mousedown+move / touch), nunca em panTo ou
  // flyTo chamados pelo codigo.
  useEffect(() => {
    const handleDragStart = () => {
      pausedUntilRef.current = Date.now() + CAMERA_LOCK_RESUME_MS;
    };
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map]);

  useEffect(() => {
    if (isFocusing) return;
    if (latitude == null || longitude == null) return;
    if (Date.now() < pausedUntilRef.current) return;
    map.panTo([latitude, longitude], { animate: true, duration: 1, easeLinearity: 0.4 });
  }, [map, latitude, longitude, isFocusing]);

  // Botao de recentralizar — mesmo canto do zoom (bottomright), pedido do
  // usuario 2026-09-03: "adicione um botao de centralizar... que recentraliza
  // no aviao e trava a camera". L.control() imperativo (nao ha componente
  // declarativo pra controle customizado no react-leaflet) — instanciado 1x,
  // o clique sempre le a posicao mais recente via targetRef (nao fecha sobre
  // um valor velho).
  useEffect(() => {
    const RecenterControl = L.Control.extend({
      onAdd() {
        const button = L.DomUtil.create('a', 'amil-recenter-control') as HTMLAnchorElement;
        button.href = '#';
        button.title = 'Recentralizar no avião';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Recentralizar no avião');
        button.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.preventDefault(event);
          pausedUntilRef.current = 0;
          const target = targetRef.current;
          if (target.latitude != null && target.longitude != null) {
            map.panTo([target.latitude, target.longitude], { animate: true, duration: 0.8 });
          }
        });
        return button;
      },
    });
    const control = new RecenterControl({ position: 'bottomright' });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}

export default function AmilJetPage() {
  const mapRef = useRef<LeafletMap | null>(null);
  const breakpoint = useBreakpoint();
  const [aircraftList, setAircraftList] = useState<TrackedAircraft[]>([]);

  // Log de atividade (pedido do usuario, 2026-09-09) — recordPoll/
  // setSelectedId sao ESTAVEIS (useCallback com deps vazias, ver o hook),
  // entao usa-los como dependencia do efeito de poll logo abaixo nao o
  // reinicia a cada render/selecao.
  const { entries: activityLogEntries, recordPoll, setSelectedId: setActivityLogSelectedId } = useAircraftActivityLog();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(apiUrl('/api/tracked-aircraft'));
        const rows: TrackedAircraft[] = await response.json();
        if (!cancelled) {
          setAircraftList(rows);
          recordPoll(rows);
        }
      } catch (error) {
        console.error('Erro ao buscar aeronaves monitoradas:', error);
        if (!cancelled) recordPoll(null);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [recordPoll]);

  // Posicao estimada a cada 1s entre uma busca real e outra — mesma tecnica
  // do mapa das ambulancias (useDeadReckoning.ts), generalizada pra reusar
  // aqui. So a posicao desenhada muda; o resto (altitude, velocidade,
  // isOnline etc.) continua vindo do ultimo poll real.
  //
  // Teto de extrapolacao ESTENDIDO pra 30min (pedido do usuario, 2026-09-02:
  // "no caso de ela ficar offline deve continuar usando o dead reckoning") —
  // o default de 15min (pensado pro mapa generico, que rebusca fixo de 5 em
  // 5 min) congelava o marcador quase junto com o isOnline virando false,
  // porque aeronaves especificas so sao rebuscadas de ate 15 em 15 min
  // quando paradas (ver TRACKED_AIRCRAFT_IDLE_SYNC_INTERVAL_MS). 30min da
  // folga pra pelo menos 2 ciclos de rebusca antes de congelar de vez.
  const liveAircraft = useDeadReckoning(aircraftList, 30 * 60);

  // useCallback NAO e otimizacao aqui, e correcao de bug — ver o mesmo
  // comentario em Map.tsx: sem isso, o efeito de busca de trajeto dentro de
  // useMapSelection vira um laco (funcao nova a cada render -> refetch ->
  // setTrail -> re-render -> funcao nova...).
  const historyUrl = useCallback((id: number) => apiUrl(`/api/tracked-aircraft/${id}/history`), []);

  const selection = useMapSelection({
    mapRef,
    breakpoint,
    entities: liveAircraft,
    historyUrl,
    focusZoom: FOCUS_ZOOM,
  });

  // Avisa o log de atividade sempre que a selecao mudar — ele reseta o
  // historico sozinho quando o id muda (ver setSelectedId no hook).
  useEffect(() => {
    setActivityLogSelectedId(selection.selectedId);
  }, [selection.selectedId, setActivityLogSelectedId]);

  // SEM auto-selecao no carregamento, de proposito (corrigido apos teste,
  // 2026-09-02) — igual ao mapa das ambulancias: no inicio, ninguem esta
  // selecionado, o mapa so mostra todas as aeronaves encaixadas na tela
  // (FitBoundsTracked). Auto-selecionar a 1a brigava com isso: o flyTo da
  // selecao vencia o fitBounds e a pagina abria zoom em 1 avio so, escondendo
  // os outros 3 — o oposto do que "mostrar todas" pede.
  //
  // EXCECAO (pedido do usuario, 2026-09-09): "?icao24=" na URL — usado pelo
  // popup de alerta do Command Center (P-D2/P-D6), que embute esta pagina
  // via iframe e precisa que ela "já entre selecionando uma aeronave", a
  // mesma do alerta. So NESSE caso a auto-selecao acontece — e o
  // FitBoundsTracked correspondente e' DESLIGADO (ver JSX abaixo), removendo
  // exatamente a briga que motivou a decisao original de nao auto-selecionar.
  const icao24Param = useMemo(
    () => new URLSearchParams(window.location.search).get('icao24')?.toLowerCase() || null,
    []
  );
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!icao24Param || hasAutoSelectedRef.current) return;
    const match = liveAircraft.find((a) => a.icao24?.toLowerCase() === icao24Param);
    if (match) {
      hasAutoSelectedRef.current = true;
      void selection.select(match.id);
    }
  }, [icao24Param, liveAircraft, selection]);

  const selected = selection.selected;
  const rawStage = selected?.stage ?? null;
  const stage = isStage(rawStage) ? rawStage : null;

  // Hover (R-30, pedido do usuario 2026-09-03: "se o aviao nao estiver
  // selecionado deve aparecer no hover do mouse") — so usado pro
  // rotulo/aumento de tamanho de aeronaves NAO selecionadas; a selecionada
  // ja mostra o rotulo sempre, sem depender de hover.
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const hovered =
    hoveredId != null && hoveredId !== selection.selectedId ? liveAircraft.find((a) => a.id === hoveredId) ?? null : null;

  return (
    <div className="amil-page">
      {/* Moldura decorativa (pedido do usuario, 2026-09-03, referencia
          visual fornecida) — SEMPRE visivel, nao depende de selecao. */}
      <AmilSideTicks side="left" />
      <AmilSideTicks side="right" />
      {/* Fade preto nas laterais, cobrindo os tracos, mesmo estilo do fade
          da topbar (pedido do usuario, 2026-09-03: "existe uma topbar com
          fade preto... preciso que isso exista nas laterais tambem cobrindo
          os tracos"). */}
      <div className="amil-side-fade amil-side-fade-left" aria-hidden="true" />
      <div className="amil-side-fade amil-side-fade-right" aria-hidden="true" />
      {/* Fade do topo, separado do .amil-topbar (pedido do usuario,
          2026-09-03: "o fade do topo deve estar no mesmo nivel do fade
          lateral") — antes era o proprio background do topbar, na camada
          hud; agora e um elemento decorativo proprio, atras dos tracos
          igual o fade lateral, com o conteudo da topbar por cima dele. */}
      <div className="amil-top-fade" aria-hidden="true" />

      <header className="amil-topbar">
        {/* Botao de frota removido do topbar (pedido do usuario,
            2026-09-04: "remova o botão de frota do topo esquerdo"). O badge
            "ao vivo" continua (unico sinal de que os dados ainda estao
            chegando) e o banner de emergencia tambem. */}
        {selected && isEmergencySquawk(selected.squawk) && (
          <div className="amil-emergency-banner" role="alert">
            🚨 SQUAWK {selected.squawk} — {EMERGENCY_SQUAWK_LABELS[selected.squawk as string].toUpperCase()}
          </div>
        )}
        <div className="amil-topbar-status">
          {selected?.isOnline ? (
            <div className="status-badge text-body-sm-medium font-body">
              <span className="live-dot" />
              ao vivo
            </div>
          ) : selected ? (
            <span className="amil-status-badge">
              última posição conhecida{selected.lastSeenAt ? ` · ${formatLastSeen(selected.lastSeenAt)}` : ''}
            </span>
          ) : null}
        </div>
      </header>

      <div className="amil-map-stage">
        <MapContainer
          ref={mapRef}
          center={INITIAL_CENTER}
          zoom={INITIAL_ZOOM}
          attributionControl={false}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            className="map-tiles map-tiles-executive"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            className="map-tiles map-tiles-executive"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          />
          <ZoomControl position="bottomright" />
          {!icao24Param && <FitBoundsTracked aircraft={liveAircraft} />}
          {selection.selectedId != null && (
            // key={selectedId} forca REMONTAR ao trocar de aviao selecionado
            // (pedido do usuario, 2026-09-03: "quando selecionar o aviao deve
            // entrar no modo camera travada automaticamente") — sem isso a
            // pausa de 30s de um arrasto manual em CIMA do aviao anterior
            // continuava valendo pro aviao novo selecionado (o componente so
            // reage a mudanca de posicao, nao de ID; sem remontar, o ref de
            // pausa sobrevivia a troca de selecao).
            <CameraFollowSelected
              key={selection.selectedId}
              latitude={selected?.latitude ?? null}
              longitude={selected?.longitude ?? null}
              isFocusing={selection.isFocusing}
            />
          )}

          {liveAircraft
            .filter((a) => a.latitude != null && a.longitude != null)
            .map((a) => (
              <Marker
                key={a.id}
                position={[a.latitude as number, a.longitude as number]}
                icon={buildJetIcon(
                  a.trueTrack,
                  a.altitude,
                  a.isOnline,
                  a.onGround,
                  a.squawk,
                  a.id === selection.selectedId,
                  a.id === hoveredId,
                )}
                opacity={selection.isFocusing ? 0 : 1}
                // O selecionado sempre por cima dos outros (pedido do
                // usuario, 2026-09-03) — o Leaflet calcula z-index de marcador
                // automaticamente pela latitude (mais ao sul = mais alto), o
                // que podia deixar o selecionado atras de outro avio mais ao
                // sul dele. zIndexOffset forca ele pra cima independente da
                // posicao.
                zIndexOffset={a.id === selection.selectedId ? 1000 : 0}
                eventHandlers={{
                  click: () => selection.handleMarkerClick(a.id),
                  mouseover: () => setHoveredId(a.id),
                  mouseout: () => setHoveredId((id) => (id === a.id ? null : id)),
                }}
              />
            ))}

          {selection.trail && selection.selectedId != null && (
            // Mesmo padrao de Map.tsx: colorido pela altitude ao longo do
            // caminho (ver AircraftTrail), com o ULTIMO ponto sendo a posicao
            // ESTIMADA do marcador neste segundo (dead reckoning), nao o
            // ultimo ponto do historico — sem isso a linha ficaria sempre
            // atrasada em relacao ao aviao, que se move a cada segundo
            // mas o historico so grava a cada ciclo do sync-job.
            <AircraftTrail
              points={[
                ...selection.trail,
                ...(selected?.latitude != null && selected?.longitude != null
                  ? [
                      {
                        latitude: selected.latitude,
                        longitude: selected.longitude,
                        altitude: selected.altitude,
                        positionAt: 'live',
                      },
                    ]
                  : []),
              ]}
              isFocusing={selection.isFocusing}
            />
          )}

          <AircraftCrosshair aircraft={selected} hidden={selection.isFocusing} />
          <AmilDestinationLine aircraft={selected} hidden={selection.isFocusing} />
          {/* Rotulo ICAO+ANAC (R-30) — o selecionado sempre mostra o dele;
              qualquer OUTRO em hover mostra tambem, temporariamente. */}
          {selected && !selection.isFocusing && <AmilAircraftLabel aircraft={selected} />}
          {hovered && <AmilAircraftLabel aircraft={hovered} />}
        </MapContainer>
      </div>

      {/* So existe com uma aeronave selecionada, sobe/desce suave ao
          selecionar/deselecionar (pedido do usuario, 2026-09-03) — mesma
          biblioteca (motion) e o mesmo padrao de spring ja usados no resto
          do projeto (ver SidebarShell.tsx). AnimatePresence precisa envolver
          o ponto onde o item entra/sai do DOM pra rodar o "exit" antes de
          desmontar. */}
      <AnimatePresence>
        {selection.selectedId != null && (
          <motion.div
            key="arc-dock"
            className="amil-arc-dock"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Componentes SEPARADOS de proposito (pedido do usuario,
                2026-09-02): o fundo circular vivia dentro do mesmo SVG do
                arco antes, e a bounding box do arco (.amil-arc-viewport,
                overflow:hidden + mask-image) cortava o fade do circulo
                tambem. Como irmaos aqui, nao dentro um do outro, o fundo
                nunca sofre esse recorte. */}
            {/* Escala o trio (fundo do arco + fundo da bussola + arco/bussola
                em si) como um bloco RIGIDO so — os 3 tem geometria
                hand-calibrada entre si (numeros fixos em px, ver
                AmilTimelineArc.tsx/index.css), entao precisam encolher
                juntos, na mesma proporcao, pra nao desalinhar. O cronometro
                logo abaixo fica DE FORA de proposito (nao faz parte do
                pedido do usuario de encolher "bussola/linha do tempo"). */}
            <div className="amil-arc-scaler">
              <AmilArcBackdrop />
              <AmilCompassBackdrop />
              <AmilTimelineArc stage={stage} heading={selected?.trueTrack ?? null} />
            </div>
            {/* Cronometro de tempo de voo (R-21) — movido do topbar pra
                aqui, embaixo da bussola, centralizado na area de
                instrumentos (pedido do usuario, 2026-09-03). So aparece
                quando ha decolagem CONFIRMADA registrada (flightStartedAt
                null se nunca vimos ela decolar). */}
            {selected?.flightStartedAt && (
              <div className="amil-arc-flight-elapsed">
                <small>{selected.flightEndedAt ? 'Último voo' : 'Tempo de voo'}</small>
                <FlightElapsedReadout flightStartedAt={selected.flightStartedAt} flightEndedAt={selected.flightEndedAt} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Altimetro (R-25) — mesma regra de so existir com selecao, mas
          desliza da DIREITA (nao de baixo, como o arco/bussola) — fica no
          canto inferior direito (reorganizacao geral, pedido do usuario
          2026-09-03: "direita = informacoes de voo e indicadores"). */}
      <AnimatePresence>
        {selection.selectedId != null && selected && (
          <motion.div
            key="altitude-tower"
            className="amil-altitude-dock"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <AmilAltitudeTower
              altitude={selected?.altitude ?? null}
              verticalRate={selected?.verticalRate ?? null}
              onGround={selected?.onGround ?? false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paineis do lado ESQUERDO (R-31) — metadados + informacoes de voo
          empilhados no mesmo grupo animado (pedido do usuario, 2026-09-04:
          "obviamente seria a esquerda" — o painel novo tinha ido pro lado
          errado, o altimetro (instrumento visual, nao card de dados)
          continua sozinho a direita). Mesmo padrao de animacao/selecao do
          altimetro, espelhado (desliza da esquerda). */}
      <AnimatePresence>
        {selection.selectedId != null && selected && (
          <motion.div
            key="metadata-panel"
            className="amil-metadata-dock"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <AmilAircraftHeaderPanel
              aircraft={selected}
              allAircraft={liveAircraft}
              onSelectAircraft={selection.handleMarkerClick}
              onNext={selection.focusNext}
            />
            <AmilMetadataPanel aircraft={selected} />
            <AmilFlightInfoPanel aircraft={selected} />
            <AmilActivityLog entries={activityLogEntries} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
