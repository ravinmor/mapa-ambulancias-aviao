"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamAircraft = streamAircraft;
exports.startAircraftBroadcast = startAircraftBroadcast;
const aircraft_1 = require("./aircraft");
const config_1 = __importDefault(require("./config"));
// Stream proprio, separado do das vans (broadcast.ts) — mesma mecanica, outra
// cadencia. Sao 2 EventSource abertos no navegador em vez de 1: bem dentro do
// limite de conexoes por origem, e mantem os dois pipelines independentes
// (um erro na consulta de aeronave nao derruba o mapa das ambulancias).
const clients = new Set();
function send(client, message) {
    client.write(`data: ${JSON.stringify(message)}\n\n`);
}
function streamAircraft(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    clients.add(res);
    (0, aircraft_1.getCurrentAircraft)()
        .then((snapshot) => send(res, { type: 'snapshot', aircraft: snapshot }))
        .catch((error) => console.error('[aircraft-broadcast] erro ao enviar snapshot inicial:', error.message));
    req.on('close', () => clients.delete(res));
}
// Bem mais espacado que o broadcast das vans (5s): o dado de aeronave so muda
// a cada ciclo do sync-job, que e de 5 minutos por causa da cota diaria do
// OpenSky. Bater no Postgres a cada 5s aqui seria consulta sem nenhuma
// chance de dado novo no meio do caminho.
async function broadcastPeriodically() {
    if (clients.size > 0) {
        try {
            const snapshot = await (0, aircraft_1.getCurrentAircraft)();
            const message = { type: 'snapshot', aircraft: snapshot };
            for (const client of clients)
                send(client, message);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[aircraft-broadcast] erro no ciclo de broadcast:', msg);
        }
    }
    setTimeout(broadcastPeriodically, config_1.default.aircraftBroadcastIntervalMs);
}
function startAircraftBroadcast() {
    broadcastPeriodically();
    console.log(`[aircraft-broadcast] rodando a cada ${config_1.default.aircraftBroadcastIntervalMs}ms`);
}
