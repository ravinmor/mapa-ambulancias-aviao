import { Prisma, VehicleStatus } from '@prisma/client';
import config from './config';
import { prisma } from './db';
import { runAircraftCycle } from './aircraft';
import { simulatedSource } from './sources/simulated';
import { sharepointSource } from './sources/sharepoint';
import { DataSource, FleetEntry, HistoryEntry } from './types';

const source: DataSource = config.dataSource === 'sharepoint' ? sharepointSource : simulatedSource;

// Traduz o texto real de "Status Operacao" (SharePoint) pro enum interno —
// confirmado pelo usuario em 2026-08-19 (ver DECISOES_Infra_MapaAmbulancias.md).
// Valor desconhecido vira null em vez de derrubar o ciclo inteiro: a origem
// e um sistema que nao controlamos, um texto novo/typo nao pode quebrar o sync.
// Textos confirmados contra o dado real da lista (2026-08-20): a origem usa
// "Fora da Operação" (com "da", nao "de" como o doc antigo assumia) e tem um
// 7o valor "Sem Operação" que nao existia no desenho — os dois caem em
// AVAILABLE (van que nao esta operando; mapeamento provisorio, confirmar
// semantica exata com o usuario se "Sem Operação" precisar de tratamento
// proprio).
const STATUS_TEXT_TO_ENUM: Record<string, VehicleStatus> = {
  'Em Operação': VehicleStatus.IN_SERVICE,
  'Baixa Operacional': VehicleStatus.INACTIVE,
  'Em Manutenção': VehicleStatus.MAINTENANCE,
  'Fora da Operação': VehicleStatus.AVAILABLE,
  'Sem Operação': VehicleStatus.AVAILABLE,
  Reserva: VehicleStatus.RESERVE,
  'Apoio Amil': VehicleStatus.EVENT_SUPPORT,
};

function toVehicleStatus(raw: string | null): VehicleStatus | null {
  if (raw == null) return null;
  const mapped = STATUS_TEXT_TO_ENUM[raw];
  if (!mapped) {
    console.warn(`[sync-job] status desconhecido, ignorado: "${raw}"`);
    return null;
  }
  return mapped;
}

// Guarda contra escrita fora de ordem: so atualiza se a posicao nova for
// mais recente que a ja salva. updateMany aceita WHERE (upsert nao aceita);
// se nao afetou nada, ou a linha ainda nao existe (createMany cria), ou o
// dado recebido esta desatualizado (createMany com skipDuplicates nao faz
// nada, pois a chave primaria ja existe) — nos dois casos e seguro tentar.
// Usado tanto pelo ciclo de frota quanto pelo de historico (ver
// runHistoryCycle) — a origem tem 2 listas com cadencia diferente (cadastro
// as vezes atualiza Latitude_atual/Longitude_atual mais devagar que o
// rastreio grava um ping novo), entao o "mais recente" pode vir de
// qualquer uma das duas. Sem isso o circulo no mapa (que le so
// CurrentPosition) fica pra tras da linha do trajeto (que le
// PositionHistory), como reportado pelo usuario em 2026-08-21.
async function updatePositionIfNewer(
  tx: Prisma.TransactionClient,
  vehicleId: number,
  latitude: number,
  longitude: number,
  positionAt: Date,
): Promise<void> {
  const updated = await tx.currentPosition.updateMany({
    where: { vehicleId, positionAt: { lt: positionAt } },
    data: { latitude, longitude, positionAt, updatedAt: new Date() },
  });
  if (updated.count === 0) {
    await tx.currentPosition.createMany({
      data: [{ vehicleId, latitude, longitude, positionAt }],
      skipDuplicates: true,
    });
  }
}

async function upsertVehicle(tx: Prisma.TransactionClient, entry: FleetEntry): Promise<number> {
  const vehicle = await tx.vehicle.upsert({
    where: { vehicleId: entry.vehicleId },
    create: {
      vehicleId: entry.vehicleId,
      name: entry.name,
      licensePlate: entry.licensePlate,
      vehicleType: entry.vehicleType,
      state: entry.state,
      status: toVehicleStatus(entry.status),
      activityStatus: entry.activityStatus,
      assignmentStatus: entry.assignmentStatus,
      tabletEmail: entry.tabletEmail,
      statusChangedAt: entry.statusChangedAt,
    },
    update: {
      name: entry.name,
      licensePlate: entry.licensePlate,
      vehicleType: entry.vehicleType,
      state: entry.state,
      status: toVehicleStatus(entry.status),
      activityStatus: entry.activityStatus,
      assignmentStatus: entry.assignmentStatus,
      tabletEmail: entry.tabletEmail,
      statusChangedAt: entry.statusChangedAt,
      updatedAt: new Date(),
    },
  });

  if (entry.latitude != null && entry.longitude != null && entry.positionAt != null) {
    await updatePositionIfNewer(tx, vehicle.id, entry.latitude, entry.longitude, entry.positionAt);
  }

  return vehicle.id;
}

async function runFleetCycle(): Promise<void> {
  const entries = await source.fetchFleet();
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      await upsertVehicle(tx, entry);
    }
  });
  console.log(`[sync-job] fleet ok — ${entries.length} veiculo(s) (fonte: ${config.dataSource})`);
}

async function loadVehicleIdMap(): Promise<Map<string, number>> {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, vehicleId: true } });
  return new Map(vehicles.map((v) => [v.vehicleId, v.id]));
}

// Marcador incremental POR VEICULO, medido pelo ID DO ITEM no SharePoint
// (PositionHistory.id ja e esse id — ver position_history.prisma), nao por
// timestamp. O motivo de nao ser por data esta em types.ts: acima de 5.000
// itens o SharePoint recusa filtro/ordenacao em coluna nao indexada, e
// "Data_Localizacao" nao e indexada. "ID" e sempre indexada.
//
// E por veiculo, nao global, porque com a busca filtrada por van um marcador
// global quebraria o caso que mais importa: van que ACABOU de entrar em
// operacao teria o trajeto cortado, ja que o marcador global estaria no
// presente por causa das outras vans.
//
// Zero = nunca sincronizamos essa van. O flow trata isso devolvendo os 500
// itens mais novos dela (ordem decrescente), o que cobre a missao em curso.
async function getVehicleHistoryWatermark(vehicleId: number): Promise<number> {
  const latest = await prisma.positionHistory.findFirst({
    where: { vehicleId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? 0;
}

// Flow de historico e opcional (so o de frota e obrigatorio pra subir) — se
// ainda nao foi configurado, pula o ciclo em vez de derrubar o loop inteiro.
// So faz sentido checar no modo sharepoint; simulated sempre tem os 2.
function historyConfigured(): boolean {
  return config.dataSource !== 'sharepoint' || Boolean(config.sharepoint?.trackingUrl);
}

function missionEventsConfigured(): boolean {
  return config.dataSource !== 'sharepoint' || Boolean(config.sharepoint?.missionEventsUrl);
}

function missionsConfigured(): boolean {
  return config.dataSource !== 'sharepoint' || Boolean(config.sharepoint?.missionsUrl);
}

function regulationsConfigured(): boolean {
  return config.dataSource !== 'sharepoint' || Boolean(config.sharepoint?.regulationsUrl);
}

// Rebusca os N chamados mais recentes e faz upsert de todos. Sem cursor
// incremental de proposito — ver fetchRecentMissions em types.ts (resumo:
// "Modified" nao e indexada e a lista passou do limite de 5.000 itens, entao
// filtrar por ela seria recusado pelo SharePoint).
//
// Upsert, nao createMany: esta lista e ATUALIZADA a cada etapa da missao, e
// e justamente essa atualizacao que a linha do tempo precisa capturar.
async function runMissionCycle(): Promise<void> {
  if (!missionsConfigured()) {
    console.log('[sync-job] missions pulado — POWER_AUTOMATE_MISSIONS_URL nao configurado ainda');
    return;
  }

  const entries = await source.fetchRecentMissions();

  for (const entry of entries) {
    const data = {
      callId: entry.callId,
      vehicleId: entry.vehicleId,
      teamId: entry.teamId,
      state: entry.state,
      tripType: entry.tripType,
      operationStatus: entry.operationStatus,
      currentStatusText: entry.currentStatusText,
      shortStatusText: entry.shortStatusText,
      acceptanceStatus: entry.acceptanceStatus,
      departedToOriginStatus: entry.departedToOriginStatus,
      arrivedAtOriginStatus: entry.arrivedAtOriginStatus,
      departedToDestStatus: entry.departedToDestStatus,
      arrivedAtDestStatus: entry.arrivedAtDestStatus,
      finishedStatus: entry.finishedStatus,
      assignedAt: entry.assignedAt,
      acknowledgedAt: entry.acknowledgedAt,
      lastActionAt: entry.lastActionAt,
      cancelledAt: entry.cancelledAt,
      cancellationReason: entry.cancellationReason,
      etaOrigin: entry.etaOrigin,
      etaDestination: entry.etaDestination,
    };

    await prisma.mission.upsert({
      where: { id: entry.id },
      create: { id: entry.id, ...data },
      update: { ...data, updatedAt: new Date() },
    });
  }

  console.log(`[sync-job] missions ok — ${entries.length} chamado(s) sincronizado(s)`);
}

// Mesmo padrao de runMissionCycle: sem cursor, upsert de todos os N mais
// recentes a cada ciclo. Independente do ciclo de missoes (lista diferente,
// pode ter cadencia/tamanho diferente) — falha num nao afeta o outro.
async function runRegulationCycle(): Promise<void> {
  if (!regulationsConfigured()) {
    console.log('[sync-job] regulations pulado — POWER_AUTOMATE_REGULATIONS_URL nao configurado ainda');
    return;
  }

  const entries = await source.fetchRecentRegulations();

  for (const entry of entries) {
    const data = {
      originName: entry.originName,
      destinationName: entry.destinationName,
      originAddress: entry.originAddress,
      destinationAddress: entry.destinationAddress,
      originSector: entry.originSector,
      destinationSector: entry.destinationSector,
      patientName: entry.patientName,
      patientAge: entry.patientAge,
      patientSex: entry.patientSex,
      birthDate: entry.birthDate,
      weightKg: entry.weightKg,
      heightCm: entry.heightCm,
      diagnosis: entry.diagnosis,
      callReason: entry.callReason,
      patientType: entry.patientType,
      patientTypeOther: entry.patientTypeOther,
      companion: entry.companion,
      isIntubated: entry.isIntubated,
      isObese: entry.isObese,
      triageCompleted: entry.triageCompleted,
      healthPlan: entry.healthPlan,
      procedure: entry.procedure,
      equipment: entry.equipment,
      deviceUsage: entry.deviceUsage,
      originDoctor: entry.originDoctor,
      destinationDoctor: entry.destinationDoctor,
      notes: entry.notes,
    };

    await prisma.regulation.upsert({
      where: { id: entry.id },
      create: { id: entry.id, ...data },
      update: { ...data, updatedAt: new Date() },
    });
  }

  console.log(`[sync-job] regulations ok — ${entries.length} registro(s) sincronizado(s)`);
}

async function runHistoryCycle(): Promise<void> {
  if (!historyConfigured()) {
    console.log('[sync-job] history pulado — POWER_AUTOMATE_TRACKING_URL nao configurado ainda');
    return;
  }

  // So quem esta EM OPERACAO tem trajeto (decisao do usuario). Isso tambem e
  // o que torna a consulta viavel: em vez de pedir a frota inteira desde um
  // marcador global (o que estourava o timeout do flow), pergunta-se pouca
  // coisa, de poucas vans.
  const inService = await prisma.vehicle.findMany({
    where: { status: VehicleStatus.IN_SERVICE },
    select: { id: true, vehicleId: true },
  });

  if (inService.length === 0) {
    console.log('[sync-job] history — nenhuma van em operacao, nada a buscar');
    return;
  }

  const entries: (HistoryEntry & { internalVehicleId: number })[] = [];
  const failures: string[] = [];

  // Sequencial, nao em paralelo, de proposito: o flow do Power Automate ja
  // deu sinal de throttling quando recebeu chamadas concentradas. Uma de
  // cada vez e mais lento e bem menos arriscado. Uma van que falha nao
  // impede as outras de sincronizar neste mesmo ciclo.
  for (const vehicle of inService) {
    try {
      const sinceItemId = await getVehicleHistoryWatermark(vehicle.id);
      const fetched = await source.fetchHistoryForVehicle(vehicle.vehicleId, sinceItemId);
      for (const entry of fetched) {
        entries.push({ ...entry, internalVehicleId: vehicle.id });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${vehicle.vehicleId}: ${message}`);
    }
  }

  const rows = entries.map((entry) => ({
    id: entry.id,
    vehicleId: entry.internalVehicleId,
    latitude: entry.latitude,
    longitude: entry.longitude,
    positionAt: entry.positionAt,
    vehicleStatus: toVehicleStatus(entry.vehicleStatus),
    callId: entry.callId,
    operationId: entry.operationId,
    appVersion: entry.appVersion,
    device: entry.device,
  }));

  // id = o proprio ID do item no SharePoint (ver position_history.prisma) —
  // reenviar uma linha ja sincronizada e no-op, nao duplicata.
  if (rows.length > 0) {
    await prisma.positionHistory.createMany({ data: rows, skipDuplicates: true });
  }

  // So o ponto mais novo por van (nao teria sentido escrever CurrentPosition
  // repetidas vezes com pontos mais antigos dentro do mesmo lote).
  const latestByVehicle = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const current = latestByVehicle.get(row.vehicleId);
    if (!current || row.positionAt > current.positionAt) {
      latestByVehicle.set(row.vehicleId, row);
    }
  }
  if (latestByVehicle.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const row of latestByVehicle.values()) {
        await updatePositionIfNewer(tx, row.vehicleId, row.latitude, row.longitude, row.positionAt);
      }
    });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.historyRetentionDays);
  const deleted = await prisma.positionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });

  const failureNote = failures.length > 0 ? ` — ${failures.length} van(s) falharam: ${failures.join('; ')}` : '';
  console.log(
    `[sync-job] history ok — ${inService.length} van(s) em operacao, ${rows.length} ponto(s) novo(s), ` +
      `${deleted.count} expirado(s) removido(s) (retencao: ${config.historyRetentionDays}d)${failureNote}`,
  );
}

// Cursor incremental pelo proprio MAX(created_at) ja salvo — mesmo padrao de
// getHistoryWatermark (mesmo fallback pra "agora" com tabela vazia, mesmo
// motivo). Sem FK pra vehicle, entao (diferente de history) nao depende do
// fleet cycle ter rodado antes.
async function getMissionEventWatermark(): Promise<Date> {
  const latest = await prisma.missionEvent.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? new Date();
}

async function runMissionEventCycle(): Promise<void> {
  if (!missionEventsConfigured()) {
    console.log('[sync-job] mission events pulado — POWER_AUTOMATE_MISSION_EVENTS_URL nao configurado ainda');
    return;
  }
  const since = await getMissionEventWatermark();
  const entries = await source.fetchMissionEventsSince(since);

  if (entries.length > 0) {
    await prisma.missionEvent.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        callId: entry.callId,
        operationId: entry.operationId,
        availabilityId: entry.availabilityId,
        tripType: entry.tripType,
        statusMessage: entry.statusMessage,
        message: entry.message,
        accessType: entry.accessType,
        state: entry.state,
        readStatusRequester: entry.readStatusRequester,
        readStatusControl: entry.readStatusControl,
        readStatusRescue: entry.readStatusRescue,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy,
      })),
      skipDuplicates: true,
    });
  }

  console.log(`[sync-job] mission events ok — ${entries.length} evento(s) novo(s)`);
}

// 3 loops INDEPENDENTES, nao mais 1 ciclo unico compartilhado — frota
// (posicao ao vivo) roda rapido (syncIntervalMs, default 5s), historico e
// eventos de missao rodam bem mais espacados (default 30s cada, casado com
// o intervalo real de escrita da origem). Bater esses 2 ultimos no mesmo
// ritmo da frota era 5x mais chamadas do que a origem tem dado novo pra
// mostrar — suspeita forte de ser a causa do throttling visto no flow de
// historico (ver DECISOES_Infra_MapaAmbulancias.md). Cada loop trata seu
// proprio erro sem derrubar os outros 2.
function startLoop(name: string, intervalMs: number, task: () => Promise<void>): void {
  async function tick(): Promise<void> {
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sync-job] erro no ciclo de ${name}:`, message);
    } finally {
      setTimeout(tick, intervalMs);
    }
  }
  tick();
}

console.log(
  `[sync-job] iniciando — fonte: ${config.dataSource}, frota: ${config.syncIntervalMs}ms, historico: ${config.historySyncIntervalMs}ms, eventos: ${config.missionEventSyncIntervalMs}ms, aeronaves: ${config.opensky.syncIntervalMs}ms (${config.opensky.source})`,
);
startLoop('frota', config.syncIntervalMs, runFleetCycle);
startLoop('historico', config.historySyncIntervalMs, runHistoryCycle);
startLoop('eventos de missao', config.missionEventSyncIntervalMs, runMissionEventCycle);
startLoop('missoes', config.missionSyncIntervalMs, runMissionCycle);
startLoop('regulacoes', config.regulationSyncIntervalMs, runRegulationCycle);
// 4o loop, independente dos outros 3 e MUITO mais espacado (5 min por
// default). O motivo nao e a origem escrever devagar como no caso do
// historico das vans, e sim a cota: 400 creditos/dia no acesso anonimo do
// OpenSky, 1 por chamada. Ver o bloco OpenSkyConfig em config.ts.
startLoop('aeronaves', config.opensky.syncIntervalMs, runAircraftCycle);
