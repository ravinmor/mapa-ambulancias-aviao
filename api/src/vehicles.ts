import { VehicleStatus } from '@prisma/client';
import { prisma } from './db';

// "Nao Iniciado" (e variantes de acento/caixa) significa que a etapa nao
// aconteceu — qualquer outro valor preenchido ("Iniciado", "Confirmado")
// conta como cumprida. Mesmo criterio do MissionTimeline.tsx (isStageDone)
// e de routes.ts — movida pra ca (e exportada) porque agora getCurrentFleet
// tambem precisa dela; routes.ts importa daqui em vez de ter copia propria.
export function isStageDone(value: string | null): boolean {
  if (!value) return false;
  return !/^n[ãa]o\s+iniciado$/i.test(value.trim());
}

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
  // Missao atual da van esta "Em Operação" na origem mas a equipe ainda nao
  // deu aceite (Amb_Confirmacao_de_ciencia_do_ch ainda "Nao Iniciado") —
  // pedido do usuario 2026-09-17. Nesse estado a posicao acima (se houver) e
  // a ULTIMA conhecida de uma missao anterior, nao a posicao real agora — o
  // front usa isso so pra pintar o marcador com cor de espera, ver
  // vehicleStatus.ts.
  pendingAcceptance: boolean;
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

  // Missoes "Em Operação" (nao canceladas) de QUALQUER van — usado so pra
  // marcar pendingAcceptance abaixo. Uma query separada (nao um include no
  // Vehicle) porque a ligacao Mission -> Vehicle e por numero solto
  // (vehicleId), sem relacao Prisma — mesmo padrao ja usado em outras
  // partes do sync (ver comentario em mission.prisma).
  const activeMissions = await prisma.mission.findMany({
    where: { cancelledAt: null, operationStatus: { equals: 'Em Operação', mode: 'insensitive' } },
    select: { vehicleId: true, acceptanceStatus: true },
  });
  const pendingAcceptanceVehicleIds = new Set<number>();
  for (const m of activeMissions) {
    if (m.vehicleId != null && !isStageDone(m.acceptanceStatus)) {
      pendingAcceptanceVehicleIds.add(m.vehicleId);
    }
  }

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
      pendingAcceptance: pendingAcceptanceVehicleIds.has(v.id),
    }));
}
