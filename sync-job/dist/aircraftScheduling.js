"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAircraftSchedulingCycle = runAircraftSchedulingCycle;
const config_1 = __importDefault(require("./config"));
const db_1 = require("./db");
const solicitacoesAeronaves_1 = require("./sources/solicitacoesAeronaves");
// Deteccao de agendamento de voo — cruza o fluxo PA-RESGATE-
// GerenciaSolicitacoes com a aeronave rastreada por ICAO24 (TrackedAircraft,
// ver trackedAircraft.ts — rastreio ADS-B real, tabela SEPARADA). Os dois
// nunca se falam por FK: aqui so gravamos o resultado na MESMA linha (mesmo
// icao24) que o rastreio ja usa, pro Command Center ler os 2 campos
// (posicao + agendamento) numa unica consulta.
//
// V3 (2026-09-23, substitui a v1 de 2026-09-22): em vez de acompanhar o
// Status da AERONAVE ("Livre"/"Em uso", sub-acao "obterAeronaves" — sinal
// indireto, nao dava pra saber qual missao causou a mudanca), acompanha o
// Status da SOLICITACAO mais recente vinculada a ela (sub-acao "obter",
// campo IDAeronave, ver MANUAL_FILTROS.md). "Mais recente" = maior ID (mesmo
// criterio de ordenacao do manual/app). "Novo agendamento" = a solicitacao
// mais recente esta em "Aguardando aceite" E e' uma solicitacao DIFERENTE da
// ultima que ja disparou (compara scheduledMissionId, NAO o texto do status
// — bug real corrigido 2026-09-23: comparar so' o texto fazia 2 solicitacoes
// DIFERENTES que caem no mesmo status "Aguardando aceite" parecerem "nada
// mudou", perdendo o 2o agendamento). So dispara scheduledAt/
// scheduledMissionId/scheduledPatientName novos quando o ID muda, nao toda
// vez que a MESMA solicitacao continua nesse status.
function normalize(value) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();
}
const STATUS_AGUARDANDO_ACEITE = normalize('Aguardando aceite');
async function runAircraftSchedulingCycle() {
    const cfg = config_1.default.aircraftScheduling;
    if (!cfg)
        return;
    const aeronaves = await (0, solicitacoesAeronaves_1.fetchAeronaves)(cfg.url);
    const targetAeronave = aeronaves.find((a) => normalize(a.registro) === normalize(cfg.registration));
    if (!targetAeronave) {
        console.warn(`[sync-job] agendamento de aeronave: registro "${cfg.registration}" nao encontrado no fluxo PA-RESGATE-GerenciaSolicitacoes (${aeronaves.length} aeronave(s) cadastrada(s))`);
        return;
    }
    const solicitacoes = await (0, solicitacoesAeronaves_1.fetchSolicitacoes)(cfg.url);
    const vinculadas = solicitacoes.filter((s) => s.aeronaveId === targetAeronave.id);
    // Maior ID = mais recente (sem depender de `created`, que pode faltar).
    const latest = vinculadas.reduce((best, current) => (best == null || current.id > best.id ? current : best), null);
    if (!latest) {
        // Sem solicitacao nenhuma vinculada ainda — nao e' erro, so' nao ha
        // agendamento no momento. Nao mexe no schedulingStatus salvo (evita
        // apagar o ultimo agendamento conhecido por uma leitura vazia passageira).
        return;
    }
    const existing = await db_1.prisma.trackedAircraft.findUnique({
        where: { icao24: cfg.icao24 },
        select: { scheduledMissionId: true, schedulingStatus: true },
    });
    const isNowAguardandoAceite = normalize(latest.status) === STATUS_AGUARDANDO_ACEITE;
    // "Ja estava Aguardando aceite" so conta se for a MESMA solicitacao — cobre
    // o caso de ela ser reatribuida de verdade depois de voltar de "Pendencia"
    // (mesmo ID, mas TRANSICIONOU de novo pra Aguardando aceite — deve
    // alertar de novo, nao so' na 1a vez que essa solicitacao apareceu).
    const isSameMissionAsBefore = existing?.scheduledMissionId === latest.id;
    const wasAguardandoAceiteForThisMission = isSameMissionAsBefore && normalize(existing?.schedulingStatus) === STATUS_AGUARDANDO_ACEITE;
    const isNewScheduling = isNowAguardandoAceite && !wasAguardandoAceiteForThisMission;
    const newSchedulingFields = isNewScheduling
        ? {
            scheduledAt: new Date(),
            scheduledMissionId: latest.id,
            scheduledPatientName: latest.pacienteNome,
            scheduledAircraftId: targetAeronave.id,
            scheduledAircraftName: targetAeronave.nome,
        }
        : {};
    await db_1.prisma.trackedAircraft.upsert({
        where: { icao24: cfg.icao24 },
        create: { icao24: cfg.icao24, schedulingStatus: latest.status, ...newSchedulingFields },
        update: { schedulingStatus: latest.status, ...newSchedulingFields },
    });
    if (isNewScheduling) {
        console.log(`[sync-job] NOVO AGENDAMENTO detectado — solicitacao #${latest.id} (paciente "${latest.pacienteNome ?? 'desconhecido'}"), aeronave "${targetAeronave.nome}" (registro ${targetAeronave.registro}, icao24 ${cfg.icao24}) status "${latest.status}"`);
    }
}
