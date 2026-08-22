// Duas formas distintas de proposito — cadastro (fleet) e rastreio (history)
// sao listas diferentes na origem, com campos diferentes, sincronizadas em
// ciclos separados. Ver DECISOES_Infra_MapaAmbulancias.md.
export interface FleetEntry {
  vehicleId: string;
  name: string;
  licensePlate: string | null;
  vehicleType: string | null;
  state: string | null;
  status: string | null;
  activityStatus: string | null;
  assignmentStatus: string | null;
  tabletEmail: string | null;
  statusChangedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  positionAt: Date | null;
}

export interface HistoryEntry {
  id: number;
  vehicleId: string;
  latitude: number;
  longitude: number;
  positionAt: Date;
  vehicleStatus: string | null;
  callId: string | null;
  operationId: string | null;
  appVersion: string | null;
  device: string | null;
}

export interface MissionEventEntry {
  id: number;
  callId: string | null;
  operationId: string | null;
  availabilityId: string | null;
  tripType: string | null;
  statusMessage: string;
  message: string | null;
  accessType: string | null;
  state: string | null;
  readStatusRequester: number | null;
  readStatusControl: number | null;
  readStatusRescue: number | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface DataSource {
  fetchFleet(): Promise<FleetEntry[]>;
  fetchHistorySince(since: Date): Promise<HistoryEntry[]>;
  fetchMissionEventsSince(since: Date): Promise<MissionEventEntry[]>;
}

// --- Aeronaves (OpenSky) ---------------------------------------------------
// Pipeline separado do das vans de proposito (ver PLANO_Aeronaves_
// MapaAmbulancias.md): origem, tabelas, rotas e stream proprios. Por isso
// AircraftEntry NAO entra na interface DataSource acima — nao existem duas
// implementacoes concorrentes de fonte de aeronave, so um cliente unico com
// um modo "fixture" pra desenvolvimento nao gastar credito da API.

export type AircraftRegion = 'SP' | 'RJ';

export interface AircraftEntry {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  region: AircraftRegion;
  latitude: number;
  longitude: number;
  // Metros. Nunca null: aeronave sem altitude barometrica NEM geometrica e
  // descartada ainda na fonte (decisao do usuario), entao quem chega aqui
  // sempre tem um valor pro gradiente de cor.
  altitude: number;
  velocity: number | null; // m/s sobre o solo
  trueTrack: number | null; // graus, norte=0 — rotaciona o icone no mapa
  verticalRate: number | null; // m/s, positivo = subindo
  onGround: boolean;
  squawk: string | null;
  positionAt: Date;
}
