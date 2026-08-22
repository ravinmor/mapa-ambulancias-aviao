"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatedSource = void 0;
const config_1 = __importDefault(require("../config"));
// Estado em memoria do processo — sem dependencia externa, e o que faz o
// "docker compose up" funcionar sem nenhuma credencial do SharePoint.
// Texto em portugues de proposito, igual ao valor real que vem do SharePoint
// ("Status Operacao") — mantem o modo demo exercitando o mesmo mapeamento
// pra enum que o modo sharepoint usa, em vez de um atalho so pro demo.
const fleet = [
    { vehicleId: 'demo-001', name: 'VTR 01', licensePlate: 'DEM0A01', vehicleType: 'BASICO', state: 'SP', status: 'Em Operação', lat: config_1.default.centerLat, lon: config_1.default.centerLon },
    { vehicleId: 'demo-002', name: 'VTR 02', licensePlate: 'DEM0A02', vehicleType: 'UTI', state: 'SP', status: 'Em Operação', lat: config_1.default.centerLat - 0.01, lon: config_1.default.centerLon - 0.01 },
    { vehicleId: 'demo-003', name: 'VTR 03', licensePlate: 'DEM0A03', vehicleType: 'BASICO', state: 'SP', status: 'Em Operação', lat: config_1.default.centerLat + 0.01, lon: config_1.default.centerLon + 0.01 },
    { vehicleId: 'demo-004', name: 'VTR 04', licensePlate: 'DEM0A04', vehicleType: 'PED', state: 'RJ', status: 'Fora de Operação', lat: config_1.default.centerLat - 0.02, lon: config_1.default.centerLon + 0.02 },
];
// Contador em memoria simulando o ID de item que o SharePoint atribuiria a
// cada linha nova do rastreio — so pra manter PositionHistory.id preenchido
// de forma coerente no modo demo.
let nextHistoryId = 1;
function randomStep() {
    return (Math.random() - 0.5) * 0.004;
}
exports.simulatedSource = {
    async fetchFleet() {
        const now = new Date();
        return fleet.map((v) => {
            v.lat += randomStep();
            v.lon += randomStep();
            return {
                vehicleId: v.vehicleId,
                name: v.name,
                licensePlate: v.licensePlate,
                vehicleType: v.vehicleType,
                state: v.state,
                status: v.status,
                activityStatus: 'Ativo',
                assignmentStatus: null,
                tabletEmail: null,
                statusChangedAt: null,
                latitude: v.lat,
                longitude: v.lon,
                positionAt: now,
            };
        });
    },
    // Modo demo nao tem uma lista de rastreio separada — reaproveita a posicao
    // atual da frota como se fosse um novo ping de historico a cada ciclo, so
    // pra manter a trajetoria funcionando localmente sem credencial nenhuma.
    async fetchHistorySince() {
        const now = new Date();
        return fleet.map((v) => ({
            id: nextHistoryId++,
            vehicleId: v.vehicleId,
            latitude: v.lat,
            longitude: v.lon,
            positionAt: now,
            vehicleStatus: v.status,
            callId: null,
            operationId: null,
            appVersion: null,
            device: null,
        }));
    },
    // Modo demo nao simula eventos de missao — MissionTimeline.tsx continua
    // com seu proprio dado mockado no frontend ate a API/frontend serem
    // ligados nessa fonte nova.
    async fetchMissionEventsSince() {
        return [];
    },
};
