import { AnimatePresence, motion } from 'motion/react';
import type { Mission, Vehicle } from './types';

// As 7 etapas da missao, na ordem em que acontecem.
//
// "statusField" e o campo de ESTADO da etapa na origem ("Iniciado" /
// "Confirmado" / "Nao Iniciado") — e o que diz ate onde a missao avancou.
// "timeField" so existe nas duas primeiras: a lista de origem NAO guarda
// carimbo de hora por etapa (confirmado no dado real, 2026-08-24). Nas outras
// cinco mostramos a etapa como cumprida, sem inventar horario — que era
// exatamente o vicio do mock que este componente tinha antes.
const STAGES: { label: string; statusField: keyof Mission; timeField?: keyof Mission }[] = [
  { label: 'Atribuiu', statusField: 'assignedAt', timeField: 'assignedAt' },
  { label: 'Aceitou', statusField: 'acceptanceStatus', timeField: 'acknowledgedAt' },
  { label: 'Desloc. Origem', statusField: 'departedToOriginStatus' },
  { label: 'Chegada Origem', statusField: 'arrivedAtOriginStatus' },
  { label: 'Desloc. Destino', statusField: 'departedToDestStatus' },
  { label: 'Chegada Destino', statusField: 'arrivedAtDestStatus' },
  { label: 'Finalizou', statusField: 'finishedStatus' },
];

// A origem usa mais de uma palavra pra "aconteceu" ("Iniciado" na maioria das
// etapas, "Confirmado" na de ciencia). Tratar pelo negativo e mais seguro que
// listar os positivos: qualquer valor preenchido que nao seja "Nao Iniciado"
// conta como cumprido.
function isStageDone(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false;
  return !/^n[ãa]o\s+iniciado$/i.test(value.trim());
}

function stageTimes(mission: Mission): (string | null)[] {
  return STAGES.map(({ timeField }) => {
    if (!timeField) return null;
    const value = mission[timeField];
    if (typeof value !== 'string' || value === '') return null;
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  });
}

// Versao flutuante, centralizada embaixo — so pro desktop. Tablet/mobile
// embutem <MissionTimelineContent orientation="vertical"> direto dentro da
// VehicleSidebar (ver la), sem essa animacao/posicionamento proprios.
export default function MissionTimeline({
  vehicle,
  mission,
}: {
  vehicle: Vehicle | null;
  mission: Mission | null;
}) {
  // Sem missao ativa nao ha linha do tempo: some, em vez de mostrar uma
  // barra vazia ou dado inventado (era o que o mock fazia).
  return (
    <div className="mission-timeline-wrap">
      <AnimatePresence>
        {vehicle && mission && (
          <motion.div
            key={vehicle.id}
            className="mission-timeline"
            // x fixo (mesmo valor nos 3 estados) so pra manter a
            // centralizacao (left:50% + translateX(-50%)) enquanto o Motion
            // anima y — Motion controla a propriedade "transform" inteira,
            // entao precisa declarar os dois eixos juntos, nao da pra
            // combinar com um transform:translateX estatico via CSS puro.
            initial={{ x: '-50%', y: '100%', opacity: 0 }}
            animate={{ x: '-50%', y: 0, opacity: 1 }}
            exit={{ x: '-50%', y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <MissionTimelineContent vehicle={vehicle} mission={mission} orientation="horizontal" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MissionTimelineContent({
  vehicle,
  mission,
  orientation,
}: {
  vehicle: Vehicle;
  mission: Mission | null;
  orientation: 'horizontal' | 'vertical';
}) {
  if (!mission) {
    return (
      <div className="text-body-sm-regular font-body" style={{ color: 'var(--color-gray-400)', padding: '8px 0' }}>
        Esta ambulância não está em missão no momento.
      </div>
    );
  }

  const times = stageTimes(mission);
  // A etapa atual e a ULTIMA cumprida, nao a contagem de cumpridas: se uma
  // etapa do meio vier em branco na origem (acontece), contar quebraria o
  // alinhamento entre bolinha e rotulo.
  const currentStageIndex = STAGES.reduce(
    (last, { statusField }, i) => (isStageDone(mission[statusField]) ? i : last),
    -1,
  );
  // Local real vem de Regulation (f_Regulação_chamados) — Mission.
  // originAddress/destinationAddress equivalente sempre vem vazio na
  // origem, entao ate hoje o cabecalho usava o texto de status como
  // substituto. Sem regulacao sincronizada ainda (recem-criada, ou fora da
  // janela de sync), cai no mesmo fallback de antes.
  const origin = mission.regulation?.originName;
  const destination = mission.regulation?.destinationName;
  const headline =
    origin && destination
      ? `${origin} → ${destination}`
      : mission.shortStatusText ?? mission.currentStatusText ?? 'Missão em andamento';

  if (orientation === 'vertical') {
    return (
      <div className="mission-timeline-v">
        <div className="mission-timeline-v-header text-body-sm-regular font-body">
          <span className="mission-timeline-address" title={mission.currentStatusText ?? undefined}>
            {headline}
          </span>
          <span className="mission-timeline-address">Chamado {mission.callId}</span>
        </div>
        {STAGES.map(({ label }, i) => (
          <div key={label} className="mission-timeline-v-row">
            <div className="mission-timeline-v-track">
              <span
                className={`mission-timeline-dot${i <= currentStageIndex ? ' is-done' : ''}${
                  i === currentStageIndex ? ' is-current' : ''
                }`}
              />
              {i < STAGES.length - 1 && (
                <span className={`mission-timeline-v-connector${i < currentStageIndex ? ' is-done' : ''}`} />
              )}
            </div>
            <div className="mission-timeline-v-text">
              <div
                className={`mission-timeline-stage-label text-body-sm-semibold font-body${
                  i <= currentStageIndex ? ' is-done' : ''
                }`}
              >
                {label}
              </div>
              <div className="mission-timeline-stage-time text-body-sm-regular font-body">{times[i] ?? '—'}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // horizontal (desktop) — grid de colunas iguais, linha comeca/termina no
  // centro do 1o/ultimo ponto (nao na borda do container).
  const gridStyle = { gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` };
  const halfColumnPct = 100 / (STAGES.length * 2);
  const trackSpanPct = 100 - halfColumnPct * 2;
  const fillWidthPct = trackSpanPct * Math.max(0, currentStageIndex / (STAGES.length - 1));

  return (
    <>
      <div className="mission-timeline-header text-body-sm-regular font-body">
        <span className="mission-timeline-address" title={mission.currentStatusText ?? undefined}>
          {headline}
        </span>
        <span className="mission-timeline-vehicle text-body-sm-semibold font-body">{vehicle.name}</span>
        <span className="mission-timeline-address">
          Chamado {mission.callId}
        </span>
      </div>

      <div className="mission-timeline-track" style={gridStyle}>
        <span
          className="mission-timeline-track-base"
          style={{ left: `${halfColumnPct}%`, right: `${halfColumnPct}%` }}
        />
        <span
          className="mission-timeline-track-fill"
          style={{ left: `${halfColumnPct}%`, width: `${fillWidthPct}%` }}
        />
        {STAGES.map((_, i) => (
          <span
            key={i}
            className={`mission-timeline-dot${i <= currentStageIndex ? ' is-done' : ''}${
              i === currentStageIndex ? ' is-current' : ''
            }`}
          />
        ))}
      </div>

      <div className="mission-timeline-labels" style={gridStyle}>
        {STAGES.map(({ label }, i) => (
          <div key={label} className="mission-timeline-stage">
            <div
              className={`mission-timeline-stage-label text-body-sm-semibold font-body${
                i <= currentStageIndex ? ' is-done' : ''
              }`}
            >
              {label}
            </div>
            <div className="mission-timeline-stage-time text-body-sm-regular font-body">{times[i] ?? '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
