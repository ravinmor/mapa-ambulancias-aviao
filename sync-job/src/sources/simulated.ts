import config from '../config';
import { DataSource, FleetEntry, HistoryEntry, MissionEntry, MissionEventEntry, RegulationEntry } from '../types';

interface SimulatedVehicle {
  vehicleId: string;
  name: string;
  licensePlate: string;
  vehicleType: string;
  state: string;
  status: string;
  lat: number;
  lon: number;
}

// Estado em memoria do processo — sem dependencia externa, e o que faz o
// "docker compose up" funcionar sem nenhuma credencial do SharePoint.
// Texto em portugues de proposito, igual ao valor real que vem do SharePoint
// ("Status Operacao") — mantem o modo demo exercitando o mesmo mapeamento
// pra enum que o modo sharepoint usa, em vez de um atalho so pro demo.
const fleet: SimulatedVehicle[] = [
  { vehicleId: 'demo-001', name: 'VTR 01', licensePlate: 'DEM0A01', vehicleType: 'BASICO', state: 'SP', status: 'Em Operação', lat: config.centerLat, lon: config.centerLon },
  { vehicleId: 'demo-002', name: 'VTR 02', licensePlate: 'DEM0A02', vehicleType: 'UTI', state: 'SP', status: 'Em Operação', lat: config.centerLat - 0.01, lon: config.centerLon - 0.01 },
  { vehicleId: 'demo-003', name: 'VTR 03', licensePlate: 'DEM0A03', vehicleType: 'BASICO', state: 'SP', status: 'Em Operação', lat: config.centerLat + 0.01, lon: config.centerLon + 0.01 },
  { vehicleId: 'demo-004', name: 'VTR 04', licensePlate: 'DEM0A04', vehicleType: 'PED', state: 'RJ', status: 'Fora de Operação', lat: config.centerLat - 0.02, lon: config.centerLon + 0.02 },
];

// Contador em memoria simulando o ID de item que o SharePoint atribuiria a
// cada linha nova do rastreio — so pra manter PositionHistory.id preenchido
// de forma coerente no modo demo.
let nextHistoryId = 1;

function randomStep(): number {
  return (Math.random() - 0.5) * 0.004;
}

export const simulatedSource: DataSource = {
  async fetchFleet(): Promise<FleetEntry[]> {
    const now = new Date();
    return fleet.map((v) => {
      v.lat += randomStep();
      v.lon += randomStep();
      return {
        vehicleId: v.vehicleId,
        name: v.name,
        licensePlate: v.licensePlate,
        vehicleType: v.vehicleType,
        state: v.state,
        status: v.status,
        activityStatus: 'Ativo',
        assignmentStatus: null,
        tabletEmail: null,
        statusChangedAt: null,
        latitude: v.lat,
        longitude: v.lon,
        positionAt: now,
      };
    });
  },

  // Modo demo nao tem uma lista de rastreio separada — reaproveita a posicao
  // atual da frota como se fosse um novo ping de historico a cada ciclo, so
  // pra manter a trajetoria funcionando localmente sem credencial nenhuma.
  // Espelha a assinatura por veiculo da fonte real (o segundo parametro,
  // sinceItemId, nao e usado aqui: o modo demo gera ponto novo a cada ciclo,
  // sempre com id crescente). "operationId" fixo por van (demo-op-<id>) pra
  // o modo demo tambem exercitar o trajeto escopado por operacao, e nao so o
  // caminho feliz de operationId nulo.
  async fetchHistoryForVehicle(vehicleId: string): Promise<HistoryEntry[]> {
    const now = new Date();
    return fleet
      .filter((v) => v.vehicleId === vehicleId)
      .map((v) => ({
        id: nextHistoryId++,
        vehicleId: v.vehicleId,
        latitude: v.lat,
        longitude: v.lon,
        positionAt: now,
        vehicleStatus: v.status,
        callId: null,
        operationId: `demo-op-${v.vehicleId}`,
        appVersion: null,
        device: null,
      }));
  },

  // Modo demo nao simula eventos de missao — a fonte de linha do tempo que
  // vale agora e fetchRecentMissions (f_Operacao_Controle_Dados_do_Chamado),
  // nao esta.
  async fetchMissionEventsSince(): Promise<MissionEventEntry[]> {
    return [];
  },

  // Uma missao por van, em andamento: as 4 primeiras etapas preenchidas e as
  // 3 ultimas em aberto. E o estado mais util pra exercitar a timeline no
  // modo demo — mostra progresso parcial, nao missao ja concluida.
  async fetchRecentMissions(): Promise<MissionEntry[]> {
    const now = Date.now();
    const minutesAgo = (n: number) => new Date(now - n * 60000);

    return fleet.map((v, index) => ({
      id: 9000 + index,
      callId: `demo-op-${v.vehicleId}`,
      vehicleId: null,
      teamId: null,
      state: v.state,
      tripType: 'IDA',
      operationStatus: 'Em Operação',
      currentStatusText: 'Chegada na origem confirmada, aguardando iniciar deslocamento para o destino.',
      shortStatusText: 'Na origem',
      acceptanceStatus: 'Confirmado',
      departedToOriginStatus: 'Iniciado',
      arrivedAtOriginStatus: 'Iniciado',
      departedToDestStatus: 'Não Iniciado',
      arrivedAtDestStatus: 'Não Iniciado',
      finishedStatus: 'Não Iniciado',
      assignedAt: minutesAgo(48),
      acknowledgedAt: minutesAgo(45),
      lastActionAt: minutesAgo(20),
      cancelledAt: null,
      cancellationReason: null,
      etaOrigin: minutesAgo(-15),
      etaDestination: minutesAgo(-40),
    }));
  },

  // Um paciente demo por van — mesmo id da missao (9000+index), pra bater
  // com Mission.callId no modo simulado tambem.
  async fetchRegulationForCall(callId: string): Promise<RegulationEntry[]> {
    const index = Number(callId) - 9000;
    if (!Number.isInteger(index) || index < 0 || index >= fleet.length) return [];

    return [{
      id: 9000 + index,
      originName: 'Base Demo',
      destinationName: 'Hospital Demo',
      originAddress: 'Av. Paulista, 1000',
      destinationAddress: 'R. das Flores, 250',
      originSector: null,
      destinationSector: 'Pronto Socorro',
      patientName: 'Paciente Demo',
      patientAge: '54',
      patientSex: 'Masculino',
      birthDate: '1972-03-15',
      weightKg: 78,
      heightCm: '175',
      diagnosis: 'Dor torácica',
      callReason: 'Remoção hospitalar',
      patientType: 'Adulto',
      patientTypeOther: null,
      companion: 'Sem acompanhante',
      isIntubated: false,
      isObese: false,
      triageCompleted: true,
      healthPlan: 'Amil',
      procedure: 'Remoção simples',
      equipment: 'Monitor cardíaco',
      deviceUsage: 'Não',
      originDoctor: 'Dr. Demo',
      destinationDoctor: null,
      notes: null,
    }];
  },
};
