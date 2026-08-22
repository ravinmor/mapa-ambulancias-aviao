"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = __importDefault(require("./config"));
const routes_1 = __importDefault(require("./routes"));
const broadcast_1 = require("./broadcast");
const aircraftBroadcast_1 = require("./aircraftBroadcast");
const app = (0, express_1.default)();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config_1.default.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
app.use(routes_1.default);
// Sem espera por conexao aqui de proposito — o Dockerfile roda "prisma migrate
// deploy" (com retry) antes de iniciar o processo, entao o Postgres ja esta
// garantidamente pronto quando chegamos aqui.
(0, broadcast_1.startBroadcast)();
(0, aircraftBroadcast_1.startAircraftBroadcast)();
app.listen(config_1.default.port, () => {
    console.log(`[api] rodando na porta ${config_1.default.port}`);
});
