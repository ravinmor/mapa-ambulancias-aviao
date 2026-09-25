import { prisma } from './db';
import config from './config';

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
  // Tier de recheck ATUAL (calculado e persistido pelo sync-job, ver
  // classifyApproachTier em sync-job/src/trackedAircraft.ts) — exposto pra
  // alimentar o log de atividade do frontend (AmilActivityLog.tsx).
  tier: string | null;
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
  // Agendamento de voo (v3, 2026-09-23) — escrito pelo sync-job
  // (aircraftScheduling.ts) a partir do fluxo PA-RESGATE-GerenciaSolicitacoes.
  // scheduledAt so muda na transicao da solicitacao vinculada pra
  // "Aguardando aceite" (novo agendamento de verdade) — o frontend usa isso
  // (nao schedulingStatus) pra saber se ja alertou esta decolagem,
  // comparando com o ultimo scheduledAt visto. scheduledMissionId/
  // scheduledPatientName identificam qual solicitacao/paciente causou esse
  // agendamento; scheduledAircraftId/scheduledAircraftName vem do cadastro
  // da aeronave (d_Cadastro_Aeronaves) — os 4 atualizados na mesma borda,
  // pro popup do alerta mostrar mais que so' o ICAO24.
  schedulingStatus: string | null;
  scheduledAt: Date | null;
  scheduledMissionId: number | null;
  scheduledPatientName: string | null;
  scheduledAircraftId: number | null;
  scheduledAircraftName: string | null;
  // Alerta "prestes a decolar" (v4, 2026-09-24) — ver comentario em
  // sync-job/src/aircraftScheduling.ts. departureAlertAt so' muda quando o
  // alerta dispara de verdade (dedup por missao) — mesmo padrao de
  // scheduledAt, o frontend compara com o ultimo valor visto.
  scheduledDepartureAt: Date | null;
  departureAlertAt: Date | null;
  // Alerta "aproximando do destino" (2026-09-25) — mesmo padrao do alerta
  // de decolagem acima, so que com DataChegadaDestino.
  scheduledArrivalAt: Date | null;
  arrivalAlertAt: Date | null;
  // Rastreamento alternativo via Garmin inReach MapShare (2026-09-22) — ver
  // sync-job/src/sources/garminMapShare.ts. Frontend alterna entre este
  // conjunto e o de cima (latitude/longitude/etc., OpenSky) via botao
  // proprio, ver AmilJetPage.tsx.
  garminLatitude: number | null;
  garminLongitude: number | null;
  garminAltitude: number | null;
  garminVelocity: number | null;
  garminTrueTrack: number | null;
  garminInEmergency: boolean | null;
  garminOnline: boolean;
  garminPositionAt: Date | null;
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
  // So a frota CONFIGURADA agora (ver comentario em config.ts) — linhas
  // antigas continuam no banco, so somem da listagem.
  const rows = await prisma.trackedAircraft.findMany({
    // Frota real (rastreio ADS-B/Garmin, TRACKED_AIRCRAFT_ICAO24S) OU
    // linha de agendamento com chave SINTETICA (`reg-<id>`, aircraftScheduling.ts
    // v4 — aeronave sem ICAO24 conhecido ainda) — sem o segundo braço do OR,
    // o alerta "agendada"/"prestes a decolar" dessas aeronaves nunca
    // apareceria aqui (chave sintetica nunca esta' na allowlist de ICAO24
    // real, que e' config separada, pro poll do OpenSky).
    where: {
      OR: [{ icao24: { in: config.trackedAircraftIcao24List } }, { icao24: { startsWith: 'reg-' } }],
    },
    orderBy: { id: 'asc' },
  });

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
    tier: a.tier,
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
    schedulingStatus: a.schedulingStatus,
    scheduledAt: a.scheduledAt,
    scheduledMissionId: a.scheduledMissionId,
    scheduledPatientName: a.scheduledPatientName,
    scheduledAircraftId: a.scheduledAircraftId,
    scheduledAircraftName: a.scheduledAircraftName,
    scheduledDepartureAt: a.scheduledDepartureAt,
    departureAlertAt: a.departureAlertAt,
    scheduledArrivalAt: a.scheduledArrivalAt,
    arrivalAlertAt: a.arrivalAlertAt,
    garminLatitude: a.garminLatitude,
    garminLongitude: a.garminLongitude,
    garminAltitude: a.garminAltitude,
    garminVelocity: a.garminVelocity,
    garminTrueTrack: a.garminTrueTrack,
    garminInEmergency: a.garminInEmergency,
    garminOnline: a.garminOnline,
    garminPositionAt: a.garminPositionAt,
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
