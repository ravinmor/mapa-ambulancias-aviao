"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Carrega o .env da RAIZ do projeto (o mesmo que o docker-compose ja usa
// pra substituicao de variavel) — so importa fora do Docker: la dentro o
// container ja recebe tudo via `environment:`, e esse arquivo nem existe na
// imagem (gitignored, nao copiado pelo Dockerfile), entao a chamada abaixo
// so falha silenciosamente e process.env segue como o compose deixou.
// Precisa ser o PRIMEIRO import — 'config' le process.env assim que e
// importado, e com "module":"commonjs" (tsconfig.json) os imports viram
// require() em ordem, entao isso so funciona por vir antes dele.
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("./config"));
const db_1 = require("./db");
// Pipeline generico do OpenSky (busca por area, ate 10 vagas SP/RJ) —
// RELIGADO (pedido do usuario, 2026-09-02): estava desligado desde
// 2026-09-01 pra dar lugar ao trackedAircraft.ts (aeronaves especificas por
// ICAO24 fixo), que continua rodando em paralelo, sem conflito — sao 2
// pipelines independentes, tabelas diferentes (aircraft vs tracked_aircraft).
const aircraft_1 = require("./aircraft");
const trackedAircraft_1 = require("./trackedAircraft");
const aircraftScheduling_1 = require("./aircraftScheduling");
const garminTracking_1 = require("./garminTracking");
const simulated_1 = require("./sources/simulated");
const sharepoint_1 = require("./sources/sharepoint");
const source = config_1.default.dataSource === 'sharepoint' ? sharepoint_1.sharepointSource : simulated_1.simulatedSource;
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
const STATUS_TEXT_TO_ENUM = {
    'Em Operação': client_1.VehicleStatus.IN_SERVICE,
    'Baixa Operacional': client_1.VehicleStatus.INACTIVE,
    'Em Manutenção': client_1.VehicleStatus.MAINTENANCE,
    'Fora da Operação': client_1.VehicleStatus.AVAILABLE,
    'Sem Operação': client_1.VehicleStatus.AVAILABLE,
    Reserva: client_1.VehicleStatus.RESERVE,
    'Apoio Amil': client_1.VehicleStatus.EVENT_SUPPORT,
};
function toVehicleStatus(raw) {
    if (raw == null)
        return null;
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
async function updatePositionIfNewer(tx, vehicleId, latitude, longitude, positionAt) {
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
async function upsertVehicle(tx, entry) {
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
async function runFleetCycle() {
    const entries = await source.fetchFleet();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            await upsertVehicle(tx, entry);
        }
    });
    console.log(`[sync-job] fleet ok — ${entries.length} veiculo(s) (fonte: ${config_1.default.dataSource})`);
}
async function loadVehicleIdMap() {
    const vehicles = await db_1.prisma.vehicle.findMany({ select: { id: true, vehicleId: true } });
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
async function getVehicleHistoryWatermark(vehicleId) {
    // Exclui linhas do backfill (id >= BACKFILL_ID_OFFSET, ver sharepoint.ts)
    // — sem isso, o backfill mais recente vira o "watermark" e o cursor do
    // rastreamento normal pula pra mais de 1 bilhao, parando de achar linha
    // nova pra sempre (bug real ja visto, 2026-09-15).
    const latest = await db_1.prisma.positionHistory.findFirst({
        where: { vehicleId, id: { lt: sharepoint_1.BACKFILL_ID_OFFSET } },
        orderBy: { id: 'desc' },
        select: { id: true },
    });
    return latest?.id ?? 0;
}
// Flow de historico e opcional (so o de frota e obrigatorio pra subir) — se
// ainda nao foi configurado, pula o ciclo em vez de derrubar o loop inteiro.
// So faz sentido checar no modo sharepoint; simulated sempre tem os 2.
function historyConfigured() {
    return config_1.default.dataSource !== 'sharepoint' || Boolean(config_1.default.sharepoint?.trackingUrl);
}
function historyBackfillConfigured() {
    return config_1.default.dataSource !== 'sharepoint' || Boolean(config_1.default.sharepoint?.historyBackfillUrl);
}
function missionEventsConfigured() {
    return config_1.default.dataSource !== 'sharepoint' || Boolean(config_1.default.sharepoint?.missionEventsUrl);
}
function missionsConfigured() {
    return config_1.default.dataSource !== 'sharepoint' || Boolean(config_1.default.sharepoint?.missionsUrl);
}
function regulationsConfigured() {
    return config_1.default.dataSource !== 'sharepoint' || Boolean(config_1.default.sharepoint?.regulationsUrl);
}
// Rebusca os N chamados mais recentes e faz upsert de todos. Sem cursor
// incremental de proposito — ver fetchRecentMissions em types.ts (resumo:
// "Modified" nao e indexada e a lista passou do limite de 5.000 itens, entao
// filtrar por ela seria recusado pelo SharePoint).
//
// Upsert, nao createMany: esta lista e ATUALIZADA a cada etapa da missao, e
// e justamente essa atualizacao que a linha do tempo precisa capturar.
async function runMissionCycle() {
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
            qta: entry.qta,
            etaOrigin: entry.etaOrigin,
            etaDestination: entry.etaDestination,
        };
        await db_1.prisma.mission.upsert({
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
async function runRegulationCycle() {
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
        await db_1.prisma.regulation.upsert({
            where: { id: entry.id },
            create: { id: entry.id, ...data },
            update: { ...data, updatedAt: new Date() },
        });
    }
    console.log(`[sync-job] regulations ok — ${entries.length} registro(s) sincronizado(s)`);
}
async function runHistoryCycle() {
    if (!historyConfigured()) {
        console.log('[sync-job] history pulado — POWER_AUTOMATE_TRACKING_URL nao configurado ainda');
        return;
    }
    // So quem esta EM OPERACAO tem trajeto (decisao do usuario). Isso tambem e
    // o que torna a consulta viavel: em vez de pedir a frota inteira desde um
    // marcador global (o que estourava o timeout do flow), pergunta-se pouca
    // coisa, de poucas vans.
    const inService = await db_1.prisma.vehicle.findMany({
        where: { status: client_1.VehicleStatus.IN_SERVICE },
        select: { id: true, vehicleId: true },
    });
    if (inService.length === 0) {
        console.log('[sync-job] history — nenhuma van em operacao, nada a buscar');
        return;
    }
    const entries = [];
    const failures = [];
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
        }
        catch (error) {
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
        action: entry.action,
    }));
    // id = o proprio ID do item no SharePoint (ver position_history.prisma).
    // Upsert em vez de createMany+skipDuplicates (2026-09-14): uma linha ja
    // sincronizada continua no-op pro resto dos campos (lat/lon/etc. nunca
    // mudam pra um ID ja existente), MAS agora "action" e preenchido se
    // ainda estiver nulo. Isso importa pra pontos historicos sincronizados
    // ANTES da leitura de "Acao" existir (a mudanca que introduziu esse
    // campo) — sem o upsert, rebuscar esses pontos de novo (ex: apos um
    // reset pontual do marcador incremental pra alguma van) continuaria sem
    // preencher o horario da etapa que faltava.
    if (rows.length > 0) {
        await db_1.prisma.$transaction(rows.map((row) => db_1.prisma.positionHistory.upsert({
            where: { id: row.id },
            create: row,
            update: row.action != null ? { action: row.action } : {},
        })));
    }
    // So o ponto mais novo por van (nao teria sentido escrever CurrentPosition
    // repetidas vezes com pontos mais antigos dentro do mesmo lote).
    const latestByVehicle = new Map();
    for (const row of rows) {
        const current = latestByVehicle.get(row.vehicleId);
        if (!current || row.positionAt > current.positionAt) {
            latestByVehicle.set(row.vehicleId, row);
        }
    }
    if (latestByVehicle.size > 0) {
        await db_1.prisma.$transaction(async (tx) => {
            for (const row of latestByVehicle.values()) {
                await updatePositionIfNewer(tx, row.vehicleId, row.latitude, row.longitude, row.positionAt);
            }
        });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config_1.default.historyRetentionDays);
    const deleted = await db_1.prisma.positionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });
    const failureNote = failures.length > 0 ? ` — ${failures.length} van(s) falharam: ${failures.join('; ')}` : '';
    console.log(`[sync-job] history ok — ${inService.length} van(s) em operacao, ${rows.length} ponto(s) novo(s), ` +
        `${deleted.count} expirado(s) removido(s) (retencao: ${config_1.default.historyRetentionDays}d)${failureNote}`);
}
// So preenche "action" em linhas que ja existem (upsert com update parcial —
// mesma logica de runHistoryCycle) — nao mexe em posicao atual nem em
// retencao, quem cuida disso e o ciclo normal. Roda so pras vans EM
// OPERACAO pelo mesmo motivo de runHistoryCycle (e o que a tela de
// visualizacao mostra).
//
// Por OPERACAO, nao por veiculo (decisao do usuario, 2026-09-14): busca o
// operationId mais recente de cada van (mesmo lookup usado em
// GET /api/vehicles/:id/mission) e pede ao flow so as linhas daquela missao
// (filtro "ID_Operacao eq <operationId>" — poucas linhas, uma por etapa),
// em vez de repuxar os ultimos 500 pings da van inteira. Van sem
// operationId conhecido ainda (nenhum ping sincronizado com essa van) fica
// de fora do ciclo, nao ha o que backfillar.
async function runHistoryBackfillCycle() {
    if (!historyBackfillConfigured()) {
        console.log('[sync-job] backfill de historico pulado — POWER_AUTOMATE_HISTORY_BACKFILL_URL nao configurado ainda');
        return;
    }
    const inService = await db_1.prisma.vehicle.findMany({
        where: { status: client_1.VehicleStatus.IN_SERVICE },
        select: { id: true, vehicleId: true },
    });
    if (inService.length === 0) {
        return;
    }
    const entries = [];
    const failures = [];
    for (const vehicle of inService) {
        const latest = await db_1.prisma.positionHistory.findFirst({
            where: { vehicleId: vehicle.id, operationId: { not: null } },
            orderBy: { positionAt: 'desc' },
            select: { operationId: true },
        });
        if (!latest?.operationId) {
            continue;
        }
        try {
            const fetched = await source.fetchHistoryBackfillForOperation(latest.operationId);
            for (const entry of fetched) {
                entries.push({ ...entry, internalVehicleId: vehicle.id });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${vehicle.vehicleId} (operacao ${latest.operationId}): ${message}`);
        }
    }
    if (entries.length === 0) {
        return;
    }
    await db_1.prisma.$transaction(entries.map((entry) => db_1.prisma.positionHistory.upsert({
        where: { id: entry.id },
        create: {
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
            action: entry.action,
        },
        update: entry.action != null ? { action: entry.action } : {},
    })));
    const failureNote = failures.length > 0 ? ` — ${failures.length} van(s) falharam: ${failures.join('; ')}` : '';
    console.log(`[sync-job] backfill de historico ok — ${entries.length} linha(s) revisada(s)${failureNote}`);
}
// Cursor incremental pelo proprio MAX(created_at) ja salvo — mesmo padrao de
// getHistoryWatermark (mesmo fallback pra "agora" com tabela vazia, mesmo
// motivo). Sem FK pra vehicle, entao (diferente de history) nao depende do
// fleet cycle ter rodado antes.
async function getMissionEventWatermark() {
    const latest = await db_1.prisma.missionEvent.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    return latest?.createdAt ?? new Date();
}
async function runMissionEventCycle() {
    if (!missionEventsConfigured()) {
        console.log('[sync-job] mission events pulado — POWER_AUTOMATE_MISSION_EVENTS_URL nao configurado ainda');
        return;
    }
    const since = await getMissionEventWatermark();
    const entries = await source.fetchMissionEventsSince(since);
    if (entries.length > 0) {
        await db_1.prisma.missionEvent.createMany({
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
function startLoop(name, intervalMs, task) {
    async function tick() {
        try {
            await task();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[sync-job] erro no ciclo de ${name}:`, message);
        }
        finally {
            setTimeout(tick, intervalMs);
        }
    }
    tick();
}
console.log(`[sync-job] iniciando — fonte: ${config_1.default.dataSource}, frota: ${config_1.default.syncIntervalMs}ms, historico: ${config_1.default.historySyncIntervalMs}ms, backfill: ${config_1.default.historyBackfillIntervalMs}ms, eventos: ${config_1.default.missionEventSyncIntervalMs}ms, aeronaves genericas: ${config_1.default.opensky.syncIntervalMs}ms (${config_1.default.opensky.source}), aeronaves monitoradas: scanner ${config_1.default.trackedAircraft.scannerIntervalMs}ms, parada ${config_1.default.trackedAircraft.idleSyncIntervalMs}ms, voando ${config_1.default.trackedAircraft.flightSyncIntervalMs}ms (icao24s=${config_1.default.trackedAircraft.icao24List.join(',')})`);
startLoop('frota', config_1.default.syncIntervalMs, runFleetCycle);
startLoop('historico', config_1.default.historySyncIntervalMs, runHistoryCycle);
startLoop('backfill de historico', config_1.default.historyBackfillIntervalMs, runHistoryBackfillCycle);
startLoop('eventos de missao', config_1.default.missionEventSyncIntervalMs, runMissionEventCycle);
startLoop('missoes', config_1.default.missionSyncIntervalMs, runMissionCycle);
startLoop('regulacoes', config_1.default.regulationSyncIntervalMs, runRegulationCycle);
// Pipeline generico de aeronaves por area — religado 2026-09-02, roda em
// paralelo ao rastreio das aeronaves especificas (trackedAircraft.ts),
// tabelas diferentes, sem conflito.
startLoop('aeronaves', config_1.default.opensky.syncIntervalMs, aircraft_1.runAircraftCycle);
startLoop('aeronaves monitoradas', config_1.default.trackedAircraft.scannerIntervalMs, trackedAircraft_1.runTrackedAircraftCycle);
// Agendamento de voo (2026-09-22) — so roda se POWER_AUTOMATE_SOLICITACOES_URL
// estiver configurada (ver config.ts); intervalo curto por pedido explicito
// do usuario (5s, bem mais rapido que qualquer outro ciclo de Power
// Automate deste sync-job — os outros usam 30s+ porque a origem deles so
// escreve nesse ritmo; aqui "saber assim que agendar" e o proprio requisito).
if (config_1.default.aircraftScheduling) {
    startLoop('agendamento de aeronave', config_1.default.aircraftScheduling.syncIntervalMs, aircraftScheduling_1.runAircraftSchedulingCycle);
}
// Rastreamento alternativo via Garmin inReach MapShare (2026-09-22) — so
// roda se GARMIN_MAPSHARE_ID estiver configurada (ver config.ts). Intervalo
// bem mais espacado que os outros ciclos de proposito: o inReach reporta
// posicao a cada ~10-40min (medido ao vivo, 2026-09-22), consultar mais
// rapido que isso e so gastar chamada sem dado novo.
if (config_1.default.garminTracking) {
    startLoop('rastreamento Garmin', config_1.default.garminTracking.syncIntervalMs, garminTracking_1.runGarminTrackingCycle);
}
