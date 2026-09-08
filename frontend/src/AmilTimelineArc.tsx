import { useMemo } from 'react';
import { STAGE_SEQUENCE, STAGE_LABELS, type Stage } from './trackedAircraft';

// Linha do tempo em arco, no estilo do telemetry de lancamento da SpaceX
// (referencia trazida pelo usuario, 2026-09-01): faixa horizontal com fade
// nas duas bordas, um arco desenhado com um marcador por estagio, e o
// estagio atual sempre centralizado sob um indicador fixo. SEM contador de
// T+/- (pedido explicito). O texto grande do estagio + codigo da aeronave
// (".amil-arc-readout") que ficava embaixo foi REMOVIDO (pedido do usuario,
// 2026-09-03) — o nome do estagio atual ja fica visivel no proprio arco
// (marcador destacado + label), nao precisa repetir embaixo.
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
//
// BUSSOLA (R-24, pedido do usuario 2026-09-03): um 2o anel, MESMA tecnica
// de circulo-de-verdade, DENTRO do mesmo SVG/viewport/mascara de fade do
// arco de estagios — de proposito, ao contrario do fundo (AmilArcBackdrop),
// que precisou virar componente SEPARADO justamente pra ESCAPAR dessa
// mascara. Aqui e o oposto: a bussola deve dissolver nas bordas igual o
// arco de cima, entao compartilhar o mask-image e o comportamento certo,
// nao um bug a evitar. Raio BEM menor (COMPASS_RADIUS vs RADIUS) — anel
// mais fechado/curvado, lendo como "anel interno" por baixo do de cima
// (pedido literal do usuario: "anel interno dentro/embaixo da linha do
// tempo"). O anel gira com o RUMO real (trueTrack), nao com indice de
// estagio — o icone da aeronave fica fixo (nao existe aqui, e so o anel de
// graus) e os graus e que se movem por baixo dele, mesma logica do arco de
// cima.
// Diamante: um unico indicador entre os dois aneis, na mesma linha vertical
// central (os dois apex sempre ficam no mesmo X) — ponta de cima toca o
// apex do arco de estagios, ponta de baixo toca o apex da bussola. Pedido
// literal do usuario: "um indicador em formato de diamante que vai apontar
// pra cima (linha do tempo) e pra baixo (bussola)".

// Escala geral do widget (pedido do usuario, 2026-09-02: "um pouco menor") —
// 0.8 = 80% do tamanho original. Um numero so pra encolher tudo junto
// (viewport, raio, SVG) sem perder as proporcoes entre eles.
const SCALE = 0.8;
// Altura total aumentou (era so o arco de estagios, 200*SCALE=160) pra
// caber o 2o anel (bussola) por baixo, dentro do MESMO viewport/mascara.
const ARC_HEIGHT = 320 * SCALE;
const VIEWPORT_WIDTH = 760 * SCALE;

// --- Arco de ESTAGIOS (topo) ---
// Raio do circulo e espacamento angular entre estagios vizinhos — os dois
// juntos controlam tanto a curvatura (raio menor = mais curvo) quanto a
// distancia horizontal entre os pontos (~190px entre vizinhos perto do
// topo, equivalente ao espacamento usado antes).
//
// PARAMETRO PRA AJUSTAR A CURVATURA (pedido do usuario, 2026-09-03: "linha
// do tempo com curvatura similar a bussola, tem algum parametro pra alterar
// aos poucos") — e este RADIUS aqui. Numero MENOR = curva MAIS fechada
// (mais parecida com a bussola, COMPASS_RADIUS=256); numero MAIOR = curva
// mais suave/achatada. Era 780*SCALE=624 (bem mais achatada que a bussola);
// baixei pra 500*SCALE=400 como 1a tentativa — mais curvo, mas ainda ACIMA
// de VIEWPORT_WIDTH/2 (304px). Esse minimo importa: abaixo dele o circulo
// matematicamente nao alcanca mais as duas bordas da viewport (mesma
// situacao que a bussola esta hoje, onde sobra um respiro sem conteudo nas
// pontas, disfarcado pelo fade) — pra deixar AINDA mais curvo que 400,
// da pra continuar baixando, so ter em mente esse piso de ~304.
const RADIUS = 500 * SCALE;
const ANGLE_STEP = (14 * Math.PI) / 180;
// Y do estagio ATUAL (topo do circulo de estagios, theta=0) dentro do
// viewBox. Deslocado pra cima (nao mais a metade do ARC_HEIGHT) pra abrir
// espaco pra bussola embaixo dele, dentro da mesma altura total.
const TIMELINE_APEX_Y = 75 * SCALE;
// A viewport (608px) enxerga ate mais ou menos +-49 graus de cada lado do
// estagio atual (asin((608/2)/RADIUS), RADIUS=400 — subiu de +-29 graus
// quando RADIUS era 624). O traco da linha vai bem alem disso, ate
// PATH_RANGE, de proposito — pedido do usuario (2026-09-02): o arco NUNCA
// pode "acabar" visivelmente dentro da viewport, ele tem que sempre
// continuar ate sumir no fade da borda, mesmo quando o estagio atual e o
// primeiro ou o ultimo da sequencia (sem estagio real daquele lado). Segue
// o mesmo ~21 graus de folga de antes, so recalculado em cima do novo
// angulo visivel (SE RADIUS mudar de novo, reconferir esse numero tambem).
const PATH_RANGE = (70 * Math.PI) / 180;

// --- Anel da BUSSOLA (embaixo, R-24) ---
// Raio bem menor que o do arco de estagios — curva mais fechada, o "anel
// interno" pedido. Precisa ser > metade da VIEWPORT_WIDTH (304) pra o
// circulo alcancar as 2 bordas da viewport; a diferenca pra esse minimo
// controla o quanto de rumo (graus) fica visivel de cada lado.
const COMPASS_RADIUS = 320 * SCALE;
// Mais perto do apex do arco de estagios (era 245*SCALE=196, vao de 136px) —
// pedido do usuario, 2026-09-03: "a linha do tempo e a bussola estao muito
// longes, devem estar mais proximas". Vao novo: 80px (TIMELINE_APEX_Y=60).
const COMPASS_APEX_Y = 140;
// Meia-largura angular realmente visivel na viewport (usada so pra decidir
// quais ticks vale a pena calcular — o corte visual de verdade e o overflow
// hidden + mask-image da viewport, isso aqui e so economia de trabalho).
const COMPASS_VISIBLE_HALF_ANGLE = Math.asin(Math.min(1, VIEWPORT_WIDTH / 2 / COMPASS_RADIUS));
const COMPASS_PATH_RANGE = COMPASS_VISIBLE_HALF_ANGLE + (18 * Math.PI) / 180;
// Ticks finos a cada 15 graus (marca visual, sem texto nenhum). Numero do
// grau (com o simbolo °) continua embaixo a cada 30 — pedido do usuario,
// 2026-09-03: "tirou os numeros dos graus, deve manter com o simbolo de
// grau junto" (correcao: as letras de cardeal/colateral eram PRA SOMAR aos
// numeros, nao substituir). Letra (cardeal OU colateral) fica ACIMA a cada
// 45 graus — os dois grids nao coincidem sempre (45/135/225/315 nao caem no
// grid de 30), entao um tick pode ter so numero, so letra, os dois, ou nada.
const COMPASS_TICK_STEP_DEG = 15;
const COMPASS_NUMBER_STEP_DEG = 30;
const COMPASS_LABELED_STEP_DEG = 45;
const COMPASS_CARDINALS: Record<number, string> = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' };
const COMPASS_COLLATERALS: Record<number, string> = { 45: 'NE', 135: 'SE', 225: 'SO', 315: 'NO' };

// SVG bem mais largo que a viewport visivel: pontos distantes do centro
// (angulo grande) acabam bem fora do centro — o overflow:hidden do
// container pai (.amil-arc-viewport) e quem esconde o que sai da faixa
// visivel, entao o SVG so precisa ser grande o suficiente pra nunca cortar
// um ponto que ainda deveria estar entrando/saindo pelo fade.
const SVG_WIDTH = 2400 * SCALE;
const SVG_CENTER_X = SVG_WIDTH / 2;

function circlePointAt(apexY: number, radius: number, theta: number): { x: number; y: number } {
  return {
    x: SVG_CENTER_X + radius * Math.sin(theta),
    // theta=0 fica exatamente em apexY — o topo DESSE circulo especifico.
    // Afastando dali (theta cresce em modulo), cos(theta) cai abaixo de 1 e
    // o ponto desce, curvando pra baixo dos dois lados.
    y: apexY + radius * (1 - Math.cos(theta)),
  };
}

// Amostra um circulo (apexY/radius proprios) entre 2 angulos e devolve o
// "d" de um <path> SVG — usado tanto pro arco de estagios quanto pro anel
// da bussola, cada um com seu proprio apex/raio.
function buildArcPath(apexY: number, radius: number, thetaStart: number, thetaEnd: number): string {
  const SEGMENTS = 32;
  const step = (thetaEnd - thetaStart) / SEGMENTS;
  const parts: string[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const { x, y } = circlePointAt(apexY, radius, thetaStart + step * i);
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

// Os 2 trechos da linha de estagios sao SEMPRE relativos ao estagio atual
// (theta=0), e por isso NUNCA mudam de forma quando o estagio muda — so os
// pontos (que carregam o angulo de cada estagio dentro da sequencia real)
// se movem por cima deles. Por isso da pra calcular uma vez so, fora do
// componente.
const PATH_PAST_D = buildArcPath(TIMELINE_APEX_Y, RADIUS, -PATH_RANGE, 0);
const PATH_FUTURE_D = buildArcPath(TIMELINE_APEX_Y, RADIUS, 0, PATH_RANGE);
// O anel da bussola e um circulo cheio (nao "percorrido vs futuro" como o
// de estagios) — sempre a mesma curva, so os TICKS que se movem em cima
// dela conforme o rumo muda.
const COMPASS_PATH_D = buildArcPath(COMPASS_APEX_Y, COMPASS_RADIUS, -COMPASS_PATH_RANGE, COMPASS_PATH_RANGE);

// Normaliza uma diferenca de angulos pro intervalo (-180, 180] — sem isso,
// ir de rumo 350 pra 10 (uma guinada de so 20 graus) apareceria como uma
// volta de quase 340 graus pro lado errado.
function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

// Diamante entre os 2 aneis, centralizado no meio do vao. Altura mantida do
// ajuste anterior (usuario confirmou: "o tamanho vertical esta bom"); LARGURA
// aumentada — a versao anterior (20% escalado nos 2 eixos) ficou fina demais
// e leu como um risco/linha, nao um losango de verdade (pedido do usuario,
// 2026-09-03: "precisa ser um diamante mesmo"). Razao largura:altura ~0.55,
// proporcao que ainda le como diamante sem ficar um quadrado.
const DIAMOND_MID_Y = (TIMELINE_APEX_Y + COMPASS_APEX_Y) / 2;
const DIAMOND_HALF_HEIGHT = 10;
const DIAMOND_HALF_WIDTH = DIAMOND_HALF_HEIGHT * 0.55;

interface AmilTimelineArcProps {
  stage: Stage | null;
  // Rumo (graus, 0-360) da aeronave selecionada — null enquanto nao ha
  // selecao ou nao ha dado ainda; o anel so e desenhado quando existe.
  heading: number | null;
}

export default function AmilTimelineArc({ stage, heading }: AmilTimelineArcProps) {
  const currentIndex = stage ? STAGE_SEQUENCE.indexOf(stage) : 0;

  const stagePoints = useMemo(
    () =>
      STAGE_SEQUENCE.map((s, i) => {
        const theta = (i - currentIndex) * ANGLE_STEP;
        return { stage: s, theta, ...circlePointAt(TIMELINE_APEX_Y, RADIUS, theta) };
      }),
    [currentIndex]
  );

  const compassTicks = useMemo(() => {
    if (heading == null) return [];
    const list: { deg: number; theta: number; x: number; y: number }[] = [];
    for (let deg = 0; deg < 360; deg += COMPASS_TICK_STEP_DEG) {
      const delta = normalizeDeg(deg - heading);
      const theta = (delta * Math.PI) / 180;
      if (Math.abs(theta) > COMPASS_PATH_RANGE) continue;
      list.push({ deg, theta, ...circlePointAt(COMPASS_APEX_Y, COMPASS_RADIUS, theta) });
    }
    return list;
  }, [heading]);

  return (
    <div className="amil-arc" aria-label="Linha do tempo do voo e bussola">
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
          {stagePoints.map((p, i) => {
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

          {/* Bussola (R-24) — so existe com aeronave selecionada e rumo
              conhecido. Anel + ticks, sem "percorrido/futuro" (nao ha
              conceito de passado/futuro num rumo). */}
          {heading != null && (
            <>
              <path d={COMPASS_PATH_D} className="amil-compass-ring" />
              {compassTicks.map((t) => {
                const isNumbered = t.deg % COMPASS_NUMBER_STEP_DEG === 0;
                const isLabeled = t.deg % COMPASS_LABELED_STEP_DEG === 0;
                const cardinal = COMPASS_CARDINALS[t.deg];
                const collateral = COMPASS_COLLATERALS[t.deg];
                const letter = cardinal ?? collateral;
                const isMajorTick = isNumbered || isLabeled;
                return (
                  <g
                    key={t.deg}
                    className="amil-compass-tick"
                    style={{ transform: `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)` }}
                  >
                    {/* Tick aponta pra FORA do anel (marca o aro) — numero
                        do grau continua embaixo dele, letra de
                        cardeal/colateral (quando existe) fica ACIMA, do
                        outro lado (pedido do usuario, 2026-09-03). */}
                    <line
                      x1={0}
                      x2={0}
                      y1={0}
                      y2={(isMajorTick ? 12 : 6) * SCALE}
                      className={`amil-compass-tick-line${isMajorTick ? ' is-major' : ''}${cardinal ? ' is-cardinal' : ''}`}
                    />
                    {isNumbered && (
                      <text
                        x={0}
                        y={12 * SCALE + 16 * SCALE}
                        textAnchor="middle"
                        className="amil-compass-deg-label"
                      >
                        {t.deg}°
                      </text>
                    )}
                    {letter && (
                      <text
                        x={0}
                        y={(cardinal ? -18 : -13) * SCALE}
                        textAnchor="middle"
                        className={`amil-compass-label${cardinal ? ' is-cardinal' : ' is-collateral'}`}
                      >
                        {letter}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Diamante entre os 2 aneis — ponta de cima aponta pro apex
                  do arco de estagios, ponta de baixo aponta pro apex da
                  bussola (pedido literal do usuario). Sempre no centro
                  horizontal (SVG_CENTER_X), porque theta=0 dos 2 aneis cai
                  sempre no mesmo X. Tamanho reduzido — ver
                  DIAMOND_HALF_HEIGHT/WIDTH acima. */}
              <polygon
                points={`${SVG_CENTER_X},${DIAMOND_MID_Y - DIAMOND_HALF_HEIGHT} ${SVG_CENTER_X + DIAMOND_HALF_WIDTH},${DIAMOND_MID_Y} ${SVG_CENTER_X},${DIAMOND_MID_Y + DIAMOND_HALF_HEIGHT} ${SVG_CENTER_X - DIAMOND_HALF_WIDTH},${DIAMOND_MID_Y}`}
                className="amil-arc-diamond"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
