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
    missionEventSyncIntervalMs: Number(process.env.MISSION_EVENT_SYNC_INTERVAL_MS || 30000),
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
};
if (DATA_SOURCE === 'sharepoint') {
    config.sharepoint = {
        fleetUrl: required('POWER_AUTOMATE_FLEET_URL'),
        trackingUrl: process.env.POWER_AUTOMATE_TRACKING_URL || undefined,
        missionEventsUrl: process.env.POWER_AUTOMATE_MISSION_EVENTS_URL || undefined,
    };
}
else if (DATA_SOURCE !== 'simulated') {
    throw new Error(`DATA_SOURCE invalido: "${DATA_SOURCE}" (use "simulated" ou "sharepoint")`);
}
exports.default = config;
