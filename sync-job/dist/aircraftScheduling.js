"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAircraftSchedulingCycle = runAircraftSchedulingCycle;
const config_1 = __importDefault(require("./config"));
const db_1 = require("./db");
const solicitacoesAeronaves_1 = require("./sources/solicitacoesAeronaves");
// Deteccao de agendamento de voo (2026-09-22, "primeiro passo" pedido pelo
// usuario) — cruza o fluxo PA-RESGATE-GerenciaSolicitacoes (d_Cadastro_
// Aeronaves, ver solicitacoesAeronaves.ts) com a aeronave rastreada por
// ICAO24 (TrackedAircraft, ver trackedAircraft.ts — rastreio ADS-B real,
// tabela SEPARADA). Os dois nunca se falam por FK: aqui so gravamos o
// resultado na MESMA linha (mesmo icao24) que o rastreio ja usa, pro Command
// Center ler os dois campos (posicao + agendamento) numa unica consulta.
//
// "Novo agendamento" = a aeronave-alvo (casada por texto de matricula,
// AIRCRAFT_SCHEDULING_REGISTRATION) transicionou de "Livre" pra "Em uso"
// desde a ultima checagem — so a BORDA de subida dispara scheduledAt novo,
// nao toda vez que ela CONTINUA "Em uso" (senao o alerta "agendada" do
// Command Center repetiria a cada 5s enquanto durar o voo).
function normalize(value) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();
}
const STATUS_EM_USO = normalize('Em uso');
async function runAircraftSchedulingCycle() {
    const cfg = config_1.default.aircraftScheduling;
    if (!cfg)
        return;
    const aeronaves = await (0, solicitacoesAeronaves_1.fetchAeronaves)(cfg.url);
    const target = aeronaves.find((a) => normalize(a.registro) === normalize(cfg.registration));
    if (!target) {
        console.warn(`[sync-job] agendamento de aeronave: registro "${cfg.registration}" nao encontrado no fluxo PA-RESGATE-GerenciaSolicitacoes (${aeronaves.length} aeronave(s) cadastrada(s))`);
        return;
    }
    const existing = await db_1.prisma.trackedAircraft.findUnique({
        where: { icao24: cfg.icao24 },
        select: { schedulingStatus: true },
    });
    const wasInUse = normalize(existing?.schedulingStatus) === STATUS_EM_USO;
    const isNowInUse = normalize(target.status) === STATUS_EM_USO;
    const isNewScheduling = isNowInUse && !wasInUse;
    await db_1.prisma.trackedAircraft.upsert({
        where: { icao24: cfg.icao24 },
        create: {
            icao24: cfg.icao24,
            schedulingStatus: target.status,
            ...(isNewScheduling ? { scheduledAt: new Date() } : {}),
        },
        update: {
            schedulingStatus: target.status,
            ...(isNewScheduling ? { scheduledAt: new Date() } : {}),
        },
    });
    if (isNewScheduling) {
        console.log(`[sync-job] NOVO AGENDAMENTO detectado — "${target.nome}" (registro ${target.registro}, icao24 ${cfg.icao24}) status "${target.status}"`);
    }
}
