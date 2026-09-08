import { useEffect, useState } from 'react';
import type { TrackedAircraftFlightHistoryEntry } from './types';
import { apiUrl } from './api';

// Historico de voos passados, lado ESQUERDO (R-31 cont., pedido do usuario
// 2026-09-04: "crie um grafico em um painel na lateral esquerda com o
// historico de voo mostrando origem destino e o tempo de voo e a data,
// vindos do opensky"). Mesmo estilo `.amil-hud-panel` dos outros paineis
// novos — grafico de barras fino (duracao de cada perna), sem grade pesada,
// no espirito da referencia "Aerovista" (R-26).
//
// So ICAO dos aeroportos (nao nome/municipio) — diferente do
// AmilMetadataPanel (rota ATUAL, via adsbdb): aqui o dado vem do OpenSky
// (sources/openskyFlightsSource.ts), que so da o codigo, sem nome.

const MAX_ENTRIES_SHOWN = 8;

function formatDuration(departedAt: string, arrivedAt: string | null): string {
  if (!arrivedAt) return '—';
  const minutes = Math.round((new Date(arrivedAt).getTime() - new Date(departedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

function durationMinutes(departedAt: string, arrivedAt: string | null): number {
  if (!arrivedAt) return 0;
  return Math.max(0, (new Date(arrivedAt).getTime() - new Date(departedAt).getTime()) / 60000);
}

function formatDate(departedAt: string): string {
  return new Date(departedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function AmilFlightHistoryPanel({ trackedAircraftId }: { trackedAircraftId: number }) {
  const [entries, setEntries] = useState<TrackedAircraftFlightHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/api/tracked-aircraft/${trackedAircraftId}/flight-history`))
      .then((response) => response.json())
      .then((rows: TrackedAircraftFlightHistoryEntry[]) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Erro ao buscar histórico de voos:', error);
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trackedAircraftId]);

  if (entries.length === 0) return null;

  const shown = entries.slice(0, MAX_ENTRIES_SHOWN);
  const maxMinutes = Math.max(1, ...shown.map((e) => durationMinutes(e.departedAt, e.arrivedAt)));

  return (
    <div className="amil-metadata-panel amil-hud-panel amil-flighthistory-panel">
      <div className="amil-metadata-header">
        <svg className="amil-metadata-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h18M12 3v18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <div className="amil-metadata-title">Histórico de voos</div>
      </div>
      <div className="amil-flighthistory-list">
        {shown.map((entry) => {
          const minutes = durationMinutes(entry.departedAt, entry.arrivedAt);
          const barPct = (minutes / maxMinutes) * 100;
          return (
            <div key={entry.id} className="amil-flighthistory-row">
              <div className="amil-flighthistory-row-top">
                <span className="amil-flighthistory-route">
                  {entry.departureIcao ?? '?'} → {entry.arrivalIcao ?? '?'}
                </span>
                <span className="amil-flighthistory-date">{formatDate(entry.departedAt)}</span>
              </div>
              <div className="amil-flighthistory-bar-track">
                <div className="amil-flighthistory-bar" style={{ width: `${Math.max(4, barPct)}%` }} />
              </div>
              <span className="amil-flighthistory-duration">{formatDuration(entry.departedAt, entry.arrivedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
