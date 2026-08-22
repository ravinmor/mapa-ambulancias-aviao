import { AnimatePresence, motion } from 'motion/react';
import type { Vehicle } from './types';

const STAGES = ['Atribuiu', 'Aceitou', 'Desloc. Origem', 'Chegada Origem', 'Desloc. Destino', 'Chegada Destino'];

// MOCK — nao existe dado real de "missao/chamado" no nosso schema ainda (ver
// DECISOES_Infra_MapaAmbulancias.md). Gera uma progressao plausivel so a
// partir do status atual da van, so pra validar o layout. Trocar pelos
// timestamps reais quando o "chamado" do SharePoint for mapeado.
function mockStageTimes(vehicle: Vehicle): (string | null)[] {
  const now = Date.now();
  const stagesReached = vehicle.status === 'IN_SERVICE' ? 4 : vehicle.status === 'AVAILABLE' ? 6 : 2;
  return STAGES.map((_, i) => {
    if (i >= stagesReached) return null;
    const minutesAgo = (stagesReached - i) * 12;
    return new Date(now - minutesAgo * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  });
}

const MOCK_ORIGIN = 'Base Central';
const MOCK_DESTINATION = 'Hospital São Luiz';

// Versao flutuante, centralizada embaixo — so pro desktop. Tablet/mobile
// embutem <MissionTimelineContent orientation="vertical"> direto dentro da
// VehicleSidebar (ver la), sem essa animacao/posicionamento proprios.
export default function MissionTimeline({ vehicle }: { vehicle: Vehicle | null }) {
  return (
    <div className="mission-timeline-wrap">
      <AnimatePresence>
        {vehicle && (
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
            <MissionTimelineContent vehicle={vehicle} orientation="horizontal" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MissionTimelineContent({
  vehicle,
  orientation,
}: {
  vehicle: Vehicle;
  orientation: 'horizontal' | 'vertical';
}) {
  const times = mockStageTimes(vehicle);
  const currentStageIndex = times.filter((t) => t != null).length - 1;

  if (orientation === 'vertical') {
    return (
      <div className="mission-timeline-v">
        <div className="mission-timeline-v-header text-body-sm-regular font-body">
          <span className="mission-timeline-address">{MOCK_ORIGIN}</span>
          <span className="mission-timeline-address">→ {MOCK_DESTINATION}</span>
        </div>
        {STAGES.map((label, i) => (
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
        <span className="mission-timeline-address">{MOCK_ORIGIN}</span>
        <span className="mission-timeline-vehicle text-body-sm-semibold font-body">{vehicle.name}</span>
        <span className="mission-timeline-address">{MOCK_DESTINATION}</span>
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
        {STAGES.map((label, i) => (
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
