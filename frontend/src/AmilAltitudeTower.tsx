import { useMemo } from 'react';
import { altitudeColor } from './aircraft';

// Altimetro em fita vertical (R-25), estilo HUD sci-fi (referencia trazida
// pelo usuario, 2026-09-03: reticulo/torres de tick simetricas) + marcador
// central "de asas" emprestado do indicador de atitude classico de aviacao
// (2a referencia) — SO o glifo amarelo, sem o resto do instrumento (sem
// ceu/terra, sem inclinacao, pedido explicito: "mas so o dablio(W)").
//
// A altitude ATUAL fica sempre fixa no centro vertical da viewport, e os
// TICKS (nao a aeronave) e que se movem, deslizando pra cima/baixo conforme
// a altitude muda — mesma logica do arco/bussola, so que num eixo LINEAR
// (nao circular), entao sem trigonometria, so escala px-por-metro.
//
// Pousada = aparece TAMBEM, com altitude tratada como 0 (pedido do usuario,
// 2026-09-03: "deixe ela no zero, e a parte de baixo da torre tera valores
// negativos") — ADS-B nao manda altitude no chao (vem null), entao SEM esse
// fallback o altimetro sumiria toda vez que a aeronave pousa. A parte de
// baixo (abaixo de "0") mostra numeros negativos mesmo sem sentido fisico
// real, de proposito: e simetria visual da fita, nao uma medida real.
//
// Setas fixas + glifo movel (pedido do usuario, 2026-09-03): as 2 setas nas
// laterais ficam SEMPRE no centro (linha de referencia "nivelado"); o glifo
// de asas e quem se move — pra CIMA subindo, pra BAIXO descendo, alinhado
// as setas quando nivelado. Baseado na taxa vertical em M/S (nao graus, ver
// TrackedAircraft.verticalRate) — so a direcao/magnitude dela, saturando
// num deslocamento maximo em pixels (nao da pra converter m/s em angulo sem
// saber a velocidade horizontal, que nao e o propósito aqui).

const VIEWPORT_HEIGHT = 420;
const VIEWPORT_WIDTH = 170;
const CENTER_Y = VIEWPORT_HEIGHT / 2;
const CENTER_X = VIEWPORT_WIDTH / 2;
// Alcance visivel pra cada lado da altitude atual, e o espacamento dos
// ticks — 500m entre ticks maiores (com numero), 250m nos menores (so
// traco). Cobre uma faixa generosa (6.000m no total) sem ficar apertado.
const RANGE_M = 3000;
const MAJOR_STEP_M = 500;
const MINOR_STEP_M = 250;
const PX_PER_M = (VIEWPORT_HEIGHT / 2 / RANGE_M) * 0.92; // 0.92 = pequena folga pras pontas nao coincidirem exato com a borda

// Taxa vertical -> deslocamento do glifo. Faixa morta (nivelado) igual a do
// formatVerticalRate em aircraft.ts, pra bater com o que a topbar mostra em
// texto. Saturacao em 12 m/s (~2.360 ft/min, ja uma subida/descida bem
// forte) evita o glifo sair da viewport em taxas extremas.
const VRATE_DEADBAND_MS = 0.5;
const VRATE_SATURATION_MS = 12;
const GLYPH_MAX_OFFSET_PX = 46;

function yForAltitude(tickAltitude: number, currentAltitude: number): number {
  // Altitude MAIOR fica MAIS ACIMA na tela (y menor) — eixo Y do SVG cresce
  // pra baixo, entao o sinal e invertido.
  return CENTER_Y - (tickAltitude - currentAltitude) * PX_PER_M;
}

function glyphOffsetFor(verticalRate: number | null): number {
  if (verticalRate == null || Math.abs(verticalRate) < VRATE_DEADBAND_MS) return 0;
  const ratio = Math.min(Math.abs(verticalRate) / VRATE_SATURATION_MS, 1);
  // Subindo (verticalRate positivo) desloca pra CIMA -> y MENOR -> sinal negativo.
  const direction = verticalRate > 0 ? -1 : 1;
  return direction * ratio * GLYPH_MAX_OFFSET_PX;
}

interface AmilAltitudeTowerProps {
  altitude: number | null;
  verticalRate: number | null;
  onGround: boolean;
}

export default function AmilAltitudeTower({ altitude, verticalRate, onGround }: AmilAltitudeTowerProps) {
  // No chao, ADS-B nao manda altitude (vem null) — trata como 0 pra o
  // altimetro continuar aparecendo (pedido do usuario), em vez de sumir.
  // Fora do chao sem altitude nenhuma (dado realmente desconhecido) ainda
  // esconde, como antes.
  const effectiveAltitude = altitude ?? (onGround ? 0 : null);

  const ticks = useMemo(() => {
    if (effectiveAltitude == null) return [];
    const list: { value: number; y: number; isMajor: boolean }[] = [];
    // Comeca no multiplo de MINOR_STEP mais proximo abaixo do inicio da
    // faixa, pra sempre cair em numeros "redondos" (...,-500,0,500,...) —
    // nao depende de onde a altitude atual cai dentro do passo.
    const start = Math.floor((effectiveAltitude - RANGE_M) / MINOR_STEP_M) * MINOR_STEP_M;
    const end = effectiveAltitude + RANGE_M;
    for (let value = start; value <= end; value += MINOR_STEP_M) {
      const isMajor = value % MAJOR_STEP_M === 0;
      list.push({ value, y: yForAltitude(value, effectiveAltitude), isMajor });
    }
    return list;
  }, [effectiveAltitude]);

  if (effectiveAltitude == null) return null;

  const glyphY = CENTER_Y + glyphOffsetFor(verticalRate);

  return (
    <div className="amil-altitude-tower" aria-label="Altímetro">
      <svg
        className="amil-altitude-svg"
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
        aria-hidden="true"
      >
        {/* Eixo central vertical, so pra dar a sensacao de "trilho" por tras
            dos ticks — bem discreto. */}
        <line x1={CENTER_X} y1={0} x2={CENTER_X} y2={VIEWPORT_HEIGHT} className="amil-altitude-rail" />

        {ticks.map((t) => {
          const color = altitudeColor(t.value);
          const halfLen = t.isMajor ? 22 : 10;
          return (
            <g
              key={t.value}
              className="amil-altitude-tick"
              style={{ transform: `translateY(${t.y.toFixed(1)}px)`, color }}
            >
              <line x1={CENTER_X - halfLen} x2={CENTER_X + halfLen} y1={0} y2={0} />
              {t.isMajor && (
                <>
                  <text x={CENTER_X - halfLen - 6} y={4} textAnchor="end">
                    {t.value}
                  </text>
                  <text x={CENTER_X + halfLen + 6} y={4} textAnchor="start">
                    {t.value}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Setas de referencia FIXAS (pedido do usuario, 2026-09-03) — sempre
            no centro vertical, na MESMA linha onde o glifo ficava antes de
            virar movel. Marcam "nivelado"; o glifo abaixo delas = descendo,
            acima = subindo. */}
        <g className="amil-altitude-ref-arrows">
          <polygon points={`4,${CENTER_Y - 7} 18,${CENTER_Y} 4,${CENTER_Y + 7}`} />
          <polygon points={`${VIEWPORT_WIDTH - 4},${CENTER_Y - 7} ${VIEWPORT_WIDTH - 18},${CENTER_Y} ${VIEWPORT_WIDTH - 4},${CENTER_Y + 7}`} />
        </g>

        {/* Glifo "de asas" — MOVEL (pedido do usuario, 2026-09-03: acima
            subindo, abaixo descendo, centralizado nivelado), baseado na taxa
            vertical em m/s (nao ha angulo/graus disponivel). Transition no
            transform pra deslizar suave entre leituras, mesma tecnica dos
            ticks. */}
        <g
          className="amil-altitude-wings"
          style={{ transform: `translate(${CENTER_X}px, ${glyphY.toFixed(1)}px)` }}
        >
          <polyline points="-32,0 -12,0 -12,0 -5,0 0,7 5,0 12,0 12,0 32,0" />
        </g>
      </svg>
    </div>
  );
}
