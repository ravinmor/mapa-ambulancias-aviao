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

// Missao ativa de uma van — fonte real da linha do tempo, vinda de
// f_Operacao_Controle_Dados_do_Chamado. As 7 etapas sao anulaveis: as que
// ainda nao aconteceram vem null, e e assim que a timeline sabe onde parou.
// f_Regulação_chamados — endereco/local por extenso + dado do paciente.
// Mission.id NAO relacionado ao id deste tipo (Regulation.id = Mission.callId,
// ver regulation.prisma) — o backend ja resolve o join, o frontend so
// consome o objeto aninhado.
export interface Regulation {
  id: number;
  originName: string | null;
  destinationName: string | null;
  originAddress: string | null;
  destinationAddress: string | null;
  originSector: string | null;
  destinationSector: string | null;
  patientName: string | null;
  patientAge: string | null;
  patientSex: string | null;
  birthDate: string | null;
  weightKg: number | null;
  heightCm: string | null;
  diagnosis: string | null;
  callReason: string | null;
  patientType: string | null;
  patientTypeOther: string | null;
  companion: string | null;
  isIntubated: boolean | null;
  isObese: boolean | null;
  triageCompleted: boolean | null;
  healthPlan: string | null;
  procedure: string | null;
  equipment: string | null;
  deviceUsage: string | null;
  originDoctor: string | null;
  destinationDoctor: string | null;
  notes: string | null;
}

export interface Mission {
  id: number;
  callId: string;
  tripType: string | null;
  operationStatus: string | null;
  currentStatusText: string | null;
  shortStatusText: string | null;
  // Estado por etapa. A origem nao guarda hora de cada etapa — so as duas
  // datas abaixo existem de verdade (ver mission.prisma).
  acceptanceStatus: string | null;
  departedToOriginStatus: string | null;
  arrivedAtOriginStatus: string | null;
  departedToDestStatus: string | null;
  arrivedAtDestStatus: string | null;
  finishedStatus: string | null;
  assignedAt: string | null;
  acknowledgedAt: string | null;
  lastActionAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  etaOrigin: string | null;
  etaDestination: string | null;
  // Vem aninhado na resposta de /api/vehicles/:id/mission — pode ser null se
  // a regulacao ainda nao sincronizou ou saiu da janela dos N mais recentes.
  regulation: Regulation | null;
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

// Aeronave ESPECIFICA rastreada por ICAO24 fixo (ver AmilJetPage.tsx) —
// diferente de Aircraft acima: sem "region"/vaga, e latitude/longitude/
// altitude continuam preenchidos mesmo com isOnline=false (ultima posicao
// conhecida, nunca zerada — pedido do usuario, ver /api/tracked-aircraft).
export interface TrackedAircraft {
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
  positionAt: string | null;
  lastSeenAt: string | null;
}
