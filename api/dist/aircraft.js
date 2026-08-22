"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentAircraft = getCurrentAircraft;
const db_1 = require("./db");
// "trackedRegion != null" e o que separa quem esta ocupando vaga de quem ja
// saiu da area: a linha da aeronave liberada continua no banco (com o
// historico dela) ate o expurgo, mas nao pode aparecer no mapa. Equivale ao
// filtro de INACTIVE em getCurrentFleet, so que aqui da pra fazer no WHERE —
// a coluna e nula por design, nao por dado faltando na origem.
async function getCurrentAircraft() {
    const rows = await db_1.prisma.aircraft.findMany({
        where: { trackedRegion: { not: null } },
        orderBy: [{ trackedRegion: 'asc' }, { callsign: 'asc' }],
    });
    return rows.map((a) => ({
        id: a.id,
        icao24: a.icao24,
        callsign: a.callsign,
        originCountry: a.originCountry,
        region: a.trackedRegion,
        latitude: a.latitude,
        longitude: a.longitude,
        altitude: a.altitude,
        velocity: a.velocity,
        trueTrack: a.trueTrack,
        verticalRate: a.verticalRate,
        onGround: a.onGround,
        squawk: a.squawk,
        positionAt: a.positionAt,
        updatedAt: a.updatedAt,
    }));
}
