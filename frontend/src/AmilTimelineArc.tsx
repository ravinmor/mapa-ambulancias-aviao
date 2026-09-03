import { useMemo } from 'react';
import { STAGE_SEQUENCE, STAGE_LABELS, type Stage } from './trackedAircraft';

// Linha do tempo em arco, no estilo do telemetry de lancamento da SpaceX
// (referencia trazida pelo usuario, 2026-09-01): faixa horizontal com fade
// nas duas bordas, um arco desenhado com um marcador por estagio, e o
// estagio atual sempre centralizado sob um indicador fixo. SEM contador de
// T+/- (pedido explicito) — o espaco onde ficaria o contador mostra o nome
// do estagio atual.
//
// A curva e um CIRCULO DE VERDADE (correcao pedida pelo usuario,
// 2026-09-02), nao uma parabola — o viewport mostra so a fatia de perto do
// topo dele, como o horizonte de um planeta bem grande; a parte de baixo do
// circulo nunca aparece. Cada estagio ocupa um angulo FIXO ao redor do
// centro do circulo, espacado igualmente (ANGLE_STEP); o estagio atual e
// sempre o angulo 0 (topo). Trocar de estagio muda o angulo de TODOS os
// pontos ao mesmo tempo, o que da exatamente o efeito de "circulo girando"
// pedido — nao e mais um deslize horizontal (translateX de uma faixa), e
// sim uma rotacao de verdade em torno do centro do circulo.

// Escala geral do widget (pedido do usuario, 2026-09-02: "um pouco menor") —
// 0.8 = 80% do tamanho original. Um numero so pra encolher tudo junto
// (viewport, raio, SVG) sem perder as proporcoes entre eles.
const SCALE = 0.8;
const ARC_HEIGHT = 200 * SCALE;
const VIEWPORT_WIDTH = 760 * SCALE;
// Raio do circulo e espacamento angular entre estagios vizinhos — os dois
// juntos controlam tanto a curvatura (raio menor = mais curvo) quanto a
// distancia horizontal entre os pontos (~190px entre vizinhos perto do
// topo, equivalente ao espacamento usado antes).
const RADIUS = 780 * SCALE;
const ANGLE_STEP = (14 * Math.PI) / 180;
// Y do estagio ATUAL (o topo do circulo, theta=0) dentro do viewBox — TEM
// que ser exatamente a metade de ARC_HEIGHT, pra ficar centralizado
// verticalmente na viewport (.amil-arc-viewport).
const APEX_Y = ARC_HEIGHT / 2;
// SVG bem mais largo que a viewport visivel: pontos de estagios distantes do
// atual (angulo grande) acabam bem fora do centro — o overflow:hidden do
// container pai (.amil-arc-viewport) e quem esconde o que sai da faixa
// visivel, entao o SVG so precisa ser grande o suficiente pra nunca cortar
// um ponto que ainda deveria estar entrando/saindo pelo fade.
const SVG_WIDTH = 2400 * SCALE;
const SVG_CENTER_X = SVG_WIDTH / 2;

// A viewport (760px) enxerga ate mais ou menos +-29 graus de cada lado do
// estagio atual (asin((760/2)/RADIUS)). O traco da linha vai bem alem
// disso, ate PATH_RANGE, de proposito — pedido do usuario (2026-09-02): o
// arco NUNCA pode "acabar" visivelmente dentro da viewport, ele tem que
// sempre continuar ate sumir no fade da borda, mesmo quando o estagio atual
// e o primeiro ou o ultimo da sequencia (sem estagio real daquele lado).
const PATH_RANGE = (50 * Math.PI) / 180;

function circlePoint(theta: number): { x: number; y: number } {
  return {
    x: SVG_CENTER_X + RADIUS * Math.sin(theta),
    // theta=0 (estagio atual) fica exatamente em APEX_Y — o topo do
    // circulo. Afastando dali (theta cresce em modulo), cos(theta) cai
    // abaixo de 1 e o ponto desce, curvando pra baixo dos dois lados.
    y: APEX_Y + RADIUS * (1 - Math.cos(theta)),
  };
}

// Amostra o circulo entre 2 angulos e devolve o "d" de um <path> SVG — usado
// pros 2 trechos da linha (percorrido/futuro, ver pathPastD/pathFutureD).
function buildArcPath(thetaStart: number, thetaEnd: number): string {
  const SEGMENTS = 32;
  const step = (thetaEnd - thetaStart) / SEGMENTS;
  const parts: string[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const { x, y } = circlePoint(thetaStart + step * i);
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

// Os 2 trechos da linha sao SEMPRE relativos ao estagio atual (theta=0), e
// por isso NUNCA mudam de forma quando o estagio muda — so os pontos (que
// carregam o angulo de cada estagio dentro da sequencia real) se movem por
// cima deles. Por isso da pra calcular uma vez so, fora do componente.
const PATH_PAST_D = buildArcPath(-PATH_RANGE, 0);
const PATH_FUTURE_D = buildArcPath(0, PATH_RANGE);

interface AmilTimelineArcProps {
  stage: Stage | null;
  aircraftLabel: string;
}

export default function AmilTimelineArc({ stage, aircraftLabel }: AmilTimelineArcProps) {
  const currentIndex = stage ? STAGE_SEQUENCE.indexOf(stage) : 0;

  const points = useMemo(
    () =>
      STAGE_SEQUENCE.map((s, i) => {
        const theta = (i - currentIndex) * ANGLE_STEP;
        return { stage: s, theta, ...circlePoint(theta) };
      }),
    [currentIndex]
  );

  return (
    <div className="amil-arc" aria-label="Linha do tempo do voo">
      <div className="amil-arc-viewport">
        <svg
          className="amil-arc-svg"
          width={SVG_WIDTH}
          height={ARC_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${ARC_HEIGHT}`}
          style={{ left: VIEWPORT_WIDTH / 2 - SVG_CENTER_X, overflow: 'hidden' }}
          aria-hidden="true"
        >
          {/* Percorrido (ate o estagio atual, inclusive) em azul; o resto,
              esmaecido — pedido do usuario (2026-09-02). Os 2 trechos sao
              fixos (PATH_PAST_D/PATH_FUTURE_D, ver acima), entao so
              precisam ser desenhados, nao recalculados aqui. */}
          <path d={PATH_PAST_D} className="amil-arc-path-past" />
          <path d={PATH_FUTURE_D} className="amil-arc-path-future" />
          {points.map((p, i) => {
            const isCurrent = i === currentIndex;
            const isPast = i < currentIndex;
            const labelAbove = i % 2 === 0;
            return (
              <g
                key={p.stage}
                className="amil-arc-node"
                style={{ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }}
              >
                <circle
                  r={(isCurrent ? 7 : 4.5) * SCALE}
                  className={`amil-arc-dot${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}
                />
                <text
                  x={0}
                  y={(labelAbove ? -18 : 28) * SCALE}
                  textAnchor="middle"
                  className={`amil-arc-label${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}
                >
                  {STAGE_LABELS[p.stage]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="amil-arc-readout">
        <strong>{stage ? STAGE_LABELS[stage] : 'Aguardando sinal'}</strong>
        <small>{aircraftLabel}</small>
      </div>
    </div>
  );
}
