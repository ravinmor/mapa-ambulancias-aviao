import type { Aircraft } from './types';
import type { Breakpoint } from './useBreakpoint';
import SidebarShell from './SidebarShell';
import {
  aircraftName,
  altitudeColor,
  formatAltitude,
  formatTrack,
  formatVelocity,
  formatVerticalRate,
} from './aircraft';

// Conteudo da sidebar da aeronave. Usa a mesma SidebarShell da van (animacao,
// bottom sheet, botao de fechar) — o que muda sao os campos, que aqui sao
// grandezas de voo em vez de cadastro de veiculo.
//
// Sem abas, de proposito: a van tem uma segunda secao real (a linha do tempo
// da missao) e a aeronave nao tem equivalente — abrir uma aba "Trajeto" vazia
// so pra simetria seria pior que nao ter aba nenhuma.

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

const REGION_LABEL: Record<string, string> = {
  SP: 'São Paulo',
  RJ: 'Rio de Janeiro',
};

interface Field {
  label: string;
  value: string;
}

function buildFields(aircraft: Aircraft): Field[] {
  return [
    { label: 'Altitude', value: formatAltitude(aircraft.altitude) },
    { label: 'Velocidade', value: formatVelocity(aircraft.velocity) },
    { label: 'Razão de subida', value: formatVerticalRate(aircraft.verticalRate) },
    { label: 'Rumo', value: formatTrack(aircraft.trueTrack) },
    { label: 'País de registro', value: aircraft.originCountry ?? '—' },
    { label: 'Código ICAO 24-bit', value: aircraft.icao24.toUpperCase() },
    { label: 'Transponder (squawk)', value: aircraft.squawk ?? '—' },
    { label: 'Região', value: aircraft.region ? REGION_LABEL[aircraft.region] ?? aircraft.region : '—' },
    { label: 'Em solo', value: aircraft.onGround ? 'Sim' : 'Não' },
    {
      label: 'Posição atual',
      value:
        aircraft.latitude != null && aircraft.longitude != null
          ? `${aircraft.latitude.toFixed(5)}, ${aircraft.longitude.toFixed(5)}`
          : '—',
    },
    { label: 'Posição registrada em', value: formatDate(aircraft.positionAt) },
  ];
}

function AircraftHeader({
  aircraft,
  onNext,
  hasMultiple,
}: {
  aircraft: Aircraft;
  onNext?: () => void;
  hasMultiple?: boolean;
}) {
  const color = altitudeColor(aircraft.altitude);

  return (
    <>
      <h2 className="text-h4 font-heading" style={{ margin: '0 0 4px', color: 'var(--color-primary-500)' }}>
        {aircraftName(aircraft)}
      </h2>
      <div className="text-body-sm-regular font-body" style={{ color: 'var(--color-gray-400)', marginBottom: 12 }}>
        {aircraft.originCountry ?? 'Origem desconhecida'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        {/* Mesmo chip da van, mas o ponto colorido aqui codifica ALTITUDE
            (gradiente continuo), nao status — e por isso que o texto ao lado
            e a altitude, nao um rotulo de estado. */}
        <div
          className="text-body-sm-semibold font-body"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: `color-mix(in srgb, ${color} 18%, var(--color-secondary-700))`,
            borderRadius: 8,
            padding: '4px 12px',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }}
          />
          {formatAltitude(aircraft.altitude)}
        </div>

        {hasMultiple && onNext && (
          <button onClick={onNext} className="sidebar-next-btn text-body-sm-semibold font-body" aria-label="Ver próxima aeronave">
            Próxima aeronave
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </>
  );
}

function AircraftFields({ aircraft }: { aircraft: Aircraft }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {buildFields(aircraft).map((field) => (
        <div key={field.label}>
          <dt
            className="text-body-sm-semibold font-body"
            style={{ textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--color-gray-400)' }}
          >
            {field.label}
          </dt>
          <dd className="text-body-sm-regular font-body" style={{ margin: '2px 0 0' }}>
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AircraftSidebar({
  aircraft,
  onClose,
  onNext,
  hasMultiple,
  breakpoint,
}: {
  aircraft: Aircraft | null;
  onClose: () => void;
  onNext: () => void;
  hasMultiple: boolean;
  breakpoint: Breakpoint;
}) {
  return (
    <SidebarShell
      entityKey={aircraft?.id ?? null}
      breakpoint={breakpoint}
      onClose={onClose}
      header={aircraft && <AircraftHeader aircraft={aircraft} onNext={onNext} hasMultiple={hasMultiple} />}
      body={aircraft && <AircraftFields aircraft={aircraft} />}
    />
  );
}
