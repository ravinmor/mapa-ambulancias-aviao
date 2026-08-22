import { Prisma, VehicleStatus } from '@prisma/client';
import config from './config';
import { prisma } from './db';
import { runAircraftCycle } from './aircraft';
import { simulatedSource } from './sources/simulated';
import { sharepointSource } from './sources/sharepoint';
import { DataSource, FleetEntry } from './types';

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

// "Desde quando buscar" vem do proprio MAX(position_at) ja salvo — sem
// tabela de controle separada. Tabela vazia (primeiro run, ou depois de uma
// limpeza total) cai pro momento atual, NAO pro inicio da janela de
// retencao — o volume de ~30 dias de ping a cada 30s por van (milhoes de
// linhas) e grande demais pra puxar via polling do flow HTTP (arrisca
// estourar o limite de paginacao do SharePoint em coluna nao indexada).
// Historico anterior a "agora" sempre entra via import manual direto no
// Postgres (fora do sync), nunca por aqui — ver DECISOES_Infra_
// MapaAmbulancias.md.
async function getHistoryWatermark(): Promise<Date> {
  const latest = await prisma.positionHistory.findFirst({
    orderBy: { positionAt: 'desc' },
    select: { positionAt: true },
  });
  return latest?.positionAt ?? new Date();
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

async function runHistoryCycle(): Promise<void> {
  if (!historyConfigured()) {
    console.log('[sync-job] history pulado — POWER_AUTOMATE_TRACKING_URL nao configurado ainda');
    return;
  }
  const since = await getHistoryWatermark();
  const entries = await source.fetchHistorySince(since);
  const idByVehicleId = await loadVehicleIdMap();

  const rows = entries.flatMap((entry) => {
    const vehicleId = idByVehicleId.get(entry.vehicleId);
    if (vehicleId == null) {
      console.warn(`[sync-job] historico ignorado — veiculo desconhecido: ${entry.vehicleId}`);
      return [];
    }
    return [
      {
        id: entry.id,
        vehicleId,
        latitude: entry.latitude,
        longitude: entry.longitude,
        positionAt: entry.positionAt,
        vehicleStatus: toVehicleStatus(entry.vehicleStatus),
        callId: entry.callId,
        operationId: entry.operationId,
        appVersion: entry.appVersion,
        device: entry.device,
      },
    ];
  });

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

  console.log(`[sync-job] history ok — ${rows.length} ponto(s) novo(s), ${deleted.count} expirado(s) removido(s) (retencao: ${config.historyRetentionDays}d)`);
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
// 4o loop, independente dos outros 3 e MUITO mais espacado (5 min por
// default). O motivo nao e a origem escrever devagar como no caso do
// historico das vans, e sim a cota: 400 creditos/dia no acesso anonimo do
// OpenSky, 1 por chamada. Ver o bloco OpenSkyConfig em config.ts.
startLoop('aeronaves', config.opensky.syncIntervalMs, runAircraftCycle);
