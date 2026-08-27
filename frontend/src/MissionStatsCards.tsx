import { useEffect, useState } from 'react';
import { apiUrl } from './api';
import type { Breakpoint } from './useBreakpoint';

// Cards de indicadores de missao, lateral direita do mapa — pedido do
// usuario 2026-08-27. Desde 00h00 de hoje (sem corte de turno — removido a
// pedido do usuario no mesmo dia, ver api/src/routes.ts) e pelo mesmo
// filtro de estado (SP/RJ) do mapa, quando ativo.
const POLL_INTERVAL_MS = 30_000;

interface MissionStats {
  windowStart: string;
  windowEnd: string;
  active: number;
  finished: number;
  total: number;
  qtaWithCost: number;
  qtaWithoutCost: number;
}

interface CardDef {
  key: keyof Pick<MissionStats, 'active' | 'finished' | 'total' | 'qtaWithCost' | 'qtaWithoutCost'>;
  label: string;
  colorVar: string | null; // null = cinza neutro
}

const CARDS: CardDef[] = [
  { key: 'active', label: 'Ativas', colorVar: 'var(--color-accent-500)' },
  { key: 'finished', label: 'Finalizadas', colorVar: null },
  { key: 'total', label: 'Total', colorVar: null },
  { key: 'qtaWithCost', label: 'QTA com custo', colorVar: 'var(--color-categories-rescue)' },
  { key: 'qtaWithoutCost', label: 'QTA sem custo', colorVar: null },
];

export default function MissionStatsCards({
  stateFilter,
  breakpoint,
}: {
  stateFilter: string;
  breakpoint: Breakpoint;
}) {
  const [stats, setStats] = useState<MissionStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      const query = stateFilter && stateFilter !== 'all' ? `?state=${encodeURIComponent(stateFilter)}` : '';
      fetch(apiUrl(`/api/missions/stats${query}`))
        .then((response) => response.json())
        .then((data: MissionStats) => {
          if (!cancelled) setStats(data);
        })
        .catch((error) => {
          if (!cancelled) console.error('Erro ao buscar indicadores de missao:', error);
        });
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stateFilter]);

  if (!stats) return null;

  const isMobile = breakpoint === 'mobile';

  return (
    <div
      className={isMobile ? 'mission-stats-rail mission-stats-rail-mobile' : 'mission-stats-rail'}
      aria-label="Indicadores de missão"
    >
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="mission-stats-card"
          style={
            {
              '--card-color': card.colorVar ?? 'var(--color-gray-400)',
            } as React.CSSProperties
          }
        >
          <span className="mission-stats-value">{stats[card.key]}</span>
          <span className="mission-stats-label">{card.label}</span>
        </div>
      ))}
    </div>
  );
}
