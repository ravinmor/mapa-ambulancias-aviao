// Rotulos em portugues dos status que a API devolve (enum VehicleStatus do
// Prisma). Vive aqui, num modulo proprio, porque tanto a sidebar quanto o
// filtro do mapa precisam dos mesmos textos — antes era um const solto
// dentro de VehicleSidebar.tsx.
//
// INACTIVE ("Baixa Operacional") existe no enum mas nao aparece no mapa: a
// API ja filtra essas vans fora do snapshot (ver api/src/vehicles.ts), entao
// nunca chega aqui — mantido no mapa de rotulos so por completude.
export const STATUS_LABEL: Record<string, string> = {
  IN_SERVICE: 'Em Operação',
  INACTIVE: 'Baixa Operacional',
  MAINTENANCE: 'Em Manutenção',
  AVAILABLE: 'Fora de Operação',
  RESERVE: 'Reserva',
  EVENT_SUPPORT: 'Apoio Amil',
};

export function statusLabel(status: string | null): string {
  if (!status) return 'Sem status';
  return STATUS_LABEL[status] ?? status;
}

// Cor do status — usada no marcador do mapa (Map.tsx) e no badge da sidebar
// (VehicleSidebar.tsx), que antes tinham cada um sua propria copia dessa
// funcao (colorByStatus/statusColorVar). MAINTENANCE e status desconhecido
// caem no cinza neutro — nao tem pedido ainda pra diferenciar esses.
export function statusColorVar(status: string | null): string {
  if (status === 'IN_SERVICE') return 'var(--color-categories-rescue)';
  if (status === 'AVAILABLE') return 'var(--color-accent-500)';
  if (status === 'RESERVE') return 'var(--color-status-reserve)';
  if (status === 'EVENT_SUPPORT') return 'var(--color-status-event-support)';
  return 'var(--color-gray-500)';
}

// Classe-base do pulso neon (ver index.css) — cada status pulsa na sua
// propria cor; a animacao em si so roda combinada com ".is-active" (hover ou
// selecionada), nao mais "sempre que o status for X".
export function statusPulseClass(status: string | null): string {
  if (status === 'IN_SERVICE') return 'marker-pulse-rescue';
  if (status === 'AVAILABLE') return 'marker-pulse-accent';
  if (status === 'RESERVE') return 'marker-pulse-reserve';
  if (status === 'EVENT_SUPPORT') return 'marker-pulse-event-support';
  return 'marker-pulse-neutral';
}
