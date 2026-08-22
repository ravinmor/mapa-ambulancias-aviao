"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentFleet = getCurrentFleet;
const client_1 = require("@prisma/client");
const db_1 = require("./db");
// INACTIVE (Baixa Operacional) fica de fora do mapa por decisao do usuario
// (2026-08-19) — filtro aqui na api, nao no banco, pra manter o Postgres como
// espelho fiel do que a origem diz. Filtra em JS, nao via WHERE do Prisma, de
// proposito: semantica de "not" em coluna nullable varia entre versoes/
// providers, e um veiculo com status null (texto nao reconhecido na origem)
// nao pode ficar excluido do mapa por acidente.
async function getCurrentFleet() {
    const vehicles = await db_1.prisma.vehicle.findMany({
        orderBy: { name: 'asc' },
        include: { currentPosition: true },
    });
    return vehicles
        .filter((v) => v.status !== client_1.VehicleStatus.INACTIVE)
        .map((v) => ({
        id: v.id,
        vehicleId: v.vehicleId,
        name: v.name,
        licensePlate: v.licensePlate,
        vehicleType: v.vehicleType,
        state: v.state,
        status: v.status,
        activityStatus: v.activityStatus,
        assignmentStatus: v.assignmentStatus,
        tabletEmail: v.tabletEmail,
        statusChangedAt: v.statusChangedAt,
        latitude: v.currentPosition?.latitude ?? null,
        longitude: v.currentPosition?.longitude ?? null,
        positionAt: v.currentPosition?.positionAt ?? null,
        updatedAt: v.currentPosition?.updatedAt ?? null,
    }));
}
