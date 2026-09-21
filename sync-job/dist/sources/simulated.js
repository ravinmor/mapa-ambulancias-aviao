"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatedSource = void 0;
const config_1 = __importDefault(require("../config"));
const veiculos = [
    { id: 1, name: 'VTR 01', licensePlate: 'DEM0A01', vehicleType: 'BASICO', lat: config_1.default.centerLat, lon: config_1.default.centerLon },
    { id: 2, name: 'VTR 02', licensePlate: 'DEM0A02', vehicleType: 'UTI', lat: config_1.default.centerLat - 0.01, lon: config_1.default.centerLon - 0.01 },
    { id: 3, name: 'VTR 03', licensePlate: 'DEM0A03', vehicleType: 'BASICO', lat: config_1.default.centerLat + 0.01, lon: config_1.default.centerLon + 0.01 },
    { id: 4, name: 'VTR 04', licensePlate: 'DEM0A04', vehicleType: 'PED', lat: config_1.default.centerLat - 0.02, lon: config_1.default.centerLon + 0.02 },
];
let nextPosicaoId = 1;
function randomStep() {
    return (Math.random() - 0.5) * 0.004;
}
exports.simulatedSource = {
    async fetchVeiculos() {
        return veiculos.map((v) => ({
            id: v.id,
            name: v.name,
            licensePlate: v.licensePlate,
            vehicleType: v.vehicleType,
            activityStatus: 'Ativo',
            operationStatus: 'Em Operação',
            initialKm: 0,
            tabletId: null,
            tabletAssignmentStatus: null,
            tabletEmail: null,
            state: 'SP',
            teamAssignmentStatus: null,
            edition: null,
            statusChangedAt: null,
        }));
    },
    // Reaproveita a posicao atual do veiculo como novo ping a cada ciclo, so
    // pra manter a trajetoria funcionando localmente. ID da operacao demo =
    // 9000 + index do veiculo (mesmo id usado em fetchRecentOperacoes/
    // fetchRecentChamados, pra tudo bater no modo demo).
    async fetchPosicaoForVeiculo(veiculoId) {
        const v = veiculos.find((x) => x.id === veiculoId);
        if (!v)
            return [];
        v.lat += randomStep();
        v.lon += randomStep();
        const index = veiculos.indexOf(v);
        return [
            {
                id: nextPosicaoId++,
                veiculoId: v.id,
                operacaoId: 9000 + index,
                chamadoId: 9000 + index,
                latitude: v.lat,
                longitude: v.lon,
                positionAt: new Date(),
                vehicleStatus: 'Em Operação',
                tabletId: null,
                appVersion: null,
                device: null,
                action: null,
            },
        ];
    },
    // Modo demo nunca sincroniza sem "action" (sempre gera ponto novo) — sem
    // gap pra recuperar, entao nada pra backfill.
    async fetchPosicaoBackfillForOperacao() {
        return [];
    },
    // Um chamado por veiculo — dado de paciente fixo, endereco fixo.
    async fetchRecentChamados() {
        return veiculos.map((v, index) => ({
            id: 9000 + index,
            patientName: 'Paciente Demo',
            medicalRecordNumber: 100000 + index,
            patientBirthDate: new Date('1972-03-15'),
            patientAge: '54',
            patientSex: 'Masculino',
            patientWeightKg: 78,
            patientHeightCm: 175,
            patientType: 'Adulto',
            patientTypeOther: null,
            isIntubated: false,
            isObese: false,
            healthPlan: 'Amil',
            contact: null,
            patientEmail: null,
            originPhone: null,
            destinationPhone: null,
            diagnosis: 'Dor torácica',
            procedure: 'Remoção simples',
            equipment: 'Monitor cardíaco',
            deviceUsage: 'Não',
            requestedVehicleType: 'BASICO',
            triageCompleted: false,
            tipoChamadoId: null,
            tipoChamadoText: null,
            callReason: 'Remoção hospitalar',
            requestOrigin: null,
            requestedAt: null,
            originName: 'Base Demo',
            originAddress: 'Av. Paulista, 1000',
            originSector: null,
            destinationName: 'Hospital Demo',
            destinationAddress: 'R. das Flores, 250',
            destinationSector: 'Pronto Socorro',
            companion: 'Sem acompanhante',
            originDoctor: null,
            destinationDoctor: null,
            state: 'SP',
            orderNumber: null,
            notes: null,
            statusRaw: 'Chamado criado, aguardando aceite do Controle.',
            statusForEdit: null,
            motivoCancelamentoRaw: null,
            cancellationNotes: null,
            expectedArrivalOriginAt: null,
            expectedArrivalDestAt: null,
            actualArrivalDestAt: null,
            aereoRequestId: null,
            aereoText: null,
            ambulanciaAereo: null,
        }));
    },
    // Uma operacao por veiculo, em andamento: 4 primeiras etapas preenchidas,
    // 3 ultimas em aberto — mesmo estado do arquivo antigo (mostra progresso
    // parcial, util pra exercitar a timeline).
    async fetchRecentOperacoes() {
        const now = Date.now();
        const minutesAgo = (n) => new Date(now - n * 60000);
        return veiculos.map((v, index) => ({
            id: 9000 + index,
            chamadoId: 9000 + index,
            tripTypeRaw: 'IDA',
            equipeId: null,
            veiculoId: v.id,
            currentStatusRaw: 'Chegada na origem confirmada, aguardando iniciar deslocamento para o destino.',
            shortStatus: 'Na origem',
            operationStatus: null,
            acceptanceStatus: null,
            minAmbulanceAt: null,
            assignedFlag: true,
            state: 'SP',
            acknowledgementStatus: null,
            departedToOriginStatus: null,
            arrivedAtOriginStatus: null,
            departedToDestStatus: null,
            arrivedAtDestStatus: null,
            finishedStatus: null,
            assignedAt: minutesAgo(48),
            assignedByEmail: null,
            acknowledgedAt: minutesAgo(45),
            acknowledgedByEmail: null,
            departedToOriginAt: minutesAgo(40),
            departedToOriginByEmail: null,
            arrivedAtOriginAt: minutesAgo(20),
            arrivedAtOriginByEmail: null,
            departedToDestAt: null,
            departedToDestByEmail: null,
            arrivedAtDestAt: null,
            arrivedAtDestByEmail: null,
            finishedAt: null,
            finishedByEmail: null,
            lastActionAt: minutesAgo(20),
            etaOrigin: null,
            etaDestination: null,
            originAddress: null,
            destinationAddress: null,
            cancelledAt: null,
            cancellationReason: null,
            cancellationNotes: null,
            cancellationAreaResponsible: null,
            aereoRequestId: null,
            ambulanciaAereo: null,
            disponibilidadeRequestId: null,
            waypoints: [],
            fichaTransporteFrenteUrl: null,
            fichaTransporteVersoUrl: null,
            patientIsolation: null,
            cleaningNurse: null,
            appVersion: null,
            device: null,
            qta: null,
        }));
    },
    // Dominios novos (Equipe/Colaborador/ComposicaoEquipe/Disponibilidade/
    // Triagem/Diario) — sem simulacao dedicada por enquanto, arrays vazios
    // (nao quebra os ciclos, so nao exercita nada no modo demo ainda).
    async fetchEquipes() {
        return [];
    },
    async fetchColaboradores() {
        return [];
    },
    async fetchComposicaoEquipe() {
        return [];
    },
    async fetchRecentDisponibilidades() {
        return [];
    },
    async fetchRecentTriagens() {
        return [];
    },
    async fetchDiarioSince() {
        return [];
    },
};
