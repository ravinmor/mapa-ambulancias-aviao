import { VehicleStatus } from '@prisma/client';
import { prisma } from './db';

export interface VehicleSnapshot {
  id: number;
  vehicleId: string;
  name: string;
  licensePlate: string | null;
  vehicleType: string | null;
  state: string | null;
  status: VehicleStatus | null;
  activityStatus: string | null;
  assignmentStatus: string | null;
  tabletEmail: string | null;
  statusChangedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  positionAt: Date | null;
  updatedAt: Date | null;
}

// INACTIVE (Baixa Operacional) fica de fora do mapa por decisao do usuario
// (2026-08-19) — filtro aqui na api, nao no banco, pra manter o Postgres como
// espelho fiel do que a origem diz. Filtra em JS, nao via WHERE do Prisma, de
// proposito: semantica de "not" em coluna nullable varia entre versoes/
// providers, e um veiculo com status null (texto nao reconhecido na origem)
// nao pode ficar excluido do mapa por acidente.
export async function getCurrentFleet(): Promise<VehicleSnapshot[]> {
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { name: 'asc' },
    include: { currentPosition: true },
  });

  return vehicles
    .filter((v) => v.status !== VehicleStatus.INACTIVE)
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
