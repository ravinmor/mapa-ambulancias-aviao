import { useLayoutEffect, useRef, useState } from 'react';

// Traco decorativo lateral (pedido do usuario, 2026-09-03, referencia visual
// fornecida: dashboard estilo DATAV com regua de traco+ponto intercalados
// nas bordas). Puramente decorativo, SEMPRE visivel (nao depende de selecao
// — e moldura da tela, nao dado da aeronave), renderizado nas 2 bordas
// (esquerda/direita) do mapa.

const HALF_STEP = 17; // distancia entre 2 marcas consecutivas (grande OU pequena)
const TICK_WIDTH = 28;
const TICK_LENGTH = 20;
const MINI_TICK_LENGTH = 5;
// A marca de borda cresce pra DENTRO a partir da mesma borda externa fixa
// das outras marcas (centerX + TICK_LENGTH/2 = 24) — nao pode passar de 24,
// senao estoura o lado interno da regua (bug reportado pelo usuario,
// 2026-09-03: "esta saindo pra fora de seu limite", 2 causas ja corrigidas
// aqui: um valor > TICK_WIDTH, depois > essa borda interna).
const EDGE_TICK_LENGTH = 22;

interface AmilSideTicksProps {
  side: 'left' | 'right';
}

export default function AmilSideTicks({ side }: AmilSideTicksProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  const centerX = TICK_WIDTH / 2;

  // Sequencia UNICA alternando grande/pequena a cada HALF_STEP (nao mais um
  // par grande+pequena por "tile") — comeca sempre grande. Se sobrar uma
  // marca pequena pendurada no final, ela e descartada, pra sequencia
  // terminar numa marca GRANDE (pedido do usuario, 2026-09-03: "o ultimo
  // traco... deveria ser o maior... calcular a quantidade intercalada pra
  // que o ultimo seja dos grandes").
  const marks: { y: number; big: boolean }[] = [];
  let i = 0;
  for (let y = 8; y <= height - 8; y += HALF_STEP, i += 1) {
    marks.push({ y, big: i % 2 === 0 });
  }
  if (marks.length > 0 && !marks[marks.length - 1].big) {
    marks.pop();
  }

  return (
    <div className={`amil-side-ticks-frame amil-side-ticks-frame-${side}`} ref={frameRef}>
      <svg className={`amil-side-ticks amil-side-ticks-${side}`} aria-hidden="true">
        {marks.map((mark, index) => {
          // "Grande" edge (primeira/ultima marca grande da regua) fica
          // ainda maior que as grandes do meio (pedido do usuario,
          // 2026-09-03: "primeiro e ultimo traco devem ser maiores que
          // todos").
          const bigMarks = marks.filter((m) => m.big);
          const isEdgeBig = mark.big && (mark === bigMarks[0] || mark === bigMarks[bigMarks.length - 1]);
          const length = !mark.big ? MINI_TICK_LENGTH : isEdgeBig ? EDGE_TICK_LENGTH : TICK_LENGTH;
          const startX = side === 'left' ? centerX - TICK_LENGTH / 2 : centerX + TICK_LENGTH / 2 - length;
          const endX = startX + length;
          return (
            <line
              key={index}
              x1={startX}
              y1={mark.y}
              x2={endX}
              y2={mark.y}
              className={`amil-side-tick-line${mark.big ? '' : ' amil-side-tick-mini'}`}
            />
          );
        })}
      </svg>
    </div>
  );
}
