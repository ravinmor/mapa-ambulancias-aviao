// Reescrito 2026-09-21 pro schema do nucleo `resgate` (Chamado/Operacao/
// Veiculo/Equipe/Colaborador/Triagem/Disponibilidade/DiarioDaMissao/
// PosicaoOperacao) — ver DESENHO_Schema_Resgate_Nucleo.md e
// AUDITORIA_SharePoint_Resgate.md na raiz do repo pro racional completo de
// cada campo. Substitui o antigo FleetEntry/MissionEntry/RegulationEntry/
// HistoryEntry/MissionEventEntry (schema Vehicle/Mission/Regulation/
// PositionHistory/MissionEvent, retirado).

// --- Veiculo (origem: d_Cadastro_Veiculos) --------------------------------
export interface VeiculoEntry {
  id: number;
  name: string;
  licensePlate: string | null;
  vehicleType: string | null;
  activityStatus: string | null;
  operationStatus: string | null;
  initialKm: number | null;
  tabletId: number | null;
  tabletAssignmentStatus: string | null;
  tabletEmail: string | null; // 2a auditoria
  state: string | null; // 2a auditoria
  teamAssignmentStatus: string | null; // 2a auditoria
  edition: string | null; // 2a auditoria
  statusChangedAt: Date | null; // 2a auditoria
}

// --- Posicao (origem dupla: f_Rastreamento_Ambulancia + f_Historico_localizacao_da_operacao) ---
// Mesmo raciocinio do antigo HistoryEntry: rastreio incremental por
// VEICULO (fetchPosicaoForVeiculo) + backfill por OPERACAO (so recupera
// "action" em linhas ja sincronizadas). Ver PosicaoOperacao em
// posicao.prisma pro pq do offset de ID entre as 2 origens.
export interface PosicaoEntry {
  id: number;
  veiculoId: number | null; // ID_Veiculo — presente em f_Rastreamento_Ambulancia, ausente no backfill
  operacaoId: number | null; // ID_Operacao — presente nas 2 origens
  chamadoId: number | null; // ID_Chamado — presente nas 2 origens, usado so pra log/depuracao (a FK real e por operacaoId)
  latitude: number;
  longitude: number;
  positionAt: Date;
  vehicleStatus: string | null;
  tabletId: number | null;
  appVersion: string | null;
  device: string | null;
  // "Acao" — so vem do backfill (f_Historico_localizacao_da_operacao),
  // transicao especifica daquele ping.
  action: string | null;
}

// --- Disponibilidade (origem: f_Disponiiblidade_do_Amil_Resgate) ---------
// Solicitacao inicial — CONFIRMADO EMPIRICO 2026-09-21 (item 3571 vs
// Chamado 3590, paciente/origem/destino identicos): quando aceita, os
// MESMOS dados de paciente/endereco viram um Chamado novo (nao e FK direta
// na origem, e duplicacao de SharePoint — no nucleo So a Disponibilidade
// guarda so o link, sem duplicar o dado que ja mora em Chamado).
export interface DisponibilidadeEntry {
  id: number;
  chamadoId: number | null; // ID_Chamado_aberto — nulo ate ser aceito
  requesterType: string | null;
  ambulanceType: string | null;
  tipoChamadoId: number | null;
  // Bloco de paciente/endereco do estagio 1 — achado na 2a auditoria
  // (faltava quase inteiro na 1a passada do schema).
  originName: string | null;
  destinationName: string | null;
  expectedArrivalOriginAt: Date | null;
  patientName: string | null;
  patientWeightKg: number | null;
  patientBirthDate: Date | null;
  patientHeightMeters: number | null;
  patientHeightCm: number | null;
  patientHeightMetersAndCm: string | null;
  procedure: string | null;
  usesDevice: boolean | null;
  deviceType: string | null;
  usesEquipment: boolean | null;
  equipmentTypeAndQty: string | null;
  originCep: number | null;
  originStreet: string | null;
  originNumber: number | null;
  originComplement: string | null;
  originNeighborhood: string | null;
  originState: string | null;
  originCity: string | null;
  originAddressConcatenated: string | null;
  destinationCep: number | null;
  destinationStreet: string | null;
  destinationNumber: number | null;
  destinationComplement: string | null;
  destinationNeighborhood: string | null;
  destinationState: string | null;
  destinationCity: string | null;
  destinationAddressConcatenated: string | null;
  diagnosis: string | null;
  state: string | null;
  availabilityGivenAt: Date | null;
  respondedAt: Date | null;
  respondedByUser: string | null;
  stage2UnavailabilityReason: string | null; // 2a auditoria
  stage2InformAvailability: boolean | null; // 2a auditoria
  acceptedOrDeclined: boolean | null;
  declineReason: string | null;
  respondedAt3: Date | null;
  acceptedByUser: string | null;
  finalizationControl: string | null;
  finalizedAt: Date | null;
  finalizedByUser: string | null;
  status: string | null;
  controlStatus: string | null;
  requesterStatus: string | null;
  unavailabilityReason: string | null;
  disponibilidadeControlStatus: string | null; // 2a auditoria
}

// --- Chamado (origem: f_Regulacao_Chamados) -------------------------------
// Tabela-mae do nucleo — CONFIRMADO 2026-09-21 que o ID do item nela E o
// "ID_Chamado" referenciado no resto do sistema. Era RegulationEntry antes.
// Campos abaixo com "2a auditoria" foram achados numa reconferencia
// campo-a-campo contra o dado bruto depois que a 1a passada do schema ficou
// incompleta (16 campos faltando so nesta tabela) — usuario pediu paridade
// TOTAL, sem negociar.
export interface ChamadoEntry {
  id: number;
  patientName: string | null;
  medicalRecordNumber: number | null;
  patientBirthDate: Date | null;
  patientAge: string | null;
  patientSex: string | null;
  patientWeightKg: number | null;
  patientHeightCm: number | null;
  patientType: string | null;
  patientTypeOther: string | null; // AUSENTE do flow real hoje, ver auditoria
  isIntubated: boolean | null;
  isObese: boolean | null;
  healthPlan: string | null;
  contact: string | null;
  patientEmail: string | null; // 2a auditoria
  originPhone: string | null; // 2a auditoria
  destinationPhone: string | null; // 2a auditoria
  diagnosis: string | null;
  procedure: string | null;
  equipment: string | null;
  deviceUsage: string | null;
  requestedVehicleType: string | null; // 2a auditoria
  triageCompleted: boolean | null; // 2a auditoria
  tipoChamadoId: number | null;
  tipoChamadoText: string | null; // 2a auditoria
  callReason: string | null; // AUSENTE do flow real hoje
  requestOrigin: string | null; // 2a auditoria
  requestedAt: Date | null; // 2a auditoria
  originName: string | null;
  originAddress: string | null;
  originSector: string | null;
  destinationName: string | null;
  destinationAddress: string | null;
  destinationSector: string | null;
  companion: string | null; // AUSENTE do flow real hoje
  originDoctor: string | null; // 2a auditoria
  destinationDoctor: string | null; // 2a auditoria
  state: string | null; // 2a auditoria
  orderNumber: number | null; // 2a auditoria
  notes: string | null; // 2a auditoria
  // Texto bruto da origem — o mapeamento pro enum StatusChamado acontece no
  // sync (ver mapStatusChamado em index.ts), nao aqui.
  statusRaw: string | null;
  statusForEdit: string | null;
  motivoCancelamentoRaw: string | null; // motivo_Cancelamento — categoria curta, vira FK MotivoCancelamento
  cancellationNotes: string | null; // Obs_de_Cancelamento — texto livre, CONFIRMADO 2026-09-21 diferente do motivo
  expectedArrivalOriginAt: Date | null;
  expectedArrivalDestAt: Date | null; // 2a auditoria
  actualArrivalDestAt: Date | null;
  aereoRequestId: number | null;
  aereoText: string | null; // 2a auditoria
  ambulanciaAereo: string | null; // 2a auditoria
}

// --- Operacao (origem: f_Operacao_Controle_Dados_do_Chamado) -------------
// Era MissionEntry antes. 1 Chamado : N Operacoes (Ida/Volta, confirmado
// empirico 2026-09-21 — N nao e sempre 2).
export interface OperacaoEntry {
  id: number;
  chamadoId: number; // ID_Chamado na origem — VALIDADO 2026-09-21 (300/300 bateram contra Chamado.id real)
  tripTypeRaw: string; // Tipo_de_viagem — vira TipoViagem no sync (capitalizacao inconsistente na origem)
  equipeId: number | null;
  veiculoId: number | null;
  currentStatusRaw: string | null; // Status_atual_da_operacao — vira StatusOperacao no sync
  shortStatus: string | null;
  operationStatus: string | null; // sempre null em 300 registros reais testados, mantido por decisao do usuario
  acceptanceStatus: string | null; // 2a auditoria
  minAmbulanceAt: Date | null; // 2a auditoria
  assignedFlag: boolean | null; // 2a auditoria
  state: string | null; // 2a auditoria
  acknowledgementStatus: string | null; // 2a auditoria
  departedToOriginStatus: string | null; // 2a auditoria
  arrivedAtOriginStatus: string | null; // 2a auditoria
  departedToDestStatus: string | null; // 2a auditoria
  arrivedAtDestStatus: string | null; // 2a auditoria
  finishedStatus: string | null; // 2a auditoria
  assignedAt: Date | null;
  assignedByEmail: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByEmail: string | null;
  departedToOriginAt: Date | null;
  departedToOriginByEmail: string | null;
  arrivedAtOriginAt: Date | null;
  arrivedAtOriginByEmail: string | null;
  departedToDestAt: Date | null;
  departedToDestByEmail: string | null;
  arrivedAtDestAt: Date | null;
  arrivedAtDestByEmail: string | null;
  finishedAt: Date | null;
  finishedByEmail: string | null;
  lastActionAt: Date | null;
  etaOrigin: Date | null; // 2a auditoria
  etaDestination: Date | null; // 2a auditoria
  originAddress: string | null; // 2a auditoria
  destinationAddress: string | null; // 2a auditoria
  cancelledAt: Date | null;
  cancellationReason: string | null; // 2a auditoria
  cancellationNotes: string | null; // 2a auditoria
  cancellationAreaResponsible: string | null;
  aereoRequestId: number | null; // 2a auditoria
  ambulanciaAereo: string | null; // 2a auditoria
  disponibilidadeRequestId: number | null; // 2a auditoria
  // Amb_1..6_Latitude_e_Longitude + Amb_1..6_tempo_min_entre_essa_etapa
  // consolidados aqui pelo source (achatado na origem, agrupado no sync) —
  // ver waypointsJson em operacao.prisma.
  waypoints: Array<{ latLon: string | null; minutesToNextStage: number | null }>;
  fichaTransporteFrenteUrl: string | null;
  fichaTransporteVersoUrl: string | null;
  patientIsolation: string | null;
  cleaningNurse: string | null;
  appVersion: string | null;
  device: string | null;
  qta: string | null;
}

// --- Triagem (origem: f_Triagem) ------------------------------------------
// 1:1 com Chamado (confirmado 2026-09-21, sem retriagem por enquanto).
export interface TriagemEntry {
  id: number;
  chamadoId: number;
  diagnosis: string | null;
  clinicalHistory: string | null;
  vitalSigns: string | null;
  resourceType: string | null;
  resourceNeeded: string | null;
  companion: string | null;
  medicationsInPump: string | null;
  biaEcmo: string | null;
  precautionTypes: string | null;
  weightAndHeight: string | null;
  incorrectInformation: string | null;
  interventions: string | null;
  hadIntervention: string | null; // 2a auditoria
  neededMedicalContact: boolean | null;
  doctorNameAndCrm: string | null;
  cancellationReason: string | null;
  hadCancellation: string | null; // 2a auditoria
  requestReason: string | null; // 2a auditoria
  originHospitalContact: string | null; // 2a auditoria
  destinationHospitalContact: string | null; // 2a auditoria
  detectedIncorrectInfo: string | null; // 2a auditoria
  nurseAvailability: string | null; // 2a auditoria
  nurseAbsenceReason: string | null; // 2a auditoria
  requestedAt: Date | null; // 2a auditoria
  state: string | null; // 2a auditoria
  resourceNeededLegacyText: string | null; // 2a auditoria
  precautionTypeLegacyText: string | null; // 2a auditoria
}

// --- Diario da Missao (origem: f_Diario_da_Missao) ------------------------
// Era MissionEventEntry antes — fonte real CONFIRMADA 2026-09-21 (estava
// certa desde o inicio, so nunca tinha sido conectada: POWER_AUTOMATE_
// MISSION_EVENTS_URL nunca foi configurado). Alimenta a linha do tempo da
// missao no frontend (MissionTimeline.tsx), hoje mockada.
export interface DiarioEntry {
  id: number;
  chamadoId: number;
  operacaoId: number | null;
  disponibilidadeId: number | null;
  message: string | null;
  currentMoment: string | null;
  tripTypeRaw: string | null;
  accessType: string | null;
  readStatusRequester: number | null;
  readStatusControl: number | null;
  readStatusRescue: number | null;
  state: string | null; // 2a auditoria
  createdAt: Date;
  createdBy: string | null;
}

// --- Equipe / Colaborador / ComposicaoEquipe (origem: d_Cadastro_de_Equipes,
// d_Cadastro_Colaboradores, d_Compor_equipe) --------------------------------
// Achado 2026-09-21 (2a auditoria): essas 3 entidades tinham colunas
// mapeadas no schema mas NENHUM ciclo de sync as populava — sem isso,
// Operacao.equipeId nunca resolveria de verdade (a Equipe nunca seria
// criada no banco).
export interface EquipeEntry {
  id: number;
  name: string;
  activityStatus: string | null;
  whatsapp: string | null;
  state: string | null;
  assignedBy: string | null;
}

export interface ColaboradorEntry {
  id: number;
  name: string;
  nickname: string | null;
  role: string | null;
  activityStatus: string | null;
  whatsapp: string | null;
  rg: string | null;
  cnh: string | null;
  photoUrl: string | null;
  token: string | null;
  state: string | null;
}

export interface ComposicaoEquipeEntry {
  id: number;
  equipeId: number;
  colaboradorId: number;
  state: string | null;
}

export interface DataSource {
  fetchVeiculos(): Promise<VeiculoEntry[]>;
  fetchEquipes(): Promise<EquipeEntry[]>;
  fetchColaboradores(): Promise<ColaboradorEntry[]>;
  fetchComposicaoEquipe(): Promise<ComposicaoEquipeEntry[]>;

  // Mesmo padrao de watermark por ID do antigo fetchHistoryForVehicle: a
  // lista de rastreio passa de 5.000 itens e o SharePoint recusa filtro/
  // ordenacao em coluna nao indexada acima desse limite — "ID" e sempre
  // indexada e a lista e append-only, entao ID maior = mais novo.
  fetchPosicaoForVeiculo(veiculoId: number, sinceItemId: number): Promise<PosicaoEntry[]>;

  // Backfill por OPERACAO (nao por veiculo) — so recupera "action" em
  // linhas ja sincronizadas antes desse campo existir. Nao avanca watermark.
  fetchPosicaoBackfillForOperacao(operacaoId: number): Promise<PosicaoEntry[]>;

  // Sem cursor, mesmo padrao do antigo fetchRecentMissions/fetchRecentRegulations:
  // "Modified" nao e indexada, entao o flow devolve os N mais recentes por
  // "ID desc" e o sync faz upsert de todos a cada ciclo.
  fetchRecentChamados(): Promise<ChamadoEntry[]>;
  fetchRecentOperacoes(): Promise<OperacaoEntry[]>;
  fetchRecentDisponibilidades(): Promise<DisponibilidadeEntry[]>;
  fetchRecentTriagens(): Promise<TriagemEntry[]>;
  fetchDiarioSince(since: Date): Promise<DiarioEntry[]>;
}

// --- Aeronaves (OpenSky) ---------------------------------------------------
// Pipeline separado de proposito (split pro aircraft-tracker/ ainda
// pendente, ver TAREFAS_Reestruturacao_Aircraft_Tracker_Banco.md — pausado
// 2026-09-21 em favor da reescrita do nucleo primeiro). Intacto aqui.

export type AircraftRegion = 'SP' | 'RJ';

export interface AircraftEntry {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  region: AircraftRegion;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  positionAt: Date;
}
