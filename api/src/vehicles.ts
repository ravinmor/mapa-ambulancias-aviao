import { prisma } from './db';

// "Nao Iniciado" (e variantes de acento/caixa) significa que a etapa nao
// aconteceu — qualquer outro valor preenchido ("Iniciado", "Confirmado")
// conta como cumprida. Mesmo criterio de MissionTimeline.tsx e de routes.ts
// — movida pra ca (e exportada) porque getCurrentFleet tambem precisa dela.
export function isStageDone(value: string | null): boolean {
  if (!value) return false;
  return !/^n[ãa]o\s+iniciado$/i.test(value.trim());
}

// Portado do sync-job antigo (toVehicleStatus/STATUS_TEXT_TO_ENUM, commit
// 1464de9 — o schema do nucleo removeu o enum VehicleStatus, Veiculo.
// operationStatus guarda o texto cru de "Status_Operacao" agora). O
// frontend (vehicleStatus.ts) ainda espera essas chaves de enum exatas pra
// colorir o marcador/badge, entao a conversao precisa acontecer aqui na
// leitura, ja que a escrita (sync-job) parou de fazer isso. Valor
// desconhecido vira null (nao quebra a listagem) — mesma politica de antes.
const STATUS_TEXT_TO_ENUM: Record<string, string> = {
  'Em Operação': 'IN_SERVICE',
  'Baixa Operacional': 'INACTIVE',
  'Em Manutenção': 'MAINTENANCE',
  'Fora da Operação': 'AVAILABLE',
  'Sem Operação': 'AVAILABLE',
  Reserva: 'RESERVE',
  'Apoio Amil': 'EVENT_SUPPORT',
};

function toVehicleStatus(raw: string | null): string | null {
  if (raw == null) return null;
  return STATUS_TEXT_TO_ENUM[raw] ?? null;
}

// Estados de Operacao.currentStatus que significam "ja terminou, de um jeito
// ou de outro" — o resto conta como ativa. Decisao 2026-09-22: o campo
// Operacao.operationStatus (mesma coluna de origem "Status_Operacao" que a
// Mission antiga usava pra achar "Em Operação") veio SEMPRE null na 2a
// auditoria contra dado real — nao da mais pra usar. currentStatus (enum
// StatusOperacao) e a fonte nova, confirmada com o usuario.
const TERMINAL_OPERACAO_STATUS = new Set([
  'CONCLUIDA_PELO_RESGATE',
  'CONCLUIDA_PELO_CONTROLE',
  'CANCELADA',
  'CANCELADA_PELO_RESGATE',
]);

function isOperacaoActive(currentStatus: string | null, cancelledAt: Date | null): boolean {
  if (cancelledAt) return false;
  if (!currentStatus) return true; // AGUARDANDO_ACEITE = null na origem, ver enums.prisma
  return !TERMINAL_OPERACAO_STATUS.has(currentStatus);
}

export interface VehicleSnapshot {
  id: number;
  vehicleId: string;
  name: string;
  licensePlate: string | null;
  vehicleType: string | null;
  state: string | null;
  status: string | null;
  activityStatus: string | null;
  assignmentStatus: string | null;
  tabletEmail: string | null;
  statusChangedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  positionAt: Date | null;
  updatedAt: Date | null;
  // Operacao atual do veiculo esta ativa na origem mas a equipe ainda nao
  // deu aceite (acceptanceStatus ainda "Nao Iniciado") — pedido do usuario
  // 2026-09-17. Nesse estado a posicao acima (se houver) e a ULTIMA
  // conhecida de uma operacao anterior, nao a posicao real agora — o front
  // usa isso so pra pintar o marcador com cor de espera, ver vehicleStatus.ts.
  pendingAcceptance: boolean;
}

// INACTIVE (Baixa Operacional) fica de fora do mapa por decisao do usuario
// (2026-08-19) — filtro aqui na api, nao no banco, pra manter o Postgres como
// espelho fiel do que a origem diz. Filtra em JS, nao via WHERE do Prisma, de
// proposito: semantica de "not" em coluna nullable varia entre versoes/
// providers, e um veiculo com status null (texto nao reconhecido na origem)
// nao pode ficar excluido do mapa por acidente.
export async function getCurrentFleet(): Promise<VehicleSnapshot[]> {
  const veiculos = await prisma.veiculo.findMany({
    orderBy: { name: 'asc' },
    include: { posicaoAtual: true },
  });

  // Operacoes ativas (nao terminais) de QUALQUER veiculo — usado so pra
  // marcar pendingAcceptance abaixo. Ligacao direta por veiculoId (FK real
  // no nucleo, diferente do schema antigo onde Mission.vehicleId era um
  // numero solto sem relacao Prisma).
  const activeOperacoes = await prisma.operacao.findMany({
    where: { veiculoId: { not: null } },
    select: { veiculoId: true, currentStatus: true, cancelledAt: true, acceptanceStatus: true },
  });
  const pendingAcceptanceVehicleIds = new Set<number>();
  for (const op of activeOperacoes) {
    if (
      op.veiculoId != null &&
      isOperacaoActive(op.currentStatus, op.cancelledAt) &&
      !isStageDone(op.acceptanceStatus)
    ) {
      pendingAcceptanceVehicleIds.add(op.veiculoId);
    }
  }

  return veiculos
    .filter((v) => toVehicleStatus(v.operationStatus) !== 'INACTIVE')
    .map((v) => ({
      id: v.id,
      vehicleId: String(v.id),
      name: v.name,
      licensePlate: v.licensePlate,
      vehicleType: v.vehicleType,
      state: v.state,
      status: toVehicleStatus(v.operationStatus),
      activityStatus: v.activityStatus,
      assignmentStatus: v.tabletAssignmentStatus,
      tabletEmail: v.tabletEmail,
      statusChangedAt: v.statusChangedAt,
      latitude: v.posicaoAtual?.latitude ?? null,
      longitude: v.posicaoAtual?.longitude ?? null,
      positionAt: v.posicaoAtual?.positionAt ?? null,
      updatedAt: v.posicaoAtual?.updatedAt ?? null,
      pendingAcceptance: pendingAcceptanceVehicleIds.has(v.id),
    }));
}
