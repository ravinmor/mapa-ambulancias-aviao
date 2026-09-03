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
  }));
}
