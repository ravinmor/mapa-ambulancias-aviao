import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, ZoomControl, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import type { Aircraft, AircraftSnapshotMessage, Mission, Vehicle, SnapshotMessage } from './types';
import VehicleSidebar from './VehicleSidebar';
import AircraftSidebar from './AircraftSidebar';
import AircraftMarkers from './AircraftMarkers';
import AircraftTrail from './AircraftTrail';
import MissionTimeline from './MissionTimeline';
import VehicleFilters, { ALL, filterVehicles } from './VehicleFilters';
import MissionStatsCards from './MissionStatsCards';
import type { DisplayMode } from './VehicleFilters';
import { useBreakpoint } from './useBreakpoint';
import { useDeadReckoning } from './useDeadReckoning';
import { useMapSelection } from './useMapSelection';
import { pickHelicopterIcaos } from './vehiclePhotos';
import { statusColorVar, statusPulseClass } from './vehicleStatus';
import { apiUrl } from './api';
import { basemapLayers, basemapTileClassName } from './basemap';

const INITIAL_CENTER: [number, number] = [-23.5505, -46.6333];
const CINEMA_INTERVAL_MS = 8_000;

function CinemaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 5.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M1.5 5.5 3 2.5h2l-1.3 3M6.7 5.5 8 2.5h2l-1.3 3M11.8 5.5l1.3-3h1.4l-1.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
// Aproxima ate o nivel da rua ao selecionar. Aeronave usa o MESMO zoom da van
// (pedido explicito do usuario: "funcionar igual na van").
export const VEHICLE_FOCUS_ZOOM = 16;
const AIRCRAFT_FOCUS_ZOOM = 16;

function areVehicleSnapshotsEqual(a: Vehicle[], b: Vehicle[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((vehicle, index) => {
    const other = b[index];
    return (
      other != null &&
      vehicle.id === other.id &&
      vehicle.name === other.name &&
      vehicle.status === other.status &&
      vehicle.latitude === other.latitude &&
      vehicle.longitude === other.longitude &&
      vehicle.updatedAt === other.updatedAt
    );
  });
}

// Mesma ideia do comparador das vans: evita re-render (e recriacao de icone
// em 10 marcadores) quando o snapshot chega igual ao anterior — o que e o
// caso comum, ja que o dado so muda a cada 5 minutos mas o SSE reemite a
// cada 30s.
function areAircraftSnapshotsEqual(a: Aircraft[], b: Aircraft[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((aircraft, index) => {
    const other = b[index];
    return (
      other != null &&
      aircraft.id === other.id &&
      aircraft.latitude === other.latitude &&
      aircraft.longitude === other.longitude &&
      aircraft.altitude === other.altitude &&
      aircraft.trueTrack === other.trueTrack &&
      aircraft.positionAt === other.positionAt
    );
  });
}

function fitToFleet(map: LeafletMap, vehicles: Vehicle[]): void {
  const points = vehicles.filter((v) => v.latitude != null && v.longitude != null);
  if (points.length === 0) return;
  const bounds: LatLngBoundsExpression = points.map((v) => [v.latitude as number, v.longitude as number]);
  map.fitBounds(bounds, { padding: [40, 40] });
}

function markerClassName(status: string | null, isActive: boolean): string {
  const base = `vehicle-marker ${statusPulseClass(status)}`;
  return isActive ? `${base} is-active` : base;
}

// Ajusta o zoom pra caber a frota inteira, só na primeira vez que os dados chegam —
// depois disso o usuário controla o zoom/posição do mapa livremente.
function FitBounds({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current) return;
    if (vehicles.filter((v) => v.latitude != null && v.longitude != null).length === 0) return;
    fitToFleet(map, vehicles);
    hasFitted.current = true;
  }, [vehicles, map]);

  return null;
}

const VehicleMarkers = memo(function VehicleMarkers({
  vehicles,
  breakpoint,
  selectedVehicleId,
  isFocusing,
  onMarkerClick,
}: {
  vehicles: Vehicle[];
  breakpoint: ReturnType<typeof useBreakpoint>;
  selectedVehicleId: number | null;
  isFocusing: boolean;
  onMarkerClick: (vehicleId: number) => void;
}) {
  // Pulso agora e por interacao (hover ou selecionada), nao mais "sempre que
  // o status for X" — precisa de estado proprio de hover (mouseover/mouseout
  // do Leaflet), independente da selecao que ja vem do componente pai.
  const [hoveredVehicleId, setHoveredVehicleId] = useState<number | null>(null);

  return (
    <>
      {vehicles
        .filter((v) => v.latitude != null && v.longitude != null)
        .map((v) => {
          const isActive = v.id === hoveredVehicleId || v.id === selectedVehicleId;
          return (
            <CircleMarker
              // Leaflet so aplica CLASSNAME na criacao do path (_initPath) —
              // "@react-leaflet/core" aplica pathOptions inteiro via
              // setStyle() num useEffect, que atualiza cor/opacidade mas
              // NUNCA toca a classe do DOM (bug real da lib, confirmado no
              // codigo fonte: usePathOptions em path.js). Por isso className
              // fica FORA de pathOptions, como prop de nivel superior do
              // CircleMarker — assim o React-Leaflet passa ela direto pro
              // construtor do Leaflet, de onde _initPath consegue ler.
              // Incluir isActive na key forca o React a desmontar/remontar o
              // marker quando hover/selecao muda — unico jeito de trocar a
              // classe em runtime, ja que setStyle nunca reaplica ela.
              key={`${v.id}-${isActive}`}
              className={markerClassName(v.status, isActive)}
              center={[v.latitude as number, v.longitude as number]}
              radius={8}
              pathOptions={{
                color: statusColorVar(v.status),
                fillColor: statusColorVar(v.status),
                // CircleMarker tem raio fixo em pixel — durante o flyTo o
                // Leaflet escala visualmente o overlay-pane inteiro junto
                // com a animacao de zoom (certo pra um passo pequeno de
                // zoom, mas explode num salto grande tipo o FOCUS_ZOOM,
                // fazendo o circulo parecer crescer cobrindo a tela). Some
                // durante o voo (opacity/fillOpacity 0, reage a mudanca de
                // prop sem remount) e reaparece sozinho no moveend.
                opacity: isFocusing ? 0 : 1,
                fillOpacity: isFocusing ? 0 : 0.9,
              }}
              eventHandlers={{
                click: () => onMarkerClick(v.id),
                mouseover: () => setHoveredVehicleId(v.id),
                mouseout: () => setHoveredVehicleId((current) => (current === v.id ? null : current)),
              }}
            >
              {breakpoint !== 'mobile' && (
                <Tooltip direction="right" offset={[12, 0]} className="marker-label text-body-sm-semibold font-body">
                  {v.name}
                </Tooltip>
              )}
            </CircleMarker>
          );
        })}
    </>
  );
});

export default function Map() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [status, setStatus] = useState('conectando...');
  // Filtros vivem aqui (nao no componente de filtro) porque o resultado
  // filtrado alimenta tanto os marcadores do mapa quanto o seletor e o
  // botao "proximo" da sidebar.
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [stateFilter, setStateFilter] = useState<string>(ALL);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('all');
  const [mission, setMission] = useState<Mission | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const breakpoint = useBreakpoint();

  const showVehicles = displayMode !== 'aircraft';
  const showAircraft = displayMode !== 'vehicles';

  const filteredVehicles = showVehicles ? filterVehicles(vehicles, statusFilter, stateFilter) : [];

  // A posicao desenhada da aeronave e recalculada a cada segundo a partir da
  // ultima medicao + velocidade + rumo (ver useDeadReckoning). O dado real
  // continua chegando no ritmo do sync-job; o que muda de 1 em 1 segundo e a
  // estimativa entre uma medicao e outra.
  const liveAircraft = useDeadReckoning(aircraft);
  const visibleAircraft = showAircraft ? liveAircraft : [];

  // Sorteio de quais 2 aeronaves (1 SP + 1 RJ) viram "helicoptero" pra
  // efeito visual (foto + icone no mapa). Chave do memo e o CONJUNTO de
  // icao24 rastreados (ordenado, unido em string), nao o array `aircraft`
  // direto — senao recalcularia a cada segundo (navegacao estimada muda
  // lat/lon) ou a cada broadcast (30s), reembaralhando o sorteio toda hora.
  // So recalcula quando uma aeronave entra/sai da lista rastreada. Baseado
  // no `aircraft` cru (nao filtrado por displayMode), pra alternar o filtro
  // "Exibir" nao mudar quem e helicoptero.
  const trackedIcaoKey = [...aircraft].map((a) => a.icao24).sort().join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const helicopterIcaos = useMemo(() => pickHelicopterIcaos(aircraft), [trackedIcaoKey]);

  // Duas conexoes SSE, uma por pipeline (ver PLANO_Aeronaves_MapaAmbulancias.md):
  // cadencias muito diferentes (5s x 30s) e falhas independentes — um erro na
  // consulta de aeronave nao pode derrubar o mapa das ambulancias.
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/vehicles/stream'));

    es.onopen = () => setStatus('ao vivo');
    es.onerror = () => setStatus('reconectando...'); // EventSource reconecta sozinho
    es.onmessage = (event: MessageEvent<string>) => {
      const msg: SnapshotMessage = JSON.parse(event.data);
      if (msg.type === 'snapshot') {
        setVehicles((current) => (areVehicleSnapshotsEqual(current, msg.vehicles) ? current : msg.vehicles));
      }
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    const es = new EventSource(apiUrl('/api/aircraft/stream'));

    // Sem mexer no selo "ao vivo": ele reporta o tempo real das ambulancias,
    // que e o produto. Uma falha so na camada de aeronave nao deve fazer o
    // mapa inteiro parecer offline.
    es.onmessage = (event: MessageEvent<string>) => {
      const msg: AircraftSnapshotMessage = JSON.parse(event.data);
      if (msg.type === 'snapshot') {
        setAircraft((current) => (areAircraftSnapshotsEqual(current, msg.aircraft) ? current : msg.aircraft));
      }
    };

    return () => es.close();
  }, []);

  // useCallback NAO e otimizacao aqui, e correcao de bug. Estas funcoes sao
  // dependencia do efeito que busca o trajeto (useMapSelection): criadas
  // inline, mudavam de identidade a cada render e o efeito virava um laco —
  // fetch -> setTrail (array novo) -> re-render -> funcao nova -> fetch...
  // Medido: ~35 requisicoes por segundo enquanto houvesse algo selecionado,
  // o que travava a interface e fazia o clique em outra aeronave nao
  // registrar (bug reportado pelo usuario em 2026-08-22).
  const vehicleHistoryUrl = useCallback((id: number) => apiUrl(`/api/vehicles/${id}/history`), []);

  const aircraftHistoryUrl = useCallback((id: number) => apiUrl(`/api/aircraft/${id}/history`), []);

  const vehicleSelection = useMapSelection({
    mapRef,
    breakpoint,
    entities: filteredVehicles,
    historyUrl: vehicleHistoryUrl,
    focusZoom: VEHICLE_FOCUS_ZOOM,
  });

  const aircraftSelection = useMapSelection({
    mapRef,
    breakpoint,
    entities: visibleAircraft,
    historyUrl: aircraftHistoryUrl,
    focusZoom: AIRCRAFT_FOCUS_ZOOM,
  });

  // Missao da van selecionada — alimenta a linha do tempo. Buscada aqui (nao
  // dentro do MissionTimeline) porque dois componentes a consomem: a barra
  // flutuante no desktop e a aba "Trajeto" da sidebar no tablet/mobile.
  // Buscar em cada um deles duplicaria a requisicao.
  //
  // Depende do positionAt (carimbo do servidor), nao da lat/lon: assim a
  // missao e reconsultada quando chega posicao nova de verdade, e nao a cada
  // render.
  const selectedVehicleId = vehicleSelection.selectedId;
  const selectedVehiclePositionAt = vehicleSelection.selected?.positionAt ?? null;

  useEffect(() => {
    if (selectedVehicleId == null) {
      setMission(null);
      return;
    }

    let cancelled = false;
    fetch(apiUrl(`/api/vehicles/${selectedVehicleId}/mission`))
      .then((response) => response.json())
      .then((data: Mission | null) => {
        if (!cancelled) setMission(data);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Erro ao buscar missao:', error);
        setMission(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicleId, selectedVehiclePositionAt]);

  // Modo cinema: seleciona uma van aleatoria do filtro ativo e depois cicla
  // pra proxima (mesma ordem/logica do botao "Proxima ambulancia" da
  // sidebar) a cada CINEMA_INTERVAL_MS, sozinho. Qualquer selecao manual
  // (clique num marcador ou no seletor do filtro) desliga o modo — senao o
  // timer ia brigar com o clique do usuario alguns segundos depois.
  const [cinemaMode, setCinemaMode] = useState(false);
  const cinemaStartedRef = useRef(false);

  // focusNext muda de identidade toda vez que filteredVehicles muda (o SSE
  // atualiza posicao a cada poucos segundos) — se o efeito do timer
  // dependesse disso direto, ele recriava o setInterval antes dos 8s
  // completarem e o modo cinema nunca avancava (bug reportado 2026-08-27).
  // O ref sempre aponta pra versao mais recente, sem precisar recriar o
  // timer.
  const focusNextRef = useRef(vehicleSelection.focusNext);
  useEffect(() => {
    focusNextRef.current = vehicleSelection.focusNext;
  });

  // So liga/desliga o timer quando cinemaMode muda — nao a cada posicao
  // nova.
  useEffect(() => {
    if (!cinemaMode) {
      cinemaStartedRef.current = false;
      return;
    }

    if (!cinemaStartedRef.current) {
      cinemaStartedRef.current = true;
      const positioned = filteredVehicles.filter((v) => v.latitude != null && v.longitude != null);
      if (positioned.length === 0) {
        setCinemaMode(false);
        return;
      }
      aircraftSelection.close();
      const random = positioned[Math.floor(Math.random() * positioned.length)];
      void vehicleSelection.select(random.id);
    }

    const interval = setInterval(() => {
      focusNextRef.current();
    }, CINEMA_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinemaMode]);

  // Se o filtro esvaziar tudo enquanto o modo cinema esta ligado (usuario
  // mexeu no filtro), desliga sozinho — separado do efeito acima pra nao
  // reiniciar o timer a cada mudanca de filteredVehicles.
  useEffect(() => {
    if (!cinemaMode) return;
    const positioned = filteredVehicles.filter((v) => v.latitude != null && v.longitude != null);
    if (positioned.length === 0) setCinemaMode(false);
  }, [cinemaMode, filteredVehicles]);

  function toggleCinemaMode() {
    setCinemaMode((prev) => !prev);
  }

  // So uma sidebar por vez: selecionar uma aeronave fecha a van aberta e
  // vice-versa. Duas sidebars empilhadas na mesma posicao seria ilegivel.
  function selectVehicle(id: number) {
    setCinemaMode(false);
    aircraftSelection.close();
    void vehicleSelection.select(id);
  }

  function selectAircraft(id: number) {
    setCinemaMode(false);
    vehicleSelection.close();
    void aircraftSelection.select(id);
  }

  function handleVehicleMarkerClick(id: number) {
    setCinemaMode(false);
    aircraftSelection.close();
    vehicleSelection.handleMarkerClick(id);
  }

  function handleAircraftMarkerClick(id: number) {
    setCinemaMode(false);
    vehicleSelection.close();
    aircraftSelection.handleMarkerClick(id);
  }

  const isFocusing = vehicleSelection.isFocusing || aircraftSelection.isFocusing;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Barra do topo: filtros a esquerda do selo "ao vivo", os dois no
          mesmo container flex (antes o selo era posicionado sozinho com
          position:absolute). */}
      <div className="map-topbar">
        <VehicleFilters
          breakpoint={breakpoint}
          vehicles={vehicles}
          filtered={filteredVehicles}
          aircraft={visibleAircraft}
          statusFilter={statusFilter}
          stateFilter={stateFilter}
          displayMode={displayMode}
          selectedVehicleId={vehicleSelection.selectedId}
          selectedAircraftId={aircraftSelection.selectedId}
          onStatusChange={setStatusFilter}
          onStateChange={setStateFilter}
          onDisplayModeChange={setDisplayMode}
          onSelectVehicle={selectVehicle}
          onSelectAircraft={selectAircraft}
        />
        <button
          type="button"
          className={`map-cinema-toggle${cinemaMode ? ' is-active' : ''}`}
          aria-label={cinemaMode ? 'Desligar modo cinema' : 'Ligar modo cinema'}
          aria-pressed={cinemaMode}
          onClick={toggleCinemaMode}
        >
          <CinemaIcon />
        </button>
        <div className="status-badge text-body-sm-medium font-body">
          <span className="live-dot" />
          {status}
        </div>
      </div>

      <MissionStatsCards stateFilter={stateFilter} breakpoint={breakpoint} />

      <VehicleSidebar
        vehicle={vehicleSelection.selected}
        mission={mission}
        onClose={vehicleSelection.close}
        onNext={vehicleSelection.focusNext}
        hasMultipleVehicles={vehicleSelection.positionedCount > 1}
        breakpoint={breakpoint}
        cinemaMode={cinemaMode}
      />
      <AircraftSidebar
        aircraft={aircraftSelection.selected}
        onClose={aircraftSelection.close}
        onNext={aircraftSelection.focusNext}
        hasMultiple={aircraftSelection.positionedCount > 1}
        breakpoint={breakpoint}
        isHelicopter={
          aircraftSelection.selected != null && helicopterIcaos.has(aircraftSelection.selected.icao24)
        }
      />

      {/* Desktop E tablet usam a barra flutuante (pedido do usuario,
          2026-08-24: as duas telas usam a mesma sidebar de 2 abas —
          Informacoes + Paciente — sem aba de Trajeto, porque a linha do
          tempo ja aparece aqui). So mobile embute a versao vertical dentro
          da propria sidebar (ver VehicleSidebar), onde nao ha espaco pra
          barra flutuante sem sobrepor o mapa. A geometria da barra (ver
          .mission-timeline-wrap no index.css) ja assume a mesma largura de
          sidebar que desktop e tablet compartilham, entao nao precisa de
          CSS novo. */}
      {breakpoint !== 'mobile' && <MissionTimeline vehicle={vehicleSelection.selected} mission={mission} />}

      {/* attributionControl=false remove a etiqueta do canto — CARTO/OSM pedem
          atribuicao visivel nos termos de uso do tile gratuito; ok pra uso
          interno, mas vale saber que tecnicamente sai do "compliance" deles
          se isso um dia virar produto externo/publico. */}
      {/* Wrapper proprio pro blur: MapContainer do react-leaflet so aplica o
          prop "style" na montagem inicial, nao reage a mudanca de estado
          depois — o filter precisa estar num elemento comum do React que
          re-renderiza de verdade. Borra o mapa so durante a animacao do
          flyTo (isFocusing), disfarcando a transicao — nao fica borrado o
          tempo todo com algo selecionado, so ate a camera assentar. */}
      <div
        style={{
          width: '100%',
          height: '100%',
          filter: isFocusing ? 'blur(6px)' : 'none',
          transition: 'filter 0.4s ease',
        }}
      >
        <MapContainer
          ref={mapRef}
          center={INITIAL_CENTER}
          zoom={12}
          attributionControl={false}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {basemapLayers.map((layer) => (
            <TileLayer key={layer.id} className={basemapTileClassName} url={layer.url} />
          ))}
          <ZoomControl position="bottomright" />
          <FitBounds vehicles={vehicles} />

          <VehicleMarkers
            vehicles={filteredVehicles}
            breakpoint={breakpoint}
            selectedVehicleId={vehicleSelection.selectedId}
            isFocusing={isFocusing}
            onMarkerClick={handleVehicleMarkerClick}
          />
          <AircraftMarkers
            aircraft={visibleAircraft}
            breakpoint={breakpoint}
            selectedAircraftId={aircraftSelection.selectedId}
            isFocusing={isFocusing}
            onMarkerClick={handleAircraftMarkerClick}
            helicopterIcaos={helicopterIcaos}
          />

          {vehicleSelection.trail && vehicleSelection.selectedId != null && (
            // Mesmo motivo do circulo (ver VehicleMarkers): some durante o
            // flyTo (isFocusing) e reaparece junto com ele no moveend, em
            // vez de aparecer "esticada" pelo mesmo efeito de escala do
            // overlay-pane do Leaflet durante a animacao de zoom.
            <Polyline
              positions={vehicleSelection.trail.map((p) => [p.latitude, p.longitude])}
              pathOptions={{ color: 'var(--color-primary-500)', weight: 3, opacity: isFocusing ? 0 : 1 }}
            />
          )}

          {aircraftSelection.trail && aircraftSelection.selectedId != null && (
            // Colorido pela altitude ao longo do caminho, em vez de uma cor
            // unica (ver AircraftTrail). O ultimo ponto e a posicao ESTIMADA
            // do marcador neste segundo, nao o ultimo ponto do historico —
            // sem isso a linha ficaria sempre pra tras do aviao, ja que ele
            // se move a cada segundo e o historico so a cada ciclo.
            <AircraftTrail
              points={[
                ...aircraftSelection.trail,
                ...(aircraftSelection.selected?.latitude != null &&
                aircraftSelection.selected?.longitude != null
                  ? [
                      {
                        latitude: aircraftSelection.selected.latitude,
                        longitude: aircraftSelection.selected.longitude,
                        altitude: aircraftSelection.selected.altitude,
                        positionAt: 'live',
                      },
                    ]
                  : []),
              ]}
              isFocusing={isFocusing}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
