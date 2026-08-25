import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, ZoomControl, Polyline } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import type { Mission, SnapshotMessage, Vehicle } from './types';
import { apiUrl } from './api';
import VehicleSidebar from './VehicleSidebar';
import MissionTimeline from './MissionTimeline';
import { useBreakpoint } from './useBreakpoint';
import { useMapSelection } from './useMapSelection';
import { statusColorVar, statusPulseClass } from './vehicleStatus';
import { VEHICLE_FOCUS_ZOOM } from './Map';

// Pagina de rastreamento — o destino do link "Compartilhar rota" gerado em
// VehicleSidebar. Diferente do mapa operacional (Map.tsx): 1 unico veiculo,
// sem filtro, sem lista, sidebar fixa. Reaproveita useMapSelection (foco de
// camera + busca de trajeto) e VehicleSidebar (conteudo identico, so troca
// pra modo fixo) sem duplicar logica.

const INITIAL_CENTER: [number, number] = [-23.5505, -46.6333];

type LoadState = 'connecting' | 'found' | 'not-found' | 'trip-ended';

export default function TrackingPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const numericId = Number(vehicleId);
  const mapRef = useRef<LeafletMap | null>(null);
  const breakpoint = useBreakpoint();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  // 'connecting' ate o primeiro snapshot chegar — so entao da pra saber se o
  // id existe e qual o status (ver efeito de classificacao abaixo).
  const [loadState, setLoadState] = useState<LoadState>('connecting');
  // O React-Leaflet preenche mapRef de forma assincrona — nao da pra supor
  // que ele ja esta setado so porque o MapContainer acabou de aparecer no
  // JSX (confirmado com log: no mesmo commit em que loadState vira 'found',
  // mapRef.current ainda e null quando o efeito abaixo roda). whenReady e o
  // sinal correto da propria biblioteca pra "o mapa Leaflet existe de
  // verdade agora".
  const [mapReady, setMapReady] = useState(false);
  const hasSelectedOnce = useRef(false);
  // vehicle sozinho nao distingue "snapshot ainda nao chegou" de "chegou e o
  // id nao estava nele" — os dois deixam vehicle null. PRECISA ser estado
  // (nao ref): se o 1o snapshot chega e o veiculo nao e encontrado,
  // setVehicle(null) nao muda nada (ja era null) e nao re-renderiza — sem um
  // setState proprio pra esse flip, o efeito de classificacao abaixo nunca
  // roda de novo e a pagina fica presa em "Conectando..." pra sempre (bug
  // pego em teste manual, 2026-08-25, com um id inexistente).
  const [hasReceivedSnapshot, setHasReceivedSnapshot] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(numericId)) return;

    const es = new EventSource(apiUrl('/api/vehicles/stream'));
    es.onmessage = (event: MessageEvent<string>) => {
      const msg: SnapshotMessage = JSON.parse(event.data);
      if (msg.type !== 'snapshot') return;
      setHasReceivedSnapshot(true);
      const found = msg.vehicles.find((v) => v.id === numericId) ?? null;
      setVehicle(found);
    };
    return () => es.close();
  }, [numericId]);

  // Classifica o estado da pagina a partir do que chegou no snapshot. Link
  // "encerrado" quando o veiculo sai de IN_SERVICE — mesma regra que a API ja
  // aplica em /api/vehicles/:id/history (devolve vazio fora desse status),
  // entao o trajeto para de atualizar exatamente no mesmo momento em que a
  // pagina avisa que a viagem acabou.
  useEffect(() => {
    if (!Number.isInteger(numericId)) {
      setLoadState('not-found');
      return;
    }
    if (vehicle == null) {
      // A API ja filtra veiculos INACTIVE fora do snapshot (ver
      // vehicles.ts), entao "sumiu da lista" e tratado igual "nao existe"
      // pro usuario do link — nao ha como distinguir isso de um id
      // invalido, e a mensagem serve pros dois casos.
      setLoadState(hasReceivedSnapshot ? 'not-found' : 'connecting');
      return;
    }
    setLoadState(vehicle.status === 'IN_SERVICE' ? 'found' : 'trip-ended');
  }, [vehicle, numericId, hasReceivedSnapshot]);

  const vehicleHistoryUrl = useCallback((id: number) => apiUrl(`/api/vehicles/${id}/history`), []);

  const entities = useMemo(() => (vehicle ? [vehicle] : []), [vehicle]);

  const selection = useMapSelection({
    mapRef,
    breakpoint,
    entities,
    historyUrl: vehicleHistoryUrl,
    focusZoom: VEHICLE_FOCUS_ZOOM,
  });

  // Auto-seleciona assim que o veiculo aparece pela 1a vez — nao ha marcador
  // pra clicar isoladamente pra abrir a sidebar (ela ja precisa estar aberta
  // de cara). So uma vez: depois disso quem mantem a selecao viva e o
  // proprio useMapSelection (reage a posicao nova via positionAt).
  //
  // Precisa esperar mapReady, nao so loadState === 'found': o MapContainer
  // aparece no JSX assim que loadState vira 'found', mas o React-Leaflet
  // preenche mapRef.current de forma assincrona por dentro.
  //
  // O flyTo() do useMapSelection.select() NAO funciona aqui — medido com
  // Leaflet direto (2026-08-25): chamado logo apos o mapa nascer (janela
  // entre whenReady e o mapa "assentar" de verdade), a animacao nao tem
  // efeito nenhum, nem depois de mais de 1s (zoom/centro ficam parados no
  // valor inicial da pagina, sem erro nenhum no console). setView (sem
  // animacao) no MESMO instante funciona perfeitamente. No mapa operacional
  // (Map.tsx) o flyTo do mesmo hook funciona bem porque so roda bem depois,
  // em resposta a um clique do usuario, com o mapa ja assentado ha tempo —
  // por isso a correcao e local aqui, e useMapSelection nao foi mexido (nao
  // quero arriscar a animacao que ja funciona la).
  //
  // Por isso: setView direto (garantido) ANTES de chamar select() — select()
  // ainda roda por causa do resto que ele faz (selectedId, busca de
  // trajeto); o flyTo dele por cima e redundante (mesmo alvo) e inofensivo
  // mesmo se continuar sem efeito.
  useEffect(() => {
    if (mapReady && vehicle && vehicle.latitude != null && vehicle.longitude != null && !hasSelectedOnce.current) {
      hasSelectedOnce.current = true;
      mapRef.current?.setView([vehicle.latitude, vehicle.longitude], VEHICLE_FOCUS_ZOOM, { animate: false });
      void selection.select(vehicle.id);
    }
  }, [mapReady, vehicle, selection]);

  const selectedPositionAt = selection.selected?.positionAt ?? null;
  useEffect(() => {
    if (!vehicle) {
      setMission(null);
      return;
    }
    let cancelled = false;
    fetch(apiUrl(`/api/vehicles/${vehicle.id}/mission`))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id, selectedPositionAt]);

  // Reabre a sidebar se o usuario arrastar a bottom sheet pra baixo no
  // mobile (drag-to-close continua identico ao do mapa operacional — so o
  // desktop e que fica sem botao de fechar, ver VehicleSidebar `fixed`).
  function handleMarkerClick() {
    if (vehicle) void selection.select(vehicle.id);
  }

  if (loadState === 'connecting') {
    return <StatusScreen title="Conectando..." message="Buscando a localização em tempo real." />;
  }

  if (loadState === 'not-found') {
    return (
      <StatusScreen
        title="Link inválido"
        message="Não encontramos essa ambulância. O link pode estar incorreto ou o veículo não existe mais."
      />
    );
  }

  if (loadState === 'trip-ended') {
    return (
      <StatusScreen
        title="Viagem encerrada"
        message="O acompanhamento em tempo real termina quando a ambulância sai de operação."
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div className="map-topbar">
        <div className="status-badge text-body-sm-medium font-body">
          <span className="live-dot" />
          rastreando ao vivo
        </div>
      </div>

      <VehicleSidebar
        vehicle={selection.selected}
        mission={mission}
        onClose={selection.close}
        onNext={selection.focusNext}
        hasMultipleVehicles={false}
        breakpoint={breakpoint}
        fixed
      />

      {breakpoint !== 'mobile' && <MissionTimeline vehicle={selection.selected} mission={mission} />}

      <div
        style={{
          width: '100%',
          height: '100%',
          filter: selection.isFocusing ? 'blur(6px)' : 'none',
          transition: 'filter 0.4s ease',
        }}
      >
        <MapContainer
          ref={mapRef}
          center={INITIAL_CENTER}
          zoom={14}
          attributionControl={false}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer className="map-tiles" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <ZoomControl position="bottomright" />

          {vehicle && vehicle.latitude != null && vehicle.longitude != null && (
            <CircleMarker
              key={`${vehicle.id}-tracking`}
              className={`vehicle-marker ${statusPulseClass(vehicle.status)} is-active`}
              center={[vehicle.latitude, vehicle.longitude]}
              radius={9}
              pathOptions={{
                color: statusColorVar(vehicle.status),
                fillColor: statusColorVar(vehicle.status),
                opacity: selection.isFocusing ? 0 : 1,
                fillOpacity: selection.isFocusing ? 0 : 0.9,
              }}
              eventHandlers={{ click: handleMarkerClick }}
            />
          )}

          {selection.trail && (
            <Polyline
              positions={selection.trail.map((p) => [p.latitude, p.longitude])}
              pathOptions={{ color: 'var(--color-primary-500)', weight: 3, opacity: selection.isFocusing ? 0 : 1 }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-secondary-700)',
        color: 'var(--color-primary-100)',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <h1 className="text-h4 font-heading" style={{ margin: '0 0 8px' }}>
          {title}
        </h1>
        <p className="text-body-sm-regular font-body" style={{ margin: 0, color: 'var(--color-gray-400)' }}>
          {message}
        </p>
      </div>
    </div>
  );
}
