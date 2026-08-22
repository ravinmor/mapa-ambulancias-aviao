import { prisma } from './db';

// Snapshot das aeronaves que estao no mapa agora. Pipeline separado do das
// vans de proposito (ver PLANO_Aeronaves_MapaAmbulancias.md) — por isso nao
// reusa getCurrentFleet nem o formato de VehicleSnapshot: os campos sao
// outros (altitude, rumo, callsign) e a origem e outra.
export interface AircraftSnapshot {
  id: number;
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  positionAt: Date | null;
  updatedAt: Date | null;
}

// "trackedRegion != null" e o que separa quem esta ocupando vaga de quem ja
// saiu da area: a linha da aeronave liberada continua no banco (com o
// historico dela) ate o expurgo, mas nao pode aparecer no mapa. Equivale ao
// filtro de INACTIVE em getCurrentFleet, so que aqui da pra fazer no WHERE —
// a coluna e nula por design, nao por dado faltando na origem.
export async function getCurrentAircraft(): Promise<AircraftSnapshot[]> {
  const rows = await prisma.aircraft.findMany({
    where: { trackedRegion: { not: null } },
    orderBy: [{ trackedRegion: 'asc' }, { callsign: 'asc' }],
  });

  return rows.map((a) => ({
    id: a.id,
    icao24: a.icao24,
    callsign: a.callsign,
    originCountry: a.originCountry,
    region: a.trackedRegion,
    latitude: a.latitude,
    longitude: a.longitude,
    altitude: a.altitude,
    velocity: a.velocity,
    trueTrack: a.trueTrack,
    verticalRate: a.verticalRate,
    onGround: a.onGround,
    squawk: a.squawk,
    positionAt: a.positionAt,
    updatedAt: a.updatedAt,
  }));
}
