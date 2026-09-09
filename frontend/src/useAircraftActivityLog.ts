import { useCallback, useRef, useState } from 'react';
import type { TrackedAircraft } from './types';

// Log de atividade da aeronave SELECIONADA (pedido do usuario, 2026-09-09):
// um rastro tipo terminal do que esta acontecendo com ela — cada requisicao
// feita a api, se a posicao mostrada agora e um fix real ou dead reckoning
// (useDeadReckoning.ts so faz a extrapolacao visual, quem sabe se HAVIA fix
// novo neste poll e aqui), mudanca de estagio (stage) e em qual tier de
// recheck ela esta (tier, escrito pelo sync-job — ver classifyApproachTier
// em sync-job/src/trackedAircraft.ts. NAO reconstruido aqui, so exibido).
//
// Por que via callback (recordPoll/setSelectedId) e nao um useEffect
// observando aircraftList/selectedId direto: o poll() em AmilJetPage.tsx
// roda numa unica vez, no mount (setInterval proprio) — se o hook dependesse
// de props reativas (selectedId por valor), toda troca de selecao recriaria
// a funcao de log, e usa-la como dependencia do efeito de poll faria ele
// reiniciar o timer a cada selecao. Aqui a referencia selectedIdRef muda por
// fora (setSelectedId), mas recordPoll em si NUNCA muda de identidade.
export interface ActivityLogEntry {
  id: number;
  action: string;
  description: string;
}

const LOG_LIMIT = 200;

function formatLatLon(latitude: number | null, longitude: number | null): string {
  const lat = latitude != null ? latitude.toFixed(4) : '—';
  const lon = longitude != null ? longitude.toFixed(4) : '—';
  return `lat: ${lat} lon: ${lon}`;
}

export function useAircraftActivityLog() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const nextIdRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);
  const prevSnapshotRef = useRef<TrackedAircraft | null>(null);

  const appendEntry = useCallback((action: string, description: string) => {
    setEntries((prev) => {
      const entry: ActivityLogEntry = { id: nextIdRef.current++, action, description };
      const next = [...prev, entry];
      return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    });
  }, []);

  // Chamado de fora (AmilJetPage.tsx) sempre que selection.selectedId muda —
  // reseta o log pra comecar do zero na aeronave nova (mesmo padrao do
  // key={selectedId} ja usado no arco/timeline).
  const setSelectedId = useCallback((id: number | null) => {
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    prevSnapshotRef.current = null;
    setEntries([]);
  }, []);

  // Chamado apos CADA tentativa de poll (sucesso ou erro) — "cada requisicao
  // feita a api", pedido explicito do usuario. rows=null significa que a
  // requisicao falhou.
  const recordPoll = useCallback(
    (rows: TrackedAircraft[] | null) => {
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId == null) return; // nada selecionado, ninguem ve o log — nao vale gerar entradas

      if (rows == null) {
        appendEntry('poll', 'erro ao consultar GET /api/tracked-aircraft');
        return;
      }
      appendEntry('poll', `GET /api/tracked-aircraft — ${rows.length} aeronave(s)`);

      const current = rows.find((a) => a.id === currentSelectedId) ?? null;
      if (!current) return;

      const posLabel = formatLatLon(current.latitude, current.longitude);
      const prev = prevSnapshotRef.current;

      if (!prev) {
        appendEntry('selecao', `${current.callsign ?? current.icao24.toUpperCase()} selecionada`);
      } else {
        // positionAt so muda quando um fix REAL novo chega (ver comentario
        // em useDeadReckoning.ts) — inalterado entre polls = a posicao
        // exibida agora e extrapolada (dead reckoning), nao medida.
        if (current.positionAt !== prev.positionAt) {
          appendEntry('tempo-real', `fix novo recebido — ${posLabel}`);
        } else {
          appendEntry('dead-reckoning', 'sem fix novo neste ciclo — extrapolando posicao');
        }
        if (current.stage !== prev.stage) {
          appendEntry('status', `${prev.stage ?? '—'} -> ${current.stage ?? '—'}`);
        }
      }
      appendEntry(current.tier ?? 'tier', posLabel);

      prevSnapshotRef.current = current;
    },
    [appendEntry],
  );

  return { entries, recordPoll, setSelectedId };
}
