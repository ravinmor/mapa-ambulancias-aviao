"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
    }
    return value;
}
const config = {
    databaseUrl: required('DATABASE_URL'),
    port: Number(process.env.PORT || 3000),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    broadcastIntervalMs: Number(process.env.BROADCAST_INTERVAL_MS || 5000),
    historyWindowHours: Number(process.env.HISTORY_WINDOW_HOURS || 24),
    historyRowLimit: Number(process.env.HISTORY_ROW_LIMIT || 5000),
    aircraftBroadcastIntervalMs: Number(process.env.AIRCRAFT_BROADCAST_INTERVAL_MS || 30000),
    aircraftHistoryWindowHours: Number(process.env.AIRCRAFT_HISTORY_WINDOW_HOURS || 24),
    aircraftTrailGapMinutes: Number(process.env.AIRCRAFT_TRAIL_GAP_MINUTES || 20),
    trackedAircraftHistoryWindowHours: Number(process.env.TRACKED_AIRCRAFT_HISTORY_WINDOW_HOURS || 48),
    trackedAircraftTrailGapMinutes: Number(process.env.TRACKED_AIRCRAFT_TRAIL_GAP_MINUTES || 45),
    // Mesmo default do sync-job (ver icao24List em sync-job/src/config.ts) —
    // so importa bater os dois quando a env var REALMENTE nao estiver setada
    // (fora do docker-compose); dentro dele, os dois sempre leem o mesmo
    // TRACKED_AIRCRAFT_ICAO24S.
    trackedAircraftIcao24List: (process.env.TRACKED_AIRCRAFT_ICAO24S ||
        process.env.TRACKED_AIRCRAFT_ICAO24 ||
        'e49ef1,e48ba9,e49f52,e4a50e')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
};
exports.default = config;
