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
// Carrega o .env da RAIZ do projeto — so importa fora do Docker, ver nota
// original abaixo. Precisa ser o PRIMEIRO import.
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("./config"));
const db_1 = require("./db");
const aircraft_1 = require("./aircraft");
const trackedAircraft_1 = require("./trackedAircraft");
const simulated_1 = require("./sources/simulated");
const sharepoint_1 = require("./sources/sharepoint");
// Reescrito 2026-09-21 pro schema do nucleo `resgate` (Chamado/Operacao/
// Veiculo/Equipe/Colaborador/Triagem/Disponibilidade/DiarioDaMissao/
// Posicao*) — ver DESENHO_Schema_Resgate_Nucleo.md e
// AUDITORIA_SharePoint_Resgate.md. Substitui o antigo runFleetCycle/
// runMissionCycle/runRegulationCycle/runHistoryCycle/runMissionEventCycle
// (schema Vehicle/Mission/Regulation/PositionHistory/MissionEvent,
// retirado). Os 2 loops de aeronave (runAircraftCycle/
// runTrackedAircraftCycle) ficam INTACTOS — split pro aircraft-tracker/
// pausado 2026-09-21, e a proxima tarefa depois desta reescrita.
const source = config_1.default.dataSource === 'sharepoint' ? sharepoint_1.sharepointSource : simulated_1.simulatedSource;
// ---------------------------------------------------------------------------
// Helpers genericos — mapeamento de enum com fallback pra SyncErrorLog (nao
// quebra o sync inteiro nem ignora silencioso, decisao 2026-09-21) e
// auditoria de campo critico (so grava se o valor mudou de verdade).
// ---------------------------------------------------------------------------
async function logSyncError(tx, params) {
    await tx.syncErrorLog.create({
        data: {
            entityType: params.entityType,
            sourceItemId: params.sourceItemId ?? null,
            fieldName: params.fieldName ?? null,
            rawValue: params.rawValue,
            errorType: params.errorType,
            message: params.message ?? null,
        },
    });
}
// StatusChamado — valores confirmados contra 300 registros reais (ver
// nucleo_enums.prisma). Texto da origem -> enum; desconhecido vira null +
// SyncErrorLog (nao derruba o ciclo, nao ignora silencioso).
const STATUS_CHAMADO_MAP = {
    'Chamado criado, aguardando aceite do Controle.': client_1.StatusChamado.CRIADO_AGUARDANDO_ACEITE,
    'Chamado Cancelado': client_1.StatusChamado.CANCELADO,
    'Ida Concluída': client_1.StatusChamado.IDA_CONCLUIDA,
    'Volta Concluída': client_1.StatusChamado.VOLTA_CONCLUIDA,
};
const STATUS_OPERACAO_MAP = {
    'Deslocamento para origem iniciado, aguardando confirmação de chegada na origem.': client_1.StatusOperacao.DESLOCANDO_PARA_ORIGEM,
    'Chegada na origem confirmada, aguardando iniciar deslocamento para o destino.': client_1.StatusOperacao.CHEGOU_NA_ORIGEM,
    'Deslocamento para o destino iniciado, aguardando confirmação de chegada no destino.': client_1.StatusOperacao.DESLOCANDO_PARA_DESTINO,
    'Equipe Resgate concluiu missão.': client_1.StatusOperacao.CONCLUIDA_PELO_RESGATE,
    'Equipe do Controle concluiu missão.': client_1.StatusOperacao.CONCLUIDA_PELO_CONTROLE,
    'Chamado Cancelado': client_1.StatusOperacao.CANCELADA,
    'Operação cancelada pela equipe do Resgate.': client_1.StatusOperacao.CANCELADA_PELO_RESGATE,
};
const TIPO_VIAGEM_MAP = {
    IDA: client_1.TipoViagem.IDA,
    Volta: client_1.TipoViagem.VOLTA,
    VOLTA: client_1.TipoViagem.VOLTA,
    Ida: client_1.TipoViagem.IDA,
};
async function mapStatusChamado(tx, raw, sourceItemId) {
    if (raw == null)
        return null;
    const mapped = STATUS_CHAMADO_MAP[raw];
    if (mapped)
        return mapped;
    await logSyncError(tx, {
        entityType: 'Chamado',
        sourceItemId,
        fieldName: 'status',
        rawValue: raw,
        errorType: 'UNMAPPED_ENUM_VALUE',
        message: `Valor de status nao reconhecido em StatusChamado: "${raw}"`,
    });
    return null;
}
async function mapStatusOperacao(tx, raw, sourceItemId) {
    if (raw == null)
        return client_1.StatusOperacao.AGUARDANDO_ACEITE; // null na origem = ninguem aceitou ainda, ver nucleo_enums.prisma
    const mapped = STATUS_OPERACAO_MAP[raw];
    if (mapped)
        return mapped;
    await logSyncError(tx, {
        entityType: 'Operacao',
        sourceItemId,
        fieldName: 'currentStatus',
        rawValue: raw,
        errorType: 'UNMAPPED_ENUM_VALUE',
        message: `Valor de status nao reconhecido em StatusOperacao: "${raw}"`,
    });
    return null;
}
async function mapTipoViagem(tx, raw, sourceItemId) {
    const mapped = TIPO_VIAGEM_MAP[raw];
    if (mapped)
        return mapped;
    await logSyncError(tx, {
        entityType: 'Operacao',
        sourceItemId,
        fieldName: 'tripType',
        rawValue: raw,
        errorType: 'UNMAPPED_ENUM_VALUE',
        message: `Valor de tipo de viagem nao reconhecido em TipoViagem: "${raw}"`,
    });
    return null;
}
// Auditoria de campo critico — so grava se o valor MUDOU (compara contra o
// que ja estava no banco antes do upsert). Usado pelos 3 campos criticos de
// Chamado, os 3 de Operacao e os 2 de Disponibilidade (decisao 2026-09-21).
// Tipo do delegate deixado solto (any) de proposito: os 3 tipos gerados
// pelo Prisma (ChamadoFieldAuditDelegate/OperacaoFieldAuditDelegate/
// DisponibilidadeFieldAuditDelegate) tem "data" com shape exato por model,
// incompatveis entre si num generico estrito — a chamada em si e tipada
// (cada call site sabe o delegate certo), so a assinatura do helper que
// relaxa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auditFieldChanges(auditTable, idFieldName, entityId, before, after, criticalFields, changedBy) {
    for (const field of criticalFields) {
        const oldValue = before ? before[field] : undefined;
        const newValue = after[field];
        const oldStr = oldValue == null ? null : String(oldValue);
        const newStr = newValue == null ? null : String(newValue);
        if (before !== null && oldStr === newStr)
            continue; // sem mudanca — nao audita (nem na 1a insercao, before=null so audita se quiser historico de criacao, decisao: nao audita criacao, so edicao)
        if (before === null)
            continue; // 1a vez que esse registro aparece — nao e "edicao", e criacao, nao audita
        await auditTable.create({
            data: {
                [idFieldName]: entityId,
                fieldName: field,
                oldValue: oldStr,
                newValue: newStr,
                changedBy,
            },
        });
    }
}
// ---------------------------------------------------------------------------
// Veiculo (origem: d_Cadastro_Veiculos) — era runFleetCycle
// ---------------------------------------------------------------------------
async function upsertVeiculo(tx, entry) {
    const data = {
        name: entry.name,
        licensePlate: entry.licensePlate,
        vehicleType: entry.vehicleType,
        activityStatus: entry.activityStatus,
        operationStatus: entry.operationStatus,
        initialKm: entry.initialKm,
        tabletAssignmentStatus: entry.tabletAssignmentStatus,
        tabletId: entry.tabletId ?? undefined,
        tabletEmail: entry.tabletEmail,
        state: entry.state,
        teamAssignmentStatus: entry.teamAssignmentStatus,
        edition: entry.edition,
        statusChangedAt: entry.statusChangedAt,
    };
    await tx.veiculo.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...data },
        update: { ...data, updatedAt: new Date() },
    });
}
async function runVeiculoCycle() {
    const entries = await source.fetchVeiculos();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            // Tablet referenciado pode nao existir ainda (catalogo pequeno, sem
            // ciclo proprio de sync) — guarda de existencia evita erro de FK.
            if (entry.tabletId != null) {
                const tablet = await tx.tablet.findUnique({ where: { id: entry.tabletId } });
                if (!tablet) {
                    await logSyncError(tx, {
                        entityType: 'Veiculo',
                        sourceItemId: entry.id,
                        fieldName: 'tabletId',
                        rawValue: String(entry.tabletId),
                        errorType: 'FK_NAO_ENCONTRADA',
                        message: 'Tablet referenciado nao existe ainda no banco',
                    });
                    entry.tabletId = null;
                }
            }
            await upsertVeiculo(tx, entry);
        }
    });
    console.log(`[sync-job] veiculos ok — ${entries.length} veiculo(s)`);
}
// ---------------------------------------------------------------------------
// Equipe / Colaborador / ComposicaoEquipe — achado 2026-09-21 (2a auditoria):
// faltava ciclo de sync inteiro (nao so campo) pra essas 3 entidades. Sem
// isso, Operacao.equipeId nunca resolveria de verdade.
// ---------------------------------------------------------------------------
async function upsertEquipe(tx, entry) {
    const data = { name: entry.name, activityStatus: entry.activityStatus, whatsapp: entry.whatsapp, state: entry.state, assignedBy: entry.assignedBy };
    await tx.equipe.upsert({ where: { id: entry.id }, create: { id: entry.id, ...data }, update: data });
}
async function runEquipeCycle() {
    if (!config_1.default.sharepoint?.equipesUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] equipes pulado — POWER_AUTOMATE_EQUIPES_URL nao configurado ainda (achado na 2a auditoria, flow ainda nao existe)');
        return;
    }
    const entries = await source.fetchEquipes();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries)
            await upsertEquipe(tx, entry);
    });
    console.log(`[sync-job] equipes ok — ${entries.length} equipe(s)`);
}
async function upsertColaborador(tx, entry) {
    const data = {
        name: entry.name,
        nickname: entry.nickname,
        role: entry.role,
        activityStatus: entry.activityStatus,
        whatsapp: entry.whatsapp,
        rg: entry.rg,
        cnh: entry.cnh,
        photoUrl: entry.photoUrl,
        token: entry.token,
        state: entry.state,
    };
    await tx.colaborador.upsert({ where: { id: entry.id }, create: { id: entry.id, ...data }, update: data });
}
async function runColaboradorCycle() {
    if (!config_1.default.sharepoint?.colaboradoresUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] colaboradores pulado — POWER_AUTOMATE_COLABORADORES_URL nao configurado ainda (achado na 2a auditoria, flow ainda nao existe)');
        return;
    }
    const entries = await source.fetchColaboradores();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries)
            await upsertColaborador(tx, entry);
    });
    console.log(`[sync-job] colaboradores ok — ${entries.length} colaborador(es)`);
}
async function upsertComposicaoEquipe(tx, entry) {
    const [equipe, colaborador] = await Promise.all([
        tx.equipe.findUnique({ where: { id: entry.equipeId } }),
        tx.colaborador.findUnique({ where: { id: entry.colaboradorId } }),
    ]);
    if (!equipe || !colaborador) {
        await logSyncError(tx, {
            entityType: 'ComposicaoEquipe',
            sourceItemId: entry.id,
            fieldName: !equipe ? 'equipeId' : 'colaboradorId',
            rawValue: !equipe ? String(entry.equipeId) : String(entry.colaboradorId),
            errorType: 'FK_NAO_ENCONTRADA',
            message: 'Equipe ou Colaborador referenciado ainda nao sincronizado',
        });
        return false;
    }
    await tx.composicaoEquipe.upsert({
        where: { equipeId_colaboradorId: { equipeId: entry.equipeId, colaboradorId: entry.colaboradorId } },
        create: { equipeId: entry.equipeId, colaboradorId: entry.colaboradorId, state: entry.state },
        update: { state: entry.state },
    });
    return true;
}
async function runComposicaoEquipeCycle() {
    if (!config_1.default.sharepoint?.composicaoEquipeUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] composicao de equipe pulado — POWER_AUTOMATE_COMPOSICAO_EQUIPE_URL nao configurado ainda (achado na 2a auditoria, flow ainda nao existe)');
        return;
    }
    const entries = await source.fetchComposicaoEquipe();
    let ok = 0;
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            if (await upsertComposicaoEquipe(tx, entry))
                ok++;
        }
    });
    console.log(`[sync-job] composicao de equipe ok — ${ok}/${entries.length} vinculo(s)`);
}
// ---------------------------------------------------------------------------
// Chamado (origem: f_Regulacao_Chamados, tabela-mae) — era runRegulationCycle
// ---------------------------------------------------------------------------
const CHAMADO_CRITICAL_FIELDS = ['originAddress', 'destinationAddress', 'diagnosis', 'motivoCancelamentoId'];
async function upsertChamado(tx, entry) {
    const status = await mapStatusChamado(tx, entry.statusRaw, entry.id);
    let motivoCancelamentoId = null;
    if (entry.motivoCancelamentoRaw) {
        const motivo = await tx.motivoCancelamento.findFirst({ where: { reason: entry.motivoCancelamentoRaw } });
        if (motivo) {
            motivoCancelamentoId = motivo.id;
        }
        else if (entry.motivoCancelamentoRaw) {
            await logSyncError(tx, {
                entityType: 'Chamado',
                sourceItemId: entry.id,
                fieldName: 'motivoCancelamentoId',
                rawValue: entry.motivoCancelamentoRaw,
                errorType: 'CATALOGO_NAO_ENCONTRADO',
                message: 'Motivo de cancelamento sem correspondencia em MotivoCancelamento — cadastrar no catalogo',
            });
        }
    }
    let tipoChamadoId = null;
    if (entry.tipoChamadoId != null) {
        const tipo = await tx.tipoChamado.findUnique({ where: { id: entry.tipoChamadoId } });
        tipoChamadoId = tipo ? entry.tipoChamadoId : null;
    }
    const existing = await tx.chamado.findUnique({ where: { id: entry.id } });
    const data = {
        patientName: entry.patientName,
        medicalRecordNumber: entry.medicalRecordNumber,
        patientBirthDate: entry.patientBirthDate,
        patientAge: entry.patientAge,
        patientSex: entry.patientSex,
        patientWeightKg: entry.patientWeightKg,
        patientHeightCm: entry.patientHeightCm,
        patientType: entry.patientType,
        patientTypeOther: entry.patientTypeOther,
        isIntubated: entry.isIntubated,
        isObese: entry.isObese,
        healthPlan: entry.healthPlan,
        contact: entry.contact,
        patientEmail: entry.patientEmail,
        originPhone: entry.originPhone,
        destinationPhone: entry.destinationPhone,
        diagnosis: entry.diagnosis,
        procedure: entry.procedure,
        equipment: entry.equipment,
        deviceUsage: entry.deviceUsage,
        requestedVehicleType: entry.requestedVehicleType,
        triageCompleted: entry.triageCompleted,
        tipoChamadoId,
        tipoChamadoText: entry.tipoChamadoText,
        callReason: entry.callReason,
        requestOrigin: entry.requestOrigin,
        requestedAt: entry.requestedAt,
        originName: entry.originName,
        originAddress: entry.originAddress,
        originSector: entry.originSector,
        destinationName: entry.destinationName,
        destinationAddress: entry.destinationAddress,
        destinationSector: entry.destinationSector,
        companion: entry.companion,
        originDoctor: entry.originDoctor,
        destinationDoctor: entry.destinationDoctor,
        state: entry.state,
        orderNumber: entry.orderNumber,
        notes: entry.notes,
        status: status ?? undefined,
        statusForEdit: entry.statusForEdit,
        motivoCancelamentoId,
        cancellationNotes: entry.cancellationNotes,
        expectedArrivalOriginAt: entry.expectedArrivalOriginAt,
        expectedArrivalDestAt: entry.expectedArrivalDestAt,
        actualArrivalDestAt: entry.actualArrivalDestAt,
        aereoRequestId: entry.aereoRequestId,
        aereoText: entry.aereoText,
        ambulanciaAereo: entry.ambulanciaAereo,
    };
    await tx.chamado.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...data },
        update: { ...data, updatedAt: new Date() },
    });
    await auditFieldChanges(tx.chamadoFieldAudit, 'chamadoId', entry.id, existing, data, CHAMADO_CRITICAL_FIELDS, null);
    // Historico de status COMPLETO (decisao 2026-09-21) — so grava se
    // realmente mudou desde a ultima linha conhecida.
    if (status && (!existing || existing.status !== status)) {
        await tx.chamadoStatusHistory.create({
            data: { chamadoId: entry.id, description: entry.statusRaw ?? status },
        });
    }
}
async function runChamadoCycle() {
    if (!config_1.default.sharepoint?.regulationsUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] chamados pulado — POWER_AUTOMATE_REGULATIONS_URL nao configurado ainda');
        return;
    }
    const entries = await source.fetchRecentChamados();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            await upsertChamado(tx, entry);
        }
    });
    console.log(`[sync-job] chamados ok — ${entries.length} chamado(s) sincronizado(s)`);
}
// ---------------------------------------------------------------------------
// Operacao (origem: f_Operacao_Controle_Dados_do_Chamado) — era runMissionCycle
// ---------------------------------------------------------------------------
const OPERACAO_CRITICAL_FIELDS = ['equipeId', 'veiculoId', 'currentStatus'];
async function upsertOperacao(tx, entry) {
    const chamado = await tx.chamado.findUnique({ where: { id: entry.chamadoId } });
    if (!chamado) {
        await logSyncError(tx, {
            entityType: 'Operacao',
            sourceItemId: entry.id,
            fieldName: 'chamadoId',
            rawValue: String(entry.chamadoId),
            errorType: 'FK_NAO_ENCONTRADA',
            message: 'Chamado referenciado ainda nao sincronizado — operacao adiada pro proximo ciclo',
        });
        return false;
    }
    const tripType = await mapTipoViagem(tx, entry.tripTypeRaw, entry.id);
    if (tripType == null)
        return false; // sem tipo de viagem valido, nao da pra criar (campo obrigatorio) — ja logado em mapTipoViagem
    const currentStatus = await mapStatusOperacao(tx, entry.currentStatusRaw, entry.id);
    let equipeId = null;
    if (entry.equipeId != null) {
        const equipe = await tx.equipe.findUnique({ where: { id: entry.equipeId } });
        equipeId = equipe ? entry.equipeId : null;
    }
    let veiculoId = null;
    if (entry.veiculoId != null) {
        const veiculo = await tx.veiculo.findUnique({ where: { id: entry.veiculoId } });
        veiculoId = veiculo ? entry.veiculoId : null;
    }
    const existing = await tx.operacao.findUnique({ where: { id: entry.id } });
    const data = {
        chamadoId: entry.chamadoId,
        tripType,
        equipeId,
        veiculoId,
        currentStatus: currentStatus ?? undefined,
        shortStatus: entry.shortStatus,
        operationStatus: entry.operationStatus,
        acceptanceStatus: entry.acceptanceStatus,
        minAmbulanceAt: entry.minAmbulanceAt,
        assignedFlag: entry.assignedFlag,
        state: entry.state,
        acknowledgementStatus: entry.acknowledgementStatus,
        departedToOriginStatus: entry.departedToOriginStatus,
        arrivedAtOriginStatus: entry.arrivedAtOriginStatus,
        departedToDestStatus: entry.departedToDestStatus,
        arrivedAtDestStatus: entry.arrivedAtDestStatus,
        finishedStatus: entry.finishedStatus,
        assignedAt: entry.assignedAt,
        assignedByEmail: entry.assignedByEmail,
        acknowledgedAt: entry.acknowledgedAt,
        acknowledgedByEmail: entry.acknowledgedByEmail,
        departedToOriginAt: entry.departedToOriginAt,
        departedToOriginByEmail: entry.departedToOriginByEmail,
        arrivedAtOriginAt: entry.arrivedAtOriginAt,
        arrivedAtOriginByEmail: entry.arrivedAtOriginByEmail,
        departedToDestAt: entry.departedToDestAt,
        departedToDestByEmail: entry.departedToDestByEmail,
        arrivedAtDestAt: entry.arrivedAtDestAt,
        arrivedAtDestByEmail: entry.arrivedAtDestByEmail,
        finishedAt: entry.finishedAt,
        finishedByEmail: entry.finishedByEmail,
        lastActionAt: entry.lastActionAt,
        etaOrigin: entry.etaOrigin,
        etaDestination: entry.etaDestination,
        originAddress: entry.originAddress,
        destinationAddress: entry.destinationAddress,
        cancelledAt: entry.cancelledAt,
        cancellationReason: entry.cancellationReason,
        cancellationNotes: entry.cancellationNotes,
        cancellationAreaResponsible: entry.cancellationAreaResponsible,
        aereoRequestId: entry.aereoRequestId,
        ambulanciaAereo: entry.ambulanciaAereo,
        disponibilidadeRequestId: entry.disponibilidadeRequestId,
        waypointsJson: entry.waypoints,
        fichaTransporteFrenteUrl: entry.fichaTransporteFrenteUrl,
        fichaTransporteVersoUrl: entry.fichaTransporteVersoUrl,
        patientIsolation: entry.patientIsolation,
        cleaningNurse: entry.cleaningNurse,
        appVersion: entry.appVersion,
        device: entry.device,
        qta: entry.qta,
    };
    await tx.operacao.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...data },
        update: { ...data, updatedAt: new Date() },
    });
    await auditFieldChanges(tx.operacaoFieldAudit, 'operacaoId', entry.id, existing, data, OPERACAO_CRITICAL_FIELDS, entry.assignedByEmail ?? entry.acknowledgedByEmail ?? null);
    if (currentStatus && (!existing || existing.currentStatus !== currentStatus)) {
        await tx.chamadoStatusHistory.create({
            data: { chamadoId: entry.chamadoId, operacaoId: entry.id, description: entry.currentStatusRaw ?? currentStatus },
        });
    }
    return true;
}
async function runOperacaoCycle() {
    if (!config_1.default.sharepoint?.missionsUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] operacoes pulado — POWER_AUTOMATE_MISSIONS_URL nao configurado ainda');
        return;
    }
    const entries = await source.fetchRecentOperacoes();
    let ok = 0;
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            if (await upsertOperacao(tx, entry))
                ok++;
        }
    });
    console.log(`[sync-job] operacoes ok — ${ok}/${entries.length} operacao(oes) sincronizada(s)`);
}
// ---------------------------------------------------------------------------
// Disponibilidade (origem: f_Disponiiblidade_do_Amil_Resgate) — DOMINIO NOVO
// ---------------------------------------------------------------------------
const DISPONIBILIDADE_CRITICAL_FIELDS = ['acceptedOrDeclined', 'declineReason'];
async function upsertDisponibilidade(tx, entry) {
    let chamadoId = null;
    if (entry.chamadoId != null) {
        const chamado = await tx.chamado.findUnique({ where: { id: entry.chamadoId } });
        chamadoId = chamado ? entry.chamadoId : null;
    }
    let tipoChamadoId = null;
    if (entry.tipoChamadoId != null) {
        const tipo = await tx.tipoChamado.findUnique({ where: { id: entry.tipoChamadoId } });
        tipoChamadoId = tipo ? entry.tipoChamadoId : null;
    }
    const existing = await tx.disponibilidade.findUnique({ where: { id: entry.id } });
    const data = {
        chamadoId,
        requesterType: entry.requesterType,
        ambulanceType: entry.ambulanceType,
        tipoChamadoId,
        originName: entry.originName,
        destinationName: entry.destinationName,
        expectedArrivalOriginAt: entry.expectedArrivalOriginAt,
        patientName: entry.patientName,
        patientWeightKg: entry.patientWeightKg,
        patientBirthDate: entry.patientBirthDate,
        patientHeightMeters: entry.patientHeightMeters,
        patientHeightCm: entry.patientHeightCm,
        patientHeightMetersAndCm: entry.patientHeightMetersAndCm,
        procedure: entry.procedure,
        usesDevice: entry.usesDevice,
        deviceType: entry.deviceType,
        usesEquipment: entry.usesEquipment,
        equipmentTypeAndQty: entry.equipmentTypeAndQty,
        originCep: entry.originCep,
        originStreet: entry.originStreet,
        originNumber: entry.originNumber,
        originComplement: entry.originComplement,
        originNeighborhood: entry.originNeighborhood,
        originState: entry.originState,
        originCity: entry.originCity,
        originAddressConcatenated: entry.originAddressConcatenated,
        destinationCep: entry.destinationCep,
        destinationStreet: entry.destinationStreet,
        destinationNumber: entry.destinationNumber,
        destinationComplement: entry.destinationComplement,
        destinationNeighborhood: entry.destinationNeighborhood,
        destinationState: entry.destinationState,
        destinationCity: entry.destinationCity,
        destinationAddressConcatenated: entry.destinationAddressConcatenated,
        diagnosis: entry.diagnosis,
        state: entry.state,
        availabilityGivenAt: entry.availabilityGivenAt,
        respondedAt: entry.respondedAt,
        respondedByUser: entry.respondedByUser,
        stage2UnavailabilityReason: entry.stage2UnavailabilityReason,
        stage2InformAvailability: entry.stage2InformAvailability,
        acceptedOrDeclined: entry.acceptedOrDeclined,
        declineReason: entry.declineReason,
        respondedAt3: entry.respondedAt3,
        acceptedByUser: entry.acceptedByUser,
        finalizationControl: entry.finalizationControl,
        finalizedAt: entry.finalizedAt,
        finalizedByUser: entry.finalizedByUser,
        status: entry.status,
        controlStatus: entry.controlStatus,
        requesterStatus: entry.requesterStatus,
        unavailabilityReason: entry.unavailabilityReason,
        disponibilidadeControlStatus: entry.disponibilidadeControlStatus,
    };
    await tx.disponibilidade.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...data },
        update: data,
    });
    await auditFieldChanges(tx.disponibilidadeFieldAudit, 'disponibilidadeId', entry.id, existing, data, DISPONIBILIDADE_CRITICAL_FIELDS, entry.acceptedByUser ?? entry.respondedByUser ?? null);
}
async function runDisponibilidadeCycle() {
    if (!config_1.default.sharepoint?.disponibilidadeUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] disponibilidades pulado — POWER_AUTOMATE_DISPONIBILIDADE_URL nao configurado ainda (dominio novo, flow ainda nao existe)');
        return;
    }
    const entries = await source.fetchRecentDisponibilidades();
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            await upsertDisponibilidade(tx, entry);
        }
    });
    console.log(`[sync-job] disponibilidades ok — ${entries.length} solicitacao(oes) sincronizada(s)`);
}
// ---------------------------------------------------------------------------
// Triagem (origem: f_Triagem) — DOMINIO NOVO, 1:1 com Chamado
// ---------------------------------------------------------------------------
async function upsertTriagem(tx, entry) {
    const chamado = await tx.chamado.findUnique({ where: { id: entry.chamadoId } });
    if (!chamado) {
        await logSyncError(tx, {
            entityType: 'Triagem',
            sourceItemId: entry.id,
            fieldName: 'chamadoId',
            rawValue: String(entry.chamadoId),
            errorType: 'FK_NAO_ENCONTRADA',
            message: 'Chamado referenciado ainda nao sincronizado — triagem adiada pro proximo ciclo',
        });
        return false;
    }
    const data = {
        chamadoId: entry.chamadoId,
        diagnosis: entry.diagnosis,
        clinicalHistory: entry.clinicalHistory,
        vitalSigns: entry.vitalSigns,
        resourceType: entry.resourceType,
        resourceNeeded: entry.resourceNeeded,
        companion: entry.companion,
        medicationsInPump: entry.medicationsInPump,
        biaEcmo: entry.biaEcmo,
        precautionTypes: entry.precautionTypes,
        weightAndHeight: entry.weightAndHeight,
        incorrectInformation: entry.incorrectInformation,
        interventions: entry.interventions,
        hadIntervention: entry.hadIntervention,
        neededMedicalContact: entry.neededMedicalContact,
        doctorNameAndCrm: entry.doctorNameAndCrm,
        cancellationReason: entry.cancellationReason,
        hadCancellation: entry.hadCancellation,
        requestReason: entry.requestReason,
        originHospitalContact: entry.originHospitalContact,
        destinationHospitalContact: entry.destinationHospitalContact,
        detectedIncorrectInfo: entry.detectedIncorrectInfo,
        nurseAvailability: entry.nurseAvailability,
        nurseAbsenceReason: entry.nurseAbsenceReason,
        requestedAt: entry.requestedAt,
        state: entry.state,
        resourceNeededLegacyText: entry.resourceNeededLegacyText,
        precautionTypeLegacyText: entry.precautionTypeLegacyText,
    };
    // 1:1 com Chamado (@unique chamadoId) — upsert pelo id do item de origem,
    // igual ao resto, sem re-auditar (Triagem nao esta na lista de campos
    // criticos decidida 2026-09-21).
    await tx.triagem.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...data },
        update: data,
    });
    return true;
}
async function runTriagemCycle() {
    if (!config_1.default.sharepoint?.triagemUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] triagens pulado — POWER_AUTOMATE_TRIAGEM_URL nao configurado ainda (dominio novo, flow ainda nao existe)');
        return;
    }
    const entries = await source.fetchRecentTriagens();
    let ok = 0;
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            if (await upsertTriagem(tx, entry))
                ok++;
        }
    });
    console.log(`[sync-job] triagens ok — ${ok}/${entries.length} triagem(ns) sincronizada(s)`);
}
// ---------------------------------------------------------------------------
// Diario da Missao (origem: f_Diario_da_Missao) — era runMissionEventCycle,
// fonte confirmada 2026-09-21 (nunca tinha sido ligada de verdade)
// ---------------------------------------------------------------------------
async function getDiarioWatermark() {
    const latest = await db_1.prisma.diarioDaMissao.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    return latest?.createdAt ?? new Date(0);
}
async function upsertDiarioEntry(tx, entry) {
    const chamado = await tx.chamado.findUnique({ where: { id: entry.chamadoId } });
    if (!chamado) {
        await logSyncError(tx, {
            entityType: 'DiarioDaMissao',
            sourceItemId: entry.id,
            fieldName: 'chamadoId',
            rawValue: String(entry.chamadoId),
            errorType: 'FK_NAO_ENCONTRADA',
            message: 'Chamado referenciado ainda nao sincronizado — entrada de diario adiada',
        });
        return false;
    }
    let operacaoId = null;
    if (entry.operacaoId != null) {
        const operacao = await tx.operacao.findUnique({ where: { id: entry.operacaoId } });
        operacaoId = operacao ? entry.operacaoId : null;
    }
    let disponibilidadeId = null;
    if (entry.disponibilidadeId != null) {
        const disp = await tx.disponibilidade.findUnique({ where: { id: entry.disponibilidadeId } });
        disponibilidadeId = disp ? entry.disponibilidadeId : null;
    }
    const tripType = entry.tripTypeRaw ? TIPO_VIAGEM_MAP[entry.tripTypeRaw] ?? null : null;
    await tx.diarioDaMissao.create({
        data: {
            id: entry.id,
            chamadoId: entry.chamadoId,
            operacaoId,
            disponibilidadeId,
            message: entry.message,
            currentMoment: entry.currentMoment,
            tripType,
            accessType: entry.accessType,
            readStatusRequester: entry.readStatusRequester,
            readStatusControl: entry.readStatusControl,
            readStatusRescue: entry.readStatusRescue,
            state: entry.state,
            createdBy: entry.createdBy,
            createdAt: entry.createdAt,
        },
    });
    return true;
}
async function runDiarioCycle() {
    if (!config_1.default.sharepoint?.diarioUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] diario da missao pulado — POWER_AUTOMATE_DIARIO_URL nao configurado ainda');
        return;
    }
    const since = await getDiarioWatermark();
    const entries = await source.fetchDiarioSince(since);
    let ok = 0;
    await db_1.prisma.$transaction(async (tx) => {
        for (const entry of entries) {
            if (await upsertDiarioEntry(tx, entry))
                ok++;
        }
    });
    console.log(`[sync-job] diario da missao ok — ${ok}/${entries.length} entrada(s) nova(s)`);
}
// ---------------------------------------------------------------------------
// Posicao (origem dupla: f_Rastreamento_Ambulancia + f_Historico_
// localizacao_da_operacao) — era runHistoryCycle/runHistoryBackfillCycle.
// Buraco de schema corrigido 2026-09-21 (PosicaoOperacao/PosicaoAtualVeiculo
// nao existiam no nucleo aprovado, adicionados antes desta reescrita).
// ---------------------------------------------------------------------------
async function getVeiculoPosicaoWatermark(veiculoId) {
    // Exclui linhas do backfill (id >= BACKFILL_ID_OFFSET) — mesmo motivo do
    // sync-job antigo: sem isso o backfill mais recente vira o watermark e o
    // cursor do rastreamento normal pula pra mais de 1 bilhao.
    const latest = await db_1.prisma.posicaoOperacao.findFirst({
        where: { veiculoId, id: { lt: sharepoint_1.BACKFILL_ID_OFFSET } },
        orderBy: { id: 'desc' },
        select: { id: true },
    });
    return latest?.id ?? 0;
}
// So veiculos com operacao ATIVA tem trajeto (equivalente a "so EM OPERACAO"
// do sistema antigo, agora expresso como status de Operacao em vez de
// Vehicle — a atribuicao mudou de dono, ver decisao 2026-09-21).
const OPERACAO_ATIVA_STATUS = [
    client_1.StatusOperacao.DESLOCANDO_PARA_ORIGEM,
    client_1.StatusOperacao.CHEGOU_NA_ORIGEM,
    client_1.StatusOperacao.DESLOCANDO_PARA_DESTINO,
];
async function runPosicaoCycle() {
    if (!config_1.default.sharepoint?.trackingUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] posicao pulado — POWER_AUTOMATE_TRACKING_URL nao configurado ainda');
        return;
    }
    const operacoesAtivas = await db_1.prisma.operacao.findMany({
        where: { currentStatus: { in: OPERACAO_ATIVA_STATUS }, veiculoId: { not: null } },
        select: { id: true, veiculoId: true },
    });
    if (operacoesAtivas.length === 0) {
        console.log('[sync-job] posicao — nenhuma operacao ativa, nada a buscar');
        return;
    }
    const veiculoIds = [...new Set(operacoesAtivas.map((o) => o.veiculoId))];
    let totalNovos = 0;
    const failures = [];
    for (const veiculoId of veiculoIds) {
        try {
            const sinceItemId = await getVeiculoPosicaoWatermark(veiculoId);
            const entries = await source.fetchPosicaoForVeiculo(veiculoId, sinceItemId);
            if (entries.length === 0)
                continue;
            await db_1.prisma.$transaction(async (tx) => {
                for (const entry of entries) {
                    if (entry.operacaoId == null)
                        continue; // sem operacao, nao ha onde ligar a posicao no nucleo
                    const operacao = await tx.operacao.findUnique({ where: { id: entry.operacaoId } });
                    if (!operacao) {
                        await logSyncError(tx, {
                            entityType: 'PosicaoOperacao',
                            sourceItemId: entry.id,
                            fieldName: 'operacaoId',
                            rawValue: String(entry.operacaoId),
                            errorType: 'FK_NAO_ENCONTRADA',
                            message: 'Operacao referenciada ainda nao sincronizada',
                        });
                        continue;
                    }
                    await tx.posicaoOperacao.upsert({
                        where: { id: entry.id },
                        create: {
                            id: entry.id,
                            operacaoId: entry.operacaoId,
                            veiculoId: entry.veiculoId,
                            latitude: entry.latitude,
                            longitude: entry.longitude,
                            positionAt: entry.positionAt,
                            vehicleStatus: entry.vehicleStatus,
                            action: entry.action,
                            tabletId: entry.tabletId,
                            appVersion: entry.appVersion,
                            device: entry.device,
                        },
                        update: {},
                    });
                    totalNovos++;
                }
                // Posicao atual (1 linha por veiculo) — so a mais recente do lote.
                const latest = entries.filter((e) => e.veiculoId != null).sort((a, b) => b.positionAt.getTime() - a.positionAt.getTime())[0];
                if (latest?.veiculoId != null) {
                    await tx.posicaoAtualVeiculo.upsert({
                        where: { veiculoId: latest.veiculoId },
                        create: { veiculoId: latest.veiculoId, latitude: latest.latitude, longitude: latest.longitude, positionAt: latest.positionAt },
                        update: { latitude: latest.latitude, longitude: latest.longitude, positionAt: latest.positionAt, updatedAt: new Date() },
                    });
                }
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`veiculo ${veiculoId}: ${message}`);
        }
    }
    const failureNote = failures.length > 0 ? ` — ${failures.length} falha(s): ${failures.join('; ')}` : '';
    console.log(`[sync-job] posicao ok — ${veiculoIds.length} veiculo(s) em operacao ativa, ${totalNovos} ponto(s) novo(s)${failureNote}`);
    // Retencao (mesmo padrao do sistema antigo).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config_1.default.historyRetentionDays);
    await db_1.prisma.posicaoOperacao.deleteMany({ where: { positionAt: { lt: cutoff } } });
}
async function runPosicaoBackfillCycle() {
    if (!config_1.default.sharepoint?.historyBackfillUrl && config_1.default.dataSource === 'sharepoint') {
        console.log('[sync-job] backfill de posicao pulado — POWER_AUTOMATE_HISTORY_BACKFILL_URL nao configurado ainda');
        return;
    }
    const operacoesAtivas = await db_1.prisma.operacao.findMany({
        where: { currentStatus: { in: OPERACAO_ATIVA_STATUS } },
        select: { id: true },
    });
    if (operacoesAtivas.length === 0)
        return;
    let totalRevisados = 0;
    for (const { id: operacaoId } of operacoesAtivas) {
        const entries = await source.fetchPosicaoBackfillForOperacao(operacaoId);
        if (entries.length === 0)
            continue;
        await db_1.prisma.$transaction(async (tx) => {
            for (const entry of entries) {
                await tx.posicaoOperacao.upsert({
                    where: { id: entry.id },
                    create: {
                        id: entry.id,
                        operacaoId,
                        veiculoId: entry.veiculoId,
                        latitude: entry.latitude,
                        longitude: entry.longitude,
                        positionAt: entry.positionAt,
                        action: entry.action,
                        appVersion: entry.appVersion,
                        device: entry.device,
                    },
                    update: entry.action != null ? { action: entry.action } : {},
                });
                totalRevisados++;
            }
        });
    }
    console.log(`[sync-job] backfill de posicao ok — ${totalRevisados} linha(s) revisada(s)`);
}
// ---------------------------------------------------------------------------
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
console.log(`[sync-job] iniciando (nucleo resgate) — fonte: ${config_1.default.dataSource}, veiculos: ${config_1.default.syncIntervalMs}ms, posicao: ${config_1.default.historySyncIntervalMs}ms, backfill: ${config_1.default.historyBackfillIntervalMs}ms, diario: ${config_1.default.missionEventSyncIntervalMs}ms, operacoes: ${config_1.default.missionSyncIntervalMs}ms, chamados: ${config_1.default.regulationSyncIntervalMs}ms, disponibilidade: ${config_1.default.disponibilidadeSyncIntervalMs}ms, triagem: ${config_1.default.triagemSyncIntervalMs}ms`);
startLoop('veiculos', config_1.default.syncIntervalMs, runVeiculoCycle);
// Equipe/Colaborador ANTES de composicao/operacoes — mesma logica de
// "chamado antes do resto" abaixo, reduz janela de FK_NAO_ENCONTRADA.
startLoop('equipes', config_1.default.equipeSyncIntervalMs, runEquipeCycle);
startLoop('colaboradores', config_1.default.equipeSyncIntervalMs, runColaboradorCycle);
startLoop('composicao de equipe', config_1.default.equipeSyncIntervalMs, runComposicaoEquipeCycle);
startLoop('posicao', config_1.default.historySyncIntervalMs, runPosicaoCycle);
startLoop('backfill de posicao', config_1.default.historyBackfillIntervalMs, runPosicaoBackfillCycle);
startLoop('diario da missao', config_1.default.missionEventSyncIntervalMs, runDiarioCycle);
// Chamado ANTES de operacao/triagem/disponibilidade — as 3 dependem de um
// Chamado ja existente (FK), ordem de loop nao garante isso sozinha (cada
// um roda no seu proprio ritmo), mas rodar chamado mais cedo reduz a janela
// de "FK_NAO_ENCONTRADA" nos primeiros ciclos.
startLoop('chamados', config_1.default.regulationSyncIntervalMs, runChamadoCycle);
startLoop('operacoes', config_1.default.missionSyncIntervalMs, runOperacaoCycle);
startLoop('disponibilidade', config_1.default.disponibilidadeSyncIntervalMs, runDisponibilidadeCycle);
startLoop('triagem', config_1.default.triagemSyncIntervalMs, runTriagemCycle);
// Aeronaves — intacto, split pausado (proxima tarefa).
startLoop('aeronaves', config_1.default.opensky.syncIntervalMs, aircraft_1.runAircraftCycle);
startLoop('aeronaves monitoradas', config_1.default.trackedAircraft.scannerIntervalMs, trackedAircraft_1.runTrackedAircraftCycle);
