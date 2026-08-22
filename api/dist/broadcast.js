"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamVehicles = streamVehicles;
exports.startBroadcast = startBroadcast;
const vehicles_1 = require("./vehicles");
const config_1 = __importDefault(require("./config"));
const clients = new Set();
function send(client, message) {
    client.write(`data: ${JSON.stringify(message)}\n\n`);
}
function streamVehicles(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    clients.add(res);
    (0, vehicles_1.getCurrentFleet)()
        .then((snapshot) => send(res, { type: 'snapshot', vehicles: snapshot }))
        .catch((error) => console.error('[broadcast] erro ao enviar snapshot inicial:', error.message));
    req.on('close', () => clients.delete(res));
}
// O dado so muda a cada ~30s (ritmo do sync-job) — 5s de polling ja parece
// instantaneo pra quem olha o mapa. Manda o snapshot completo (frota pequena),
// sem calcular diff.
async function broadcastPeriodically() {
    if (clients.size > 0) {
        try {
            const snapshot = await (0, vehicles_1.getCurrentFleet)();
            const message = { type: 'snapshot', vehicles: snapshot };
            for (const client of clients)
                send(client, message);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[broadcast] erro no ciclo de broadcast:', msg);
        }
    }
    setTimeout(broadcastPeriodically, config_1.default.broadcastIntervalMs);
}
function startBroadcast() {
    broadcastPeriodically();
    console.log(`[broadcast] rodando a cada ${config_1.default.broadcastIntervalMs}ms`);
}
