import { useEffect, useRef } from 'react';
import type { ActivityLogEntry } from './useAircraftActivityLog';

// Log de atividade "solto" (pedido do usuario, 2026-09-09: "não quero ele em
// um painel eu quero ele solto mas ocupando uma área parecida com o
// painel") — SEM card/borda/fundo (ao contrário de AmilMetadataPanel/
// AmilFlightInfoPanel, que usam .amil-hud-panel), só texto num container do
// mesmo tamanho que um painel ocuparia. Bem apagado por padrão, mais
// evidente no hover (CSS puro, ver .amil-activity-log em index.css) — ISSO
// não é feito aqui, é so a estrutura/dado; o estilo mora no CSS.
export default function AmilActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Se o usuario ja rolou pra cima pra ver o historico, um novo log entrando
  // nao deve "puxar" a tela de volta pro fim — so auto-rola quando ele ja
  // estava perto do fim (mesmo padrao de qualquer console/chat).
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  }

  return (
    <div className="amil-activity-log" aria-label="Log de atividade da aeronave">
      <div className="amil-activity-log-scroll" ref={scrollRef} onScroll={handleScroll}>
        {entries.map((entry) => (
          <div key={entry.id} className="amil-activity-log-line">
            <span className="amil-activity-log-prompt">{'>'}</span>{' '}
            <span className="amil-activity-log-action">[{entry.action}]</span>
            {': '}
            <span className="amil-activity-log-description">{entry.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
