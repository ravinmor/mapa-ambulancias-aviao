import { useEffect, useState } from 'react';
import { apiUrl } from './api';

// Cards de indicadores de missao, lateral direita do mapa — pedido do
// usuario 2026-08-27. Recortados pelo turno atual (06h-18h dia / 18h-06h
// noite, calculado no servidor pra nao depender do relogio do navegador) e
// pelo mesmo filtro de estado (SP/RJ) do mapa, quando ativo.
const POLL_INTERVAL_MS = 30_000;

interface MissionStats {
  shift: 'day' | 'night';
  windowStart: string;
  windowEnd: string;
  active: number;
  finished: number;
  total: number;
  qtaWithCost: number;
  qtaWithoutCost: number;
}

function formatShiftLabel(shift: 'day' | 'night'): string {
  return shift === 'day' ? '06h00 às 18h00' : '18h00 às 06h00';
}

// Sol de dia, lua a noite — mesmo espirito do resto do mapa (sem lib de
// icones neste projeto, ver sidebarTabIcons.tsx/VehicleFilters.tsx).
function ShiftIcon({ shift }: { shift: 'day' | 'night' }) {
  if (shift === 'day') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M9 1.6v2M9 14.4v2M16.4 9h-2M3.6 9h-2M14.4 3.6l-1.4 1.4M4.6 13.4l-1.4 1.4M14.4 14.4l-1.4-1.4M4.6 4.6 3.2 3.2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M14.8 10.3A6 6 0 0 1 7.7 3.2a6.4 6.4 0 1 0 7.1 7.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
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

export default function MissionStatsCards({ stateFilter }: { stateFilter: string }) {
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

  return (
    <div className="mission-stats-rail" aria-label="Indicadores de missão">
      <div className="mission-stats-shift">
        <ShiftIcon shift={stats.shift} />
        <span>{formatShiftLabel(stats.shift)}</span>
      </div>
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
