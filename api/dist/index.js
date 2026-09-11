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
