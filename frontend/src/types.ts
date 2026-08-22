export interface Vehicle {
  id: number;
  vehicleId: string;
  name: string;
  licensePlate: string | null;
  vehicleType: string | null;
  state: string | null;
  status: string | null;
  activityStatus: string | null;
  assignmentStatus: string | null;
  tabletEmail: string | null;
  statusChangedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  positionAt: string | null;
  updatedAt: string | null;
}

export interface HistoryPoint {
  latitude: number;
  longitude: number;
  positionAt: string;
}

export interface SnapshotMessage {
  type: 'snapshot';
  vehicles: Vehicle[];
}

export interface Aircraft {
  id: number;
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  region: string | null; // "SP" | "RJ" — a vaga que ocupa, nao onde esta agora
  latitude: number | null;
  longitude: number | null;
  altitude: number | null; // metros
  velocity: number | null; // m/s
  trueTrack: number | null; // graus, norte=0 — rotaciona o icone
  verticalRate: number | null; // m/s, positivo = subindo
  onGround: boolean;
  squawk: string | null;
  positionAt: string | null;
  updatedAt: string | null;
}

export interface AircraftSnapshotMessage {
  type: 'snapshot';
  aircraft: Aircraft[];
}

// O trajeto da aeronave carrega altitude por ponto (o da van nao tem) — abre
// espaco pra colorir a linha pelo mesmo gradiente do marcador, ja que a
// altitude muda bastante ao longo do voo.
export interface AircraftTrailPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  positionAt: string;
}
