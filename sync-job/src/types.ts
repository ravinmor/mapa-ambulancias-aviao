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

// Uma missao/chamado de f_Operacao_Controle_Dados_do_Chamado. E a fonte real
// da linha do tempo (endereco + carimbo de hora de cada etapa), substituindo
// o mock do MissionTimeline.tsx.
export interface MissionEntry {
  id: number;
  callId: string; // "ID_Chamado" — casa com PositionHistory.operationId, ver mission.prisma
  vehicleId: number | null;
  teamId: number | null;
  state: string | null;
  tripType: string | null;
  operationStatus: string | null;
  currentStatusText: string | null;
  shortStatusText: string | null;
  // Estado por etapa ("Iniciado"/"Nao Iniciado"/"Confirmado") — a origem nao
  // tem data por etapa, ver mission.prisma.
  acceptanceStatus: string | null;
  departedToOriginStatus: string | null;
  arrivedAtOriginStatus: string | null;
  departedToDestStatus: string | null;
  arrivedAtDestStatus: string | null;
  finishedStatus: string | null;
  assignedAt: Date | null;
  acknowledgedAt: Date | null;
  lastActionAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  etaOrigin: Date | null;
  etaDestination: Date | null;
}

// f_Regulação_chamados — endereco/local por extenso + dado do paciente.
// Complementa Mission (que tem etapa/status, mas endereco sempre vazio).
export interface RegulationEntry {
  id: number; // = Mission.callId (confirmado pelo usuario, ver regulation.prisma)
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

export interface DataSource {
  fetchFleet(): Promise<FleetEntry[]>;
  // Historico e buscado POR VEICULO e a partir do ID DO ITEM no SharePoint,
  // nao de um timestamp.
  //
  // Por que nao por data: a lista de rastreio passou de 5.000 itens, e o
  // SharePoint RECUSA (nao apenas atrasa) qualquer filtro ou ordenacao em
  // coluna nao indexada acima desse limite — erro real: "The attempted
  // operation is prohibited because it exceeds the list view threshold".
  // "Data_Localizacao" nao e indexada, entao nenhum ajuste de paginacao ou
  // janela de tempo resolvia.
  //
  // "ID" e sempre indexada por padrao no SharePoint (nao da pra desindexar),
  // e a lista e append-only — logo ID maior significa registro mais novo, e
  // ordenar/filtrar por ID equivale a ordenar por tempo. Como
  // PositionHistory.id ja guarda o proprio ID do item do SharePoint (decisao
  // original do schema, pra deduplicacao), o marcador ja existia pronto.
  fetchHistoryForVehicle(vehicleId: string, sinceItemId: number): Promise<HistoryEntry[]>;
  fetchMissionEventsSince(since: Date): Promise<MissionEventEntry[]>;

  // Sem parametro de "desde" de proposito. Esta lista e ATUALIZADA (nao
  // append-only), entao um cursor incremental por data de modificacao seria
  // o natural — mas "Modified" nao e indexada, e acima de 5.000 itens o
  // SharePoint recusa filtrar por coluna nao indexada (mesmo bloqueio que
  // derrubou o historico, ver fetchHistoryForVehicle).
  //
  // Solucao: nao filtrar nada. O flow devolve os N chamados mais RECENTES
  // (ordem por "ID desc", que e sempre indexada) e o sync faz upsert de
  // todos a cada ciclo. Como missao em andamento e sempre recente, ela esta
  // sempre nesse lote — e reescrever as mesmas linhas captura as
  // atualizacoes de etapa sem precisar de cursor nenhum.
  fetchRecentMissions(): Promise<MissionEntry[]>;

  // Mesmo padrao de fetchRecentMissions — sem filtro/cursor, so os N
  // registros mais recentes por "ID desc" (indexada). f_Regulação_chamados
  // e outra lista de escrita frequente (mesma familia de f_Operacao_
  // Controle_Dados_do_Chamado); ate confirmar o tamanho real dela, tratamos
  // como sujeita ao mesmo limite de threshold do SharePoint.
  fetchRegulationForCall(callId: string): Promise<RegulationEntry[]>;
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
