"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackedAircraft = getTrackedAircraft;
exports.getTrackedAircraftFlightHistory = getTrackedAircraftFlightHistory;
const db_1 = require("./db");
const config_1 = __importDefault(require("./config"));
async function getTrackedAircraft() {
    // So a frota CONFIGURADA agora (ver comentario em config.ts) — linhas
    // antigas continuam no banco, so somem da listagem.
    const rows = await db_1.prisma.trackedAircraft.findMany({
        where: { icao24: { in: config_1.default.trackedAircraftIcao24List } },
        orderBy: { id: 'asc' },
    });
    return rows.map((a) => ({
        id: a.id,
        icao24: a.icao24,
        label: a.label,
        callsign: a.callsign,
        latitude: a.latitude,
        longitude: a.longitude,
        altitude: a.altitude,
        velocity: a.velocity,
        trueTrack: a.trueTrack,
        verticalRate: a.verticalRate,
        onGround: a.onGround,
        squawk: a.squawk,
        stage: a.stage,
        tier: a.tier,
        isOnline: a.isOnline,
        positionAt: a.positionAt,
        lastSeenAt: a.lastSeenAt,
        flightStartedAt: a.flightStartedAt,
        flightEndedAt: a.flightEndedAt,
        registration: a.registration,
        manufacturer: a.manufacturer,
        model: a.model,
        operator: a.operator,
        originIcao: a.originIcao,
        originName: a.originName,
        destinationIcao: a.destinationIcao,
        destinationName: a.destinationName,
        destinationLatitude: a.destinationLatitude,
        destinationLongitude: a.destinationLongitude,
        photoUrl: a.photoUrl,
        photoThumbnailUrl: a.photoThumbnailUrl,
    }));
}
// Historico de voos passados de UMA aeronave (mais recente primeiro) —
// limitado (nao precisa do historico inteiro pro grafico, so os ultimos N).
const FLIGHT_HISTORY_LIMIT = 30;
async function getTrackedAircraftFlightHistory(trackedAircraftId) {
    const rows = await db_1.prisma.trackedAircraftFlightHistory.findMany({
        where: { trackedAircraftId },
        orderBy: { departedAt: 'desc' },
        take: FLIGHT_HISTORY_LIMIT,
    });
    return rows.map((r) => ({
        id: r.id,
        callsign: r.callsign,
        departureIcao: r.departureIcao,
        arrivalIcao: r.arrivalIcao,
        departedAt: r.departedAt,
        arrivedAt: r.arrivedAt,
    }));
}
