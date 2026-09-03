import { useCallback, useEffect, useRef, useState } from 'react';
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
import AmilTimelineArc from './AmilTimelineArc';
import AmilArcBackdrop from './AmilArcBackdrop';
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
): L.DivIcon {
  const rotation = trueTrack ?? 0;
  const color = jetMarkerColor(isOnline, onGround, altitude, squawk);
  const emergency = isEmergencySquawk(squawk);
  return L.divIcon({
    className: `amil-jet-marker${isOnline ? '' : ' is-offline'}${isActive ? ' is-active' : ''}${emergency ? ' is-emergency' : ''}`,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
    html:
      `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}" style="color:${color};transform:rotate(${rotation}deg)">` +
      AIRPLANE_PATH +
      `</svg>`,
  });
}

// Distancia (em px) que cada linha da mira para de desenhar antes de chegar
// no aviao — pedido do usuario, 2026-09-02: "chegando perto do aviao, uns 10
// pixels eu quero que fiquem invisiveis" (depois aumentado pra 20px).
const CROSSHAIR_GAP_PX = 20;

// Latitude/longitude em graus decimais com direcao (N/S, L/O) em vez de
// sinal — leitura mais direta pro pedido do usuario, 2026-09-02: "mira no
// mapa... com latitude/longitude pequenininhas do lado das linhas".
function formatLat(lat: number): string {
  return `Lat ${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
}
function formatLon(lon: number): string {
  return `Lon ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'L' : 'O'}`;
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
    }
    update();
    map.on('move zoom resize', update);
    return () => {
      map.off('move zoom resize', update);
    };
  }, [map, latitude, longitude]);

  if (!point || latitude == null || longitude == null) return null;

  return (
    <div className={`amil-crosshair${hidden ? ' is-hidden' : ''}`} aria-hidden="true">
      {/* As linhas NAO se cruzam por cima do aviao (pedido do usuario,
          2026-09-02) — cada uma vira 2 segmentos, com um vao de
          CROSSHAIR_GAP_PX de cada lado do ponto central. */}
      <div className="amil-crosshair-line-h" style={{ top: point.y, left: 0, width: Math.max(0, point.x - CROSSHAIR_GAP_PX) }} />
      <div
        className="amil-crosshair-line-h"
        style={{ top: point.y, left: point.x + CROSSHAIR_GAP_PX, right: 0 }}
      />
      <div className="amil-crosshair-line-v" style={{ left: point.x, top: 0, height: Math.max(0, point.y - CROSSHAIR_GAP_PX) }} />
      <div
        className="amil-crosshair-line-v"
        style={{ left: point.x, top: point.y + CROSSHAIR_GAP_PX, bottom: 0 }}
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

export default function AmilJetPage() {
  const mapRef = useRef<LeafletMap | null>(null);
  const breakpoint = useBreakpoint();
  const [aircraftList, setAircraftList] = useState<TrackedAircraft[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(apiUrl('/api/tracked-aircraft'));
        const rows: TrackedAircraft[] = await response.json();
        if (!cancelled) setAircraftList(rows);
      } catch (error) {
        console.error('Erro ao buscar aeronaves monitoradas:', error);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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

  // SEM auto-selecao no carregamento, de proposito (corrigido apos teste,
  // 2026-09-02) — igual ao mapa das ambulancias: no inicio, ninguem esta
  // selecionado, o mapa so mostra todas as aeronaves encaixadas na tela
  // (FitBoundsTracked). Auto-selecionar a 1a brigava com isso: o flyTo da
  // selecao vencia o fitBounds e a pagina abria zoom em 1 avio so, escondendo
  // os outros 3 — o oposto do que "mostrar todas" pede.
  const selected = selection.selected;
  const rawStage = selected?.stage ?? null;
  const stage = isStage(rawStage) ? rawStage : null;

  return (
    <div className="amil-page">
      <header className="amil-topbar">
        <div className="amil-topbar-identity">
          <div>
            <strong>{selected ? trackedAircraftName(selected) : 'Aviação executiva'}</strong>
            <small>{selected ? selected.icao24.toUpperCase() : `${liveAircraft.length} aeronaves`}</small>
          </div>
        </div>
        {/* Alerta de squawk de emergencia (R-15) — so quando a SELECIONADA
            esta emitindo um dos 3 codigos universais. flex-basis:100% no
            .amil-topbar (flex-wrap: wrap) forca essa linha pra baixo das
            outras, ocupando a largura toda, sem bagunçar o layout normal
            quando nao ha emergencia (elemento nem existe no DOM nesse caso).
            O marcador no mapa (buildJetIcon/jetMarkerColor) ja alerta
            mesmo SEM selecionar — isso aqui e o detalhe (codigo + o que
            significa) de quem esta selecionada. */}
        {selected && isEmergencySquawk(selected.squawk) && (
          <div className="amil-emergency-banner" role="alert">
            🚨 SQUAWK {selected.squawk} — {EMERGENCY_SQUAWK_LABELS[selected.squawk as string].toUpperCase()}
          </div>
        )}
        {/* Metricas do lado da identidade, na ESQUERDA da tela (pedido do
            usuario, 2026-09-02: "jogue todas essa infos para a esquerda") —
            antes ficavam depois do badge de status, que empurra tudo que vem
            depois dele pra direita (margin-left:auto). Trocando a ordem no
            JSX pra metrics vir ANTES do status, so o status continua indo
            pra direita — identidade + metricas ficam juntas na esquerda. */}
        <div className="amil-topbar-metrics">
          <span>
            <small>Altitude</small>
            {formatAltitude(selected?.altitude ?? null)}
          </span>
          <span>
            <small>Velocidade</small>
            {formatVelocity(selected?.velocity ?? null)}
          </span>
          <span>
            <small>Rumo</small>
            {formatTrack(selected?.trueTrack ?? null)}
          </span>
          <span>
            <small>Taxa vertical</small>
            {formatVerticalRate(selected?.verticalRate ?? null)}
          </span>
        </div>
        <div className="amil-topbar-status">
          {selected?.isOnline ? (
            // Mesmo badge/ponto pulsante do mapa das ambulancias (TrackingPage.tsx:
            // .status-badge + .live-dot) — pedido do usuario (R-09): "ao vivo" igual
            // nos dois mapas, em vez do badge proprio que existia aqui antes.
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
          <FitBoundsTracked aircraft={liveAircraft} />

          {liveAircraft
            .filter((a) => a.latitude != null && a.longitude != null)
            .map((a) => (
              <Marker
                key={a.id}
                position={[a.latitude as number, a.longitude as number]}
                icon={buildJetIcon(a.trueTrack, a.altitude, a.isOnline, a.onGround, a.squawk, a.id === selection.selectedId)}
                opacity={selection.isFocusing ? 0 : 1}
                eventHandlers={{ click: () => selection.handleMarkerClick(a.id) }}
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
        </MapContainer>
      </div>

      <div className="amil-arc-dock">
        {/* Componentes SEPARADOS de proposito (pedido do usuario, 2026-09-02):
            o fundo circular vivia dentro do mesmo SVG do arco antes, e a
            bounding box do arco (.amil-arc-viewport, overflow:hidden +
            mask-image) cortava o fade do circulo tambem. Como irmaos aqui,
            nao dentro um do outro, o fundo nunca sofre esse recorte. */}
        <AmilArcBackdrop />
        <AmilTimelineArc stage={stage} aircraftLabel={selected ? trackedAircraftName(selected) : '—'} />
      </div>
    </div>
  );
}
