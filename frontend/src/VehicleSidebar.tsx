import { useState } from 'react';
import type { Mission, Vehicle } from './types';
import type { Breakpoint } from './useBreakpoint';
import { MissionTimelineContent } from './MissionTimeline';
import SidebarShell from './SidebarShell';
import PatientFields from './PatientFields';
import { InfoTabIcon, RouteTabIcon, PatientTabIcon, CopyIcon } from './sidebarTabIcons';
import { ambulancePhoto } from './vehiclePhotos';
import { statusLabel, statusColorVar } from './vehicleStatus';

// "Copiado!" volta pro estado padrao sozinho depois desse tempo — mesma
// ideia de feedback transitorio usada em outros botoes de acao rapida por ai.
const COPY_FEEDBACK_MS = 2000;

function trackingUrl(vehicleId: number): string {
  return `${window.location.origin}/track/${vehicleId}`;
}

async function copyTrackingLink(vehicleId: number): Promise<void> {
  await navigator.clipboard.writeText(trackingUrl(vehicleId));
}

// Dois alvos de clique com acoes diferentes: o TEXTO abre a pagina de
// rastreamento numa aba nova (alem de copiar, pra quem quer conferir o que
// esta compartilhando); o ICONE isolado so copia, sem navegar — pedido
// explicito do usuario (2026-08-25), pro caso comum de so querer colar o
// link em outro lugar (WhatsApp, etc.) sem abrir aba nenhuma aqui.
function ShareLinkButton({ vehicleId }: { vehicleId: number }) {
  const [copied, setCopied] = useState(false);

  function showCopiedFeedback() {
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  async function handleShareClick() {
    try {
      await copyTrackingLink(vehicleId);
      showCopiedFeedback();
    } catch (error) {
      // Clipboard pode falhar por permissao do navegador (raro em http/
      // contexto nao seguro) — a aba nova ainda abre, entao o usuario
      // consegue copiar a URL da barra de enderecos manualmente.
      console.error('Erro ao copiar link:', error);
    }
    window.open(trackingUrl(vehicleId), '_blank', 'noopener,noreferrer');
  }

  async function handleCopyIconClick(event: React.MouseEvent) {
    // Nao deixa o clique "vazar" pro botao do texto por tras — os dois
    // ficam sobrepostos visualmente (icone dentro do botao), entao sem isso
    // clicar no icone tambem dispararia handleShareClick e abriria a aba.
    event.stopPropagation();
    try {
      await copyTrackingLink(vehicleId);
      showCopiedFeedback();
    } catch (error) {
      console.error('Erro ao copiar link:', error);
    }
  }

  return (
    <button
      onClick={() => void handleShareClick()}
      className="sidebar-next-btn text-body-sm-semibold font-body"
      aria-label="Compartilhar rota (abre em nova aba)"
      title="Compartilhar rota"
    >
      {copied ? 'Link copiado!' : 'Compartilhar rota'}
      <span
        onClick={(event) => void handleCopyIconClick(event)}
        role="button"
        tabIndex={0}
        aria-label="Copiar link de acompanhamento"
        title="Copiar link"
        style={{ display: 'inline-flex' }}
      >
        <CopyIcon />
      </span>
    </button>
  );
}

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
  breakpoint,
}: {
  vehicle: Vehicle;
  onNext?: () => void;
  hasMultipleVehicles?: boolean;
  breakpoint: Breakpoint;
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

        <ShareLinkButton vehicleId={vehicle.id} />
      </div>

      {/* Foto fica abaixo da tag de status/botao "Proxima" e acima dos
          campos (Placa e o primeiro) — pedido explicito do usuario. Some no
          mobile: a bottom sheet ja e apertada, foto so tomaria espaco do
          conteudo real. */}
      {breakpoint !== 'mobile' && (
        <img src={ambulancePhoto} alt="" className="sidebar-photo" />
      )}
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
  mission,
  onClose,
  onNext,
  hasMultipleVehicles,
  breakpoint,
  fixed = false,
}: {
  vehicle: Vehicle | null;
  mission: Mission | null;
  onClose: () => void;
  onNext: () => void;
  hasMultipleVehicles: boolean;
  breakpoint: Breakpoint;
  // Pagina de rastreamento (link compartilhavel): sidebar fixa, sem botao de
  // fechar no desktop. Nao usado no mapa operacional (default false).
  fixed?: boolean;
}) {
  return (
    <SidebarShell
      entityKey={vehicle?.id ?? null}
      breakpoint={breakpoint}
      onClose={onClose}
      fixed={fixed}
      header={
        vehicle && (
          <VehicleHeader
            vehicle={vehicle}
            onNext={onNext}
            hasMultipleVehicles={hasMultipleVehicles}
            breakpoint={breakpoint}
          />
        )
      }
      body={vehicle && <VehicleFields vehicle={vehicle} />}
      tabs={
        vehicle
          ? [
              { id: 'info', label: 'Informações', icon: <InfoTabIcon />, content: <VehicleFields vehicle={vehicle} /> },
              // "Trajeto" so no mobile: em desktop/tablet a linha do tempo ja
              // aparece na barra flutuante centralizada (ver Map.tsx),
              // repeti-la numa aba seria duplicado. So mobile nao tem espaco
              // pra barra flutuante sem sobrepor o mapa, entao embute a
              // versao vertical aqui (pedido do usuario, 2026-08-24).
              ...(breakpoint === 'mobile'
                ? [
                    {
                      id: 'trajeto',
                      label: 'Trajeto',
                      icon: <RouteTabIcon />,
                      content: <MissionTimelineContent vehicle={vehicle} mission={mission} orientation="vertical" />,
                    },
                  ]
                : []),
              // "Paciente" em toda tela — resultado: mobile fica com 3 abas
              // (Informações/Trajeto/Paciente), desktop/tablet com 2
              // (Informações/Paciente).
              {
                id: 'paciente',
                label: 'Paciente',
                icon: <PatientTabIcon />,
                content: <PatientFields regulation={mission?.regulation ?? null} />,
              },
            ]
          : undefined
      }
    />
  );
}
