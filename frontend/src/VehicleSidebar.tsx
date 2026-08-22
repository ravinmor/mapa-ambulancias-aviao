import type { Vehicle } from './types';
import type { Breakpoint } from './useBreakpoint';
import { MissionTimelineContent } from './MissionTimeline';
import SidebarShell from './SidebarShell';
import { statusLabel, statusColorVar } from './vehicleStatus';

// So o CONTEUDO da sidebar da van. A casca (animacao, bottom sheet
// arrastavel, botao de fechar, barra de abas) foi pra SidebarShell, que a
// aeronave tambem usa — ver AircraftSidebar.

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

interface Field {
  label: string;
  value: string;
}

function buildFields(vehicle: Vehicle): Field[] {
  return [
    { label: 'Placa', value: vehicle.licensePlate ?? '—' },
    { label: 'Tipo de veículo', value: vehicle.vehicleType ?? '—' },
    { label: 'Estado', value: vehicle.state ?? '—' },
    { label: 'Status de atividade', value: vehicle.activityStatus ?? '—' },
    { label: 'Status de atribuição', value: vehicle.assignmentStatus ?? '—' },
    { label: 'E-mail do tablet', value: vehicle.tabletEmail ?? '—' },
    { label: 'Status alterado em', value: formatDate(vehicle.statusChangedAt) },
    {
      label: 'Posição atual',
      value:
        vehicle.latitude != null && vehicle.longitude != null
          ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`
          : '—',
    },
    { label: 'Posição registrada em', value: formatDate(vehicle.positionAt) },
    { label: 'Atualizado em', value: formatDate(vehicle.updatedAt) },
  ];
}

function VehicleHeader({
  vehicle,
  onNext,
  hasMultipleVehicles,
}: {
  vehicle: Vehicle;
  onNext?: () => void;
  hasMultipleVehicles?: boolean;
}) {
  return (
    <>
      <h2 className="text-h4 font-heading" style={{ margin: '0 0 4px', color: 'var(--color-primary-500)' }}>
        {vehicle.name}
      </h2>
      <div className="text-body-sm-regular font-body" style={{ color: 'var(--color-gray-400)', marginBottom: 12 }}>
        ID {vehicle.vehicleId}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        {/* Chip solido (sem borda, cantos menos arredondados) — nao e um
            botao, so um rotulo de estado; o botao ao lado usa contorno +
            pilula pra ficar claro que é clicavel. white-space/flex-shrink
            evitam o texto quebrar linha dentro do chip quando o espaco
            aperta (ex: sidebar no piso do clamp) — a linha inteira quebra
            (flexWrap acima) antes de espremer o texto do chip. */}
        <div
          className="text-body-sm-semibold font-body"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: `color-mix(in srgb, ${statusColorVar(vehicle.status)} 18%, var(--color-secondary-700))`,
            borderRadius: 8,
            padding: '4px 12px',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColorVar(vehicle.status),
              boxShadow: `0 0 6px ${statusColorVar(vehicle.status)}`,
            }}
          />
          {statusLabel(vehicle.status)}
        </div>

        {hasMultipleVehicles && onNext && (
          <button
            onClick={onNext}
            className="sidebar-next-btn text-body-sm-semibold font-body"
            aria-label="Ver próxima ambulância"
          >
            Próxima ambulância
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </>
  );
}

function VehicleFields({ vehicle }: { vehicle: Vehicle }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {buildFields(vehicle).map((field) => (
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

export default function VehicleSidebar({
  vehicle,
  onClose,
  onNext,
  hasMultipleVehicles,
  breakpoint,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  onNext: () => void;
  hasMultipleVehicles: boolean;
  breakpoint: Breakpoint;
}) {
  return (
    <SidebarShell
      entityKey={vehicle?.id ?? null}
      breakpoint={breakpoint}
      onClose={onClose}
      header={
        vehicle && <VehicleHeader vehicle={vehicle} onNext={onNext} hasMultipleVehicles={hasMultipleVehicles} />
      }
      body={vehicle && <VehicleFields vehicle={vehicle} />}
      tabs={
        vehicle
          ? [
              { id: 'info', label: 'Informações', content: <VehicleFields vehicle={vehicle} /> },
              {
                id: 'trajeto',
                label: 'Trajeto',
                content: <MissionTimelineContent vehicle={vehicle} orientation="vertical" />,
              },
            ]
          : undefined
      }
    />
  );
}
