import { prisma } from './db';

// Leitura da aeronave especifica (ICAO24 fixo) rastreada pelo pipeline
// paralelo em sync-job/src/trackedAircraft.ts. So existe 1 linha nesta
// tabela hoje (1 aeronave), mas a forma e lista pra nao precisar mudar
// contrato se um dia mais de uma aeronave especifica for monitorada do
// mesmo jeito.
export interface TrackedAircraftSnapshot {
  id: number;
  icao24: string;
  label: string | null;
  callsign: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  stage: string | null;
  isOnline: boolean;
  positionAt: Date | null;
  lastSeenAt: Date | null;
  // R-21 — horario de inicio/fim do voo atual (ou do ultimo, enquanto
  // parada). Ja vem CONFIRMADO (2 leituras reais seguidas, ver
  // resolveFlightTiming em sync-job/src/trackedAircraft.ts) — os campos
  // pending*At internos NAO sao expostos aqui de proposito.
  flightStartedAt: Date | null;
  flightEndedAt: Date | null;
  // Matricula/fabricante/modelo/operador (R-17, pedido do usuario
  // 2026-09-04) — buscados pelo sync-job no adsbdb.com, null ate a 1a busca
  // ter sucesso (ou se o adsbdb nao tiver essa aeronave catalogada).
  registration: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
  // Origem/destino do voo ATUAL (R-18, pedido do usuario 2026-09-04) —
  // buscados via adsbdb.com a partir do callsign, null se o adsbdb nao
  // conhece essa rota.
  originIcao: string | null;
  originName: string | null;
  destinationIcao: string | null;
  destinationName: string | null;
  // Coordenadas do destino (pedido do usuario, 2026-09-04) — trava o dead
  // reckoning perto do pouso e alimenta a linha tracejada ate o destino.
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  // Foto real da aeronave (pedido do usuario, 2026-09-04) — cobertura
  // parcial, null e o caso comum (frontend cai pro placeholder generico).
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
}

// Uma perna de voo PASSADA (R-31 cont., pedido do usuario 2026-09-04) — vem
// do historico sincronizado do OpenSky, ver TrackedAircraftFlightHistory.
export interface TrackedAircraftFlightHistoryEntry {
  id: number;
  callsign: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  departedAt: Date;
  arrivedAt: Date | null;
}

export async function getTrackedAircraft(): Promise<TrackedAircraftSnapshot[]> {
  const rows = await prisma.trackedAircraft.findMany({ orderBy: { id: 'asc' } });

  return rows.map((a) => ({
    id: a.id,
    icao24: a.icao24,
    label: a.label,
    callsign: a.callsign,
    latitude: a.latitude,
    longitude: a.longitude,
    altitude: a.altitude,
    velocity: a.velocity,
    trueTrack: a.trueTrack,
    verticalRate: a.verticalRate,
    onGround: a.onGround,
    squawk: a.squawk,
    stage: a.stage,
    isOnline: a.isOnline,
    positionAt: a.positionAt,
    lastSeenAt: a.lastSeenAt,
    flightStartedAt: a.flightStartedAt,
    flightEndedAt: a.flightEndedAt,
    registration: a.registration,
    manufacturer: a.manufacturer,
    model: a.model,
    operator: a.operator,
    originIcao: a.originIcao,
    originName: a.originName,
    destinationIcao: a.destinationIcao,
    destinationName: a.destinationName,
    destinationLatitude: a.destinationLatitude,
    destinationLongitude: a.destinationLongitude,
    photoUrl: a.photoUrl,
    photoThumbnailUrl: a.photoThumbnailUrl,
  }));
}

// Historico de voos passados de UMA aeronave (mais recente primeiro) —
// limitado (nao precisa do historico inteiro pro grafico, so os ultimos N).
const FLIGHT_HISTORY_LIMIT = 30;

export async function getTrackedAircraftFlightHistory(trackedAircraftId: number): Promise<TrackedAircraftFlightHistoryEntry[]> {
  const rows = await prisma.trackedAircraftFlightHistory.findMany({
    where: { trackedAircraftId },
    orderBy: { departedAt: 'desc' },
    take: FLIGHT_HISTORY_LIMIT,
  });

  return rows.map((r) => ({
    id: r.id,
    callsign: r.callsign,
    departureIcao: r.departureIcao,
    arrivalIcao: r.arrivalIcao,
    departedAt: r.departedAt,
    arrivedAt: r.arrivedAt,
  }));
}
