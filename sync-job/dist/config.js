"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
    }
    return value;
}
const DATA_SOURCE = process.env.DATA_SOURCE || 'simulated';
// Default "fixture", nao "live" — mesmo espirito do DATA_SOURCE=simulated:
// subir o projeto localmente nao pode gastar credito de uma cota diaria
// pequena e compartilhada por IP. Trocar pra "live" e opt-in via .env.
const OPENSKY_SOURCE = process.env.OPENSKY_SOURCE || 'fixture';
if (OPENSKY_SOURCE !== 'fixture' && OPENSKY_SOURCE !== 'live') {
    throw new Error(`OPENSKY_SOURCE invalido: "${OPENSKY_SOURCE}" (use "fixture" ou "live")`);
}
const config = {
    databaseUrl: required('DATABASE_URL'),
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 5000),
    historySyncIntervalMs: Number(process.env.HISTORY_SYNC_INTERVAL_MS || 30000),
    historyBackfillIntervalMs: Number(process.env.HISTORY_BACKFILL_INTERVAL_MS || 300000),
    missionEventSyncIntervalMs: Number(process.env.MISSION_EVENT_SYNC_INTERVAL_MS || 30000),
    missionSyncIntervalMs: Number(process.env.MISSION_SYNC_INTERVAL_MS || 30000),
    regulationSyncIntervalMs: Number(process.env.REGULATION_SYNC_INTERVAL_MS || 30000),
    disponibilidadeSyncIntervalMs: Number(process.env.DISPONIBILIDADE_SYNC_INTERVAL_MS || 30000),
    triagemSyncIntervalMs: Number(process.env.TRIAGEM_SYNC_INTERVAL_MS || 30000),
    equipeSyncIntervalMs: Number(process.env.EQUIPE_SYNC_INTERVAL_MS || 60000),
    dataSource: DATA_SOURCE,
    centerLat: Number(process.env.CENTER_LAT || -23.5505),
    centerLon: Number(process.env.CENTER_LON || -46.6333),
    historyRetentionDays: Number(process.env.HISTORY_RETENTION_DAYS || 30),
    opensky: {
        source: OPENSKY_SOURCE,
        url: process.env.OPENSKY_URL || 'https://opensky-network.org/api/states/all',
        // Bounding box cobrindo SP e RJ juntos — testado contra a API real.
        lamin: Number(process.env.OPENSKY_LAMIN || -24.5),
        lomin: Number(process.env.OPENSKY_LOMIN || -47.5),
        lamax: Number(process.env.OPENSKY_LAMAX || -22.0),
        lomax: Number(process.env.OPENSKY_LOMAX || -42.5),
        regionSplitLon: Number(process.env.OPENSKY_REGION_SPLIT_LON || -45.0),
        slotsPerRegion: Number(process.env.OPENSKY_SLOTS_PER_REGION || 5),
        syncIntervalMs: Number(process.env.AIRCRAFT_SYNC_INTERVAL_MS || 300000),
        historyRetentionDays: Number(process.env.AIRCRAFT_HISTORY_RETENTION_DAYS || 30),
    },
    trackedAircraft: {
        // Placeholders de desenvolvimento: hex publico e real de 4 aeronaves
        // comerciais (nao da Amil ainda) — 4 pra ja testar o suporte a
        // MULTIPLAS aeronaves de verdade (pedido do usuario, 2026-09-02: "a
        // Amil tem 4 aeronaves"), nao so 1. Trocar por TRACKED_AIRCRAFT_ICAO24S
        // (lista separada por virgula) quando os ICAO24 reais da Amil entrarem
        // em uso, sem precisar mexer em codigo. Aceita tambem o singular
        // TRACKED_AIRCRAFT_ICAO24 (1 so, retrocompatibilidade com o setup
        // anterior a essa lista). Este default so vale fora do docker-compose
        // (ex: panel machine sem Docker) — no compose, a variavel e definida la
        // (ver docker-compose.yml).
        // Historico de troca do 1o placeholder (antes de virar lista): 3c6444
        // (Lufthansa) pousou em Munique em 2026-09-02 — trocado por 3c5ee5
        // (Eurowings), depois por 407a05 (easyJet). Passou a lista de 4
        // (Europa), depois trocada de novo pra 4 sobre SAO PAULO (pedido do
        // usuario, 2026-09-02): e49ef1=GLO1556 (GOL), e48ba9=TAM8147 (LATAM),
        // e49f52=AZU6503 (Azul), e4a50e=TAM3194 (LATAM).
        icao24List: (process.env.TRACKED_AIRCRAFT_ICAO24S ||
            process.env.TRACKED_AIRCRAFT_ICAO24 ||
            'e49ef1,e48ba9,e49f52,e4a50e')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        url: process.env.TRACKED_AIRCRAFT_URL || 'https://opensky-network.org/api/states/all',
        // Espacado (aeronave no chao — pedido do usuario, 2026-09-02: "aumenta
        // de 15 em 15 minutos a busca pelos avioes parados").
        idleSyncIntervalMs: Number(process.env.TRACKED_AIRCRAFT_IDLE_SYNC_INTERVAL_MS || 900000),
        // Curto (aeronave voando de verdade).
        flightSyncIntervalMs: Number(process.env.TRACKED_AIRCRAFT_FLIGHT_SYNC_INTERVAL_MS || 300000),
        // O "scanner" (startLoop em index.ts) roda nesse ritmo so pra VERIFICAR
        // se alguma aeronave ja esta na hora do proprio intervalo dela — nao
        // gasta credito nenhum sozinho, quem decide ligar pro OpenSky de
        // verdade e checkOne() em trackedAircraft.ts. Bem mais curto que os
        // dois de cima de proposito, pra nao atrasar a hora certa de cada uma.
        scannerIntervalMs: Number(process.env.TRACKED_AIRCRAFT_SCANNER_INTERVAL_MS || 60000),
        // Retencao do trajeto (TrackedAircraftPositionHistory) — mesmo default
        // do pipeline generico (AIRCRAFT_HISTORY_RETENTION_DAYS).
        historyRetentionDays: Number(process.env.TRACKED_AIRCRAFT_HISTORY_RETENTION_DAYS || 30),
    },
};
if (DATA_SOURCE === 'sharepoint') {
    config.sharepoint = {
        fleetUrl: required('POWER_AUTOMATE_FLEET_URL'),
        trackingUrl: process.env.POWER_AUTOMATE_TRACKING_URL || undefined,
        historyBackfillUrl: process.env.POWER_AUTOMATE_HISTORY_BACKFILL_URL || undefined,
        diarioUrl: process.env.POWER_AUTOMATE_DIARIO_URL || process.env.POWER_AUTOMATE_MISSION_EVENTS_URL || undefined,
        missionsUrl: process.env.POWER_AUTOMATE_MISSIONS_URL || undefined,
        regulationsUrl: process.env.POWER_AUTOMATE_REGULATIONS_URL || undefined,
        disponibilidadeUrl: process.env.POWER_AUTOMATE_DISPONIBILIDADE_URL || undefined,
        triagemUrl: process.env.POWER_AUTOMATE_TRIAGEM_URL || undefined,
        equipesUrl: process.env.POWER_AUTOMATE_EQUIPES_URL || undefined,
        colaboradoresUrl: process.env.POWER_AUTOMATE_COLABORADORES_URL || undefined,
        composicaoEquipeUrl: process.env.POWER_AUTOMATE_COMPOSICAO_EQUIPE_URL || undefined,
    };
}
else if (DATA_SOURCE !== 'simulated') {
    throw new Error(`DATA_SOURCE invalido: "${DATA_SOURCE}" (use "simulated" ou "sharepoint")`);
}
exports.default = config;
