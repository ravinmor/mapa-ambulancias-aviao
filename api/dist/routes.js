"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
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
    // Limites evitam que um veiculo rastreado ha meses mande milhoes de pontos
    // pro navegador e trave o desenho da trajetoria.
    const windowHours = Math.min(Number(req.query.windowHours) || config_1.default.historyWindowHours, 24 * 30);
    const limit = Math.min(Number(req.query.limit) || config_1.default.historyRowLimit, 20000);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const points = await db_1.prisma.positionHistory.findMany({
        where: { vehicleId: id, positionAt: { gt: since } },
        orderBy: { positionAt: 'desc' },
        take: limit,
        select: { latitude: true, longitude: true, positionAt: true },
    });
    const ordered = points.reverse();
    // As 2 listas da origem (cadastro/rastreio) atualizam em cadencia
    // diferente — CurrentPosition (frota, ciclo de 5s) pode ficar um pouco
    // a frente ou atras do ultimo ponto de PositionHistory (rastreio, ciclo
    // de 30s) por alguns segundos, dependendo de qual dos 2 loops rodou por
    // ultimo. Sem isso, a linha do trajeto no mapa podia "sobrar" na frente
    // do circulo (ou ficar curta demais) — sempre incluir a posicao atual
    // como ultimo ponto (se for mais recente que o ultimo do historico)
    // garante que a linha sempre termina exatamente onde o circulo esta.
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
router.use((err, req, res, next) => {
    console.error('[api] erro na requisicao:', err.message);
    res.status(500).json({ error: 'internal error' });
});
exports.default = router;
