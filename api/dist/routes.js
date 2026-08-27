"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const db_1 = require("./db");
const vehicles_1 = require("./vehicles");
const aircraft_1 = require("./aircraft");
const broadcast_1 = require("./broadcast");
const aircraftBroadcast_1 = require("./aircraftBroadcast");
const config_1 = __importDefault(require("./config"));
const router = express_1.default.Router();
// Sem isso, um erro assincrono nao tratado numa rota derruba o processo inteiro
// (Node 15+ mata o processo em unhandledRejection por padrao).
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.get('/healthz', (req, res) => res.json({ ok: true }));
router.get('/api/vehicles/stream', broadcast_1.streamVehicles);
router.get('/api/vehicles', asyncHandler(async (req, res) => {
    res.json(await (0, vehicles_1.getCurrentFleet)());
}));
router.get('/api/vehicles/:id/history', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'invalid id' });
        return;
    }
    const limit = Math.min(Number(req.query.limit) || config_1.default.historyRowLimit, 20000);
    const vehicle = await db_1.prisma.vehicle.findUnique({ where: { id }, select: { status: true } });
    if (vehicle?.status !== client_1.VehicleStatus.IN_SERVICE) {
        res.json([]);
        return;
    }
    const latest = await db_1.prisma.positionHistory.findFirst({
        where: { vehicleId: id, operationId: { not: null } },
        orderBy: { positionAt: 'desc' },
        select: { operationId: true },
    });
    if (latest?.operationId == null) {
        res.json([]);
        return;
    }
    const points = await db_1.prisma.positionHistory.findMany({
        where: { vehicleId: id, operationId: latest.operationId },
        orderBy: { positionAt: 'desc' },
        take: limit,
        select: { latitude: true, longitude: true, positionAt: true },
    });
    const ordered = points.reverse();
    const currentPosition = await db_1.prisma.currentPosition.findUnique({
        where: { vehicleId: id },
        select: { latitude: true, longitude: true, positionAt: true },
    });
    const lastHistoryPoint = ordered[ordered.length - 1];
    if (currentPosition && (!lastHistoryPoint || currentPosition.positionAt > lastHistoryPoint.positionAt)) {
        ordered.push(currentPosition);
    }
    res.json(ordered.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        positionAt: p.positionAt,
    })));
}));
router.get('/api/vehicles/:id/mission', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'invalid id' });
        return;
    }
    const vehicle = await db_1.prisma.vehicle.findUnique({ where: { id }, select: { status: true } });
    if (vehicle?.status !== client_1.VehicleStatus.IN_SERVICE) {
        res.json(null);
        return;
    }
    const latest = await db_1.prisma.positionHistory.findFirst({
        where: { vehicleId: id, operationId: { not: null } },
        orderBy: { positionAt: 'desc' },
        select: { operationId: true },
    });
    if (latest?.operationId == null) {
        res.json(null);
        return;
    }
    const operationItemId = Number(latest.operationId);
    if (!Number.isInteger(operationItemId)) {
        res.json(null);
        return;
    }
    const mission = await db_1.prisma.mission.findUnique({ where: { id: operationItemId } });
    if (mission == null) {
        res.json(null);
        return;
    }
    const regulationId = Number(mission.callId);
    const regulation = Number.isInteger(regulationId)
        ? await db_1.prisma.regulation.findUnique({ where: { id: regulationId } })
        : null;
    res.json({ ...mission, regulation });
}));
router.get('/api/aircraft/stream', aircraftBroadcast_1.streamAircraft);
router.get('/api/aircraft', asyncHandler(async (req, res) => {
    res.json(await (0, aircraft_1.getCurrentAircraft)());
}));
router.get('/api/aircraft/:id/history', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'invalid id' });
        return;
    }
    const windowHours = Math.min(Number(req.query.windowHours) || config_1.default.aircraftHistoryWindowHours, 24 * 30);
    const limit = Math.min(Number(req.query.limit) || config_1.default.historyRowLimit, 20000);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const points = await db_1.prisma.aircraftPositionHistory.findMany({
        where: { aircraftId: id, positionAt: { gt: since } },
        orderBy: { positionAt: 'desc' },
        take: limit,
        select: { latitude: true, longitude: true, altitude: true, positionAt: true },
    });
    // Corta no primeiro buraco grande, caminhando do ponto mais novo pro mais
    // antigo — so o trecho continuo mais recente e devolvido. Sem isso, uma
    // aeronave que saiu da area e voltou depois (reocupando a MESMA linha,
    // pois a chave e o icao24) teria os dois trechos ligados por uma reta
    // atravessando o mapa. Diferente das vans, aqui nao ha CurrentPosition
    // pra costurar no fim: posicao e historico saem da mesma escrita, no
    // mesmo ciclo, entao nunca divergem.
    const maxGapMs = config_1.default.aircraftTrailGapMinutes * 60 * 1000;
    const segment = [];
    for (let i = 0; i < points.length; i += 1) {
        if (i > 0 && points[i - 1].positionAt.getTime() - points[i].positionAt.getTime() > maxGapMs)
            break;
        segment.push(points[i]);
    }
    res.json(segment.reverse().map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        positionAt: p.positionAt,
    })));
}));
// "Nao Iniciado" (e variantes de acento/caixa) significa que a etapa nao
// aconteceu — qualquer outro valor preenchido ("Iniciado", "Confirmado")
// conta como cumprida. Mesmo criterio do MissionTimeline.tsx (isStageDone),
// repetido aqui porque o front nao tem acesso direto ao Prisma.
function isStageDone(value) {
    if (!value)
        return false;
    return !/^n[ãa]o\s+iniciado$/i.test(value.trim());
}
// Turno dia = 06h-18h, noite = 18h-06h (pode cruzar meia-noite), sempre em
// horario de Brasilia — calculado manualmente a partir de UTC (deslocando o
// timestamp e lendo com getUTC*()) em vez de usar o fuso do processo/
// container Node, que pode estar em UTC e fazia 15h40 de Brasilia aparecer
// como "noite" (bug reportado 2026-08-27). Brasil nao tem horario de verao
// desde 2019 — offset fixo de -3h e seguro.
const BRAZIL_UTC_OFFSET_HOURS = 3;
function currentShiftWindow() {
    const now = new Date();
    const brazilClock = new Date(now.getTime() - BRAZIL_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    const year = brazilClock.getUTCFullYear();
    const month = brazilClock.getUTCMonth();
    const date = brazilClock.getUTCDate();
    const hour = brazilClock.getUTCHours();
    // Limites do turno construidos ja em UTC de verdade (Brasilia + 3h), pra
    // comparar direto com assignedAt no banco (armazenado em UTC).
    const dayStart = new Date(Date.UTC(year, month, date, 6 + BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month, date, 18 + BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
    if (hour >= 6 && hour < 18) {
        return { shift: 'day', start: dayStart, end: dayEnd };
    }
    if (hour >= 18) {
        const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        return { shift: 'night', start: dayEnd, end: nextDayStart };
    }
    const prevDayEnd = new Date(dayEnd.getTime() - 24 * 60 * 60 * 1000);
    return { shift: 'night', start: prevDayEnd, end: dayStart };
}
// Indicadores da lateral do mapa: ativas/finalizadas/total/QTA com e sem
// custo, recortados pelo turno atual (06h-18h / 18h-06h) e opcionalmente
// por estado (mesmo filtro SP/RJ do mapa). "QTA com custo" = cancelou
// depois de ja ter saido rumo a origem (gastou deslocamento); "sem custo" =
// cancelou antes disso — definicao dada pelo usuario, sem campo pronto pra
// isso na origem.
router.get('/api/missions/stats', asyncHandler(async (req, res) => {
    const { shift, start, end } = currentShiftWindow();
    // "end" e o limite teorico do turno inteiro (18h ou 06h do dia
    // seguinte) — usado direto, mesmo com o turno ainda em andamento
    // (pedido explicito do usuario, 2026-08-27: preferiu isso a travar em
    // "agora"). Na pratica assignedAt nunca e do futuro de qualquer forma.
    const state = typeof req.query.state === 'string' && req.query.state ? req.query.state : null;
    const missions = await db_1.prisma.mission.findMany({
        where: {
            assignedAt: { gte: start, lt: end },
            // insensitive: Mission vem de uma lista diferente da Vehicle no
            // SharePoint (mesmo campo "CLIENTEESTADO", mas fontes separadas) —
            // igualdade exata sensivel a caixa arriscava nao bater mesmo sendo
            // o mesmo estado (bug reportado 2026-08-27, indicadores nao
            // respeitando o filtro).
            ...(state ? { state: { equals: state, mode: 'insensitive' } } : {}),
        },
        select: { cancelledAt: true, departedToOriginStatus: true, finishedStatus: true, operationStatus: true },
    });
    let active = 0;
    let finished = 0;
    let qtaWithCost = 0;
    let qtaWithoutCost = 0;
    for (const mission of missions) {
        if (mission.cancelledAt) {
            if (isStageDone(mission.departedToOriginStatus))
                qtaWithCost += 1;
            else
                qtaWithoutCost += 1;
        }
        else if (mission.operationStatus?.trim().toLowerCase() === 'em operação') {
            active += 1;
        }
        else if (isStageDone(mission.finishedStatus)) {
            finished += 1;
        }
    }
    res.json({
        shift,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        active,
        finished,
        total: active + finished + qtaWithCost + qtaWithoutCost,
        qtaWithCost,
        qtaWithoutCost,
    });
}));
router.use((err, req, res, next) => {
    console.error('[api] erro na requisicao:', err.message);
    res.status(500).json({ error: 'internal error' });
});
exports.default = router;
