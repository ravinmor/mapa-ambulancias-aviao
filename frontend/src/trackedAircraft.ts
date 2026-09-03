import type { TrackedAircraft } from './types';

// Espelha STAGE_SEQUENCE de sync-job/src/trackedAircraft.ts — precisa ser
// EXATAMENTE a mesma lista de strings, e na mesma ordem, pra indexOf()
// funcionar em AmilTimelineArc.tsx. Se um dia a heuristica de fase mudar la,
// mudar aqui junto.
export const STAGE_SEQUENCE = ['SOLO', 'DECOLAGEM', 'SUBIDA', 'CRUZEIRO', 'DESCIDA', 'APROXIMACAO', 'POUSO'] as const;
export type Stage = (typeof STAGE_SEQUENCE)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  SOLO: 'Solo',
  DECOLAGEM: 'Decolagem',
  SUBIDA: 'Subida',
  CRUZEIRO: 'Cruzeiro',
  DESCIDA: 'Descida',
  APROXIMACAO: 'Aproximação',
  POUSO: 'Pouso',
};

export function isStage(value: string | null): value is Stage {
  return value != null && (STAGE_SEQUENCE as readonly string[]).includes(value);
}

// Nome de exibicao: label configurado (backend) > callsign > icao24 em
// maiuscula — mesma cascata de aircraft.ts (aircraftName), so com o campo
// "label" entrando na frente por ser o nome que a Amil de fato reconhece.
export function trackedAircraftName(aircraft: TrackedAircraft): string {
  return aircraft.label ?? aircraft.callsign ?? aircraft.icao24.toUpperCase();
}

export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return '—';
  const date = new Date(lastSeenAt);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
