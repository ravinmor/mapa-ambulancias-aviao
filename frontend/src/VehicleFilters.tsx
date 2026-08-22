import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { Aircraft, Vehicle } from './types';
import type { Breakpoint } from './useBreakpoint';
import { statusLabel } from './vehicleStatus';
import { aircraftName } from './aircraft';

export const ALL = 'all';

// Que camadas aparecem no mapa. "all" mostra as duas.
export type DisplayMode = 'all' | 'vehicles' | 'aircraft';

// Van e aeronave tem ids independentes (duas tabelas, dois autoincrement),
// entao o mesmo numero pode existir nas duas — o prefixo evita que escolher
// a van 8 selecione a aeronave 8.
function optionValue(kind: 'v' | 'a', id: number): string {
  return `${kind}:${id}`;
}

// Filtro roda 100% no front (a API continua mandando a frota inteira) — sao
// ~26 vans, entao nao vale complicar o backend com query param pra isso. As
// opcoes de status/estado sao derivadas do proprio dado recebido, nao de uma
// lista fixa: a origem (SharePoint) pode ganhar um status novo a qualquer
// momento (ja aconteceu com "Refeição"/"Sem Operação"), e assim ele aparece
// sozinho no filtro em vez de sumir da interface.
function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v != null && v !== ''))).sort();
}

export function filterVehicles(vehicles: Vehicle[], statusFilter: string, stateFilter: string): Vehicle[] {
  return vehicles.filter(
    (v) => (statusFilter === ALL || v.status === statusFilter) && (stateFilter === ALL || v.state === stateFilter),
  );
}

// So o path SVG muda de lugar (currentColor herda a cor do botao/contexto) —
// nao usamos biblioteca de icone nenhuma, so esse funil desenhado a mao.
function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3h12l-4.5 5v4l-3 1.5V8L2 3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface FilterControlsProps {
  vehicles: Vehicle[];
  filtered: Vehicle[];
  aircraft: Aircraft[];
  statusFilter: string;
  stateFilter: string;
  displayMode: DisplayMode;
  selectedVehicleId: number | null;
  selectedAircraftId: number | null;
  onStatusChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onDisplayModeChange: (value: DisplayMode) => void;
  onSelectVehicle: (vehicleId: number) => void;
  onSelectAircraft: (aircraftId: number) => void;
}

// Os controles em si — reaproveitado tanto na barra inline (desktop/tablet)
// quanto dentro do bottom sheet (mobile), so o container em volta muda.
function FilterControls({
  vehicles,
  filtered,
  aircraft,
  statusFilter,
  stateFilter,
  displayMode,
  selectedVehicleId,
  selectedAircraftId,
  onStatusChange,
  onStateChange,
  onDisplayModeChange,
  onSelectVehicle,
  onSelectAircraft,
}: FilterControlsProps) {
  const statuses = uniqueSorted(vehicles.map((v) => v.status));
  const states = uniqueSorted(vehicles.map((v) => v.state));

  const showVehicles = displayMode !== 'aircraft';
  const showAircraft = displayMode !== 'vehicles';

  // So itens com posicao entram no seletor — escolher um sem lat/long nao
  // teria pra onde focar o mapa (mesma regra dos marcadores).
  const selectableVehicles = showVehicles
    ? filtered
        .filter((v) => v.latitude != null && v.longitude != null)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    : [];

  const selectableAircraft = showAircraft
    ? aircraft
        .filter((a) => a.latitude != null && a.longitude != null)
        .sort((a, b) => aircraftName(a).localeCompare(aircraftName(b), 'pt-BR'))
    : [];

  const totalSelectable = selectableVehicles.length + selectableAircraft.length;

  // Se o item selecionado saiu do grupo filtrado, o select volta pro
  // placeholder em vez de mostrar valor fantasma.
  let selectValue = '';
  if (selectableVehicles.some((v) => v.id === selectedVehicleId)) {
    selectValue = optionValue('v', selectedVehicleId as number);
  } else if (selectableAircraft.some((a) => a.id === selectedAircraftId)) {
    selectValue = optionValue('a', selectedAircraftId as number);
  }

  function handleSelectChange(raw: string) {
    if (!raw) return;
    const [kind, rawId] = raw.split(':');
    const id = Number(rawId);
    if (kind === 'v') onSelectVehicle(id);
    else onSelectAircraft(id);
  }

  // Rotulo do seletor acompanha o modo — "Ambulância" com o filtro em
  // aeronaves seria mentira.
  const selectorLabel = !showAircraft ? 'Ambulância' : !showVehicles ? 'Aeronave' : 'Veículo/Aeronave';

  return (
    <>
      <label className="map-filter">
        <span className="map-filter-label text-body-sm-medium font-body">Exibir</span>
        <select
          className="map-filter-select text-body-sm-medium font-body"
          value={displayMode}
          onChange={(e) => onDisplayModeChange(e.target.value as DisplayMode)}
        >
          <option value="all">Todos</option>
          <option value="vehicles">Ambulâncias</option>
          <option value="aircraft">Aeronaves</option>
        </select>
      </label>

      {/* Status e Estado so existem pra van — com o mapa em "Aeronaves" eles
          ficariam visiveis sem efeito nenhum, entao somem. */}
      {showVehicles && (
        <>
          <label className="map-filter">
            <span className="map-filter-label text-body-sm-medium font-body">Status</span>
            <select
              className="map-filter-select text-body-sm-medium font-body"
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value={ALL}>Todos</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="map-filter">
            <span className="map-filter-label text-body-sm-medium font-body">Estado</span>
            <select
              className="map-filter-select text-body-sm-medium font-body"
              value={stateFilter}
              onChange={(e) => onStateChange(e.target.value)}
            >
              <option value={ALL}>Todos</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="map-filter">
        <span className="map-filter-label text-body-sm-medium font-body">
          {selectorLabel}
          {totalSelectable > 0 ? ` (${totalSelectable})` : ''}
        </span>
        <select
          className="map-filter-select text-body-sm-medium font-body"
          value={selectValue}
          disabled={totalSelectable === 0}
          onChange={(e) => handleSelectChange(e.target.value)}
        >
          <option value="">{totalSelectable === 0 ? 'Nenhum no filtro' : 'Selecione…'}</option>

          {/* Com as duas camadas visiveis, agrupar evita uma lista longa em
              que van e aeronave se misturam sem distincao. */}
          {displayMode === 'all' ? (
            <>
              {selectableVehicles.length > 0 && (
                <optgroup label="Ambulâncias">
                  {selectableVehicles.map((v) => (
                    <option key={`v-${v.id}`} value={optionValue('v', v.id)}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {selectableAircraft.length > 0 && (
                <optgroup label="Aeronaves">
                  {selectableAircraft.map((a) => (
                    <option key={`a-${a.id}`} value={optionValue('a', a.id)}>
                      {aircraftName(a)}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          ) : (
            <>
              {selectableVehicles.map((v) => (
                <option key={`v-${v.id}`} value={optionValue('v', v.id)}>
                  {v.name}
                </option>
              ))}
              {selectableAircraft.map((a) => (
                <option key={`a-${a.id}`} value={optionValue('a', a.id)}>
                  {aircraftName(a)}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
    </>
  );
}

export default function VehicleFilters({ breakpoint, ...controlProps }: FilterControlsProps & { breakpoint: Breakpoint }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const hasActiveFilter =
    controlProps.statusFilter !== ALL || controlProps.stateFilter !== ALL || controlProps.displayMode !== 'all';

  // Botao compacto e o padrao em qualquer breakpoint agora — nao so mobile.
  // Abre um painel (fechado pelo botao ou tocando fora); a UNICA coisa que
  // muda por breakpoint e o ESTILO desse painel, nao mais se ele existe ou
  // nao (ver isDesktopPopover abaixo).
  // Escolher uma van no select fecha o painel sozinho (handleSelectVehicle),
  // ja que essa acao ja diz "terminei de filtrar, quero ver essa van".
  function handleSelectVehicle(vehicleId: number) {
    controlProps.onSelectVehicle(vehicleId);
    setIsSheetOpen(false);
  }

  function handleSelectAircraft(aircraftId: number) {
    controlProps.onSelectAircraft(aircraftId);
    setIsSheetOpen(false);
  }

  // Mobile: painel full-width descendo do topo, como um mini-modal (grande
  // o suficiente pra pedir um "dimmer" atras). Tablet/desktop: popover
  // pequeno ancorado no canto onde o botao ja fica, sem escurecer o mapa —
  // fecha so por clicar fora, nao precisa do peso visual de um modal pra um
  // painel de filtro pequeno no canto.
  const isDesktopPopover = breakpoint !== 'mobile';

  return (
    <>
      <button
        type="button"
        className={`map-filter-trigger${hasActiveFilter ? ' has-active-filter' : ''}`}
        aria-label="Abrir filtros"
        onClick={() => setIsSheetOpen(true)}
      >
        <FilterIcon />
        {hasActiveFilter && <span className="map-filter-trigger-dot" aria-hidden="true" />}
      </button>

      {createPortal(
        <AnimatePresence>
          {isSheetOpen && (
            <>
              <motion.div
                className={isDesktopPopover ? 'map-filter-backdrop map-filter-backdrop--transparent' : 'map-filter-backdrop'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setIsSheetOpen(false)}
              />
              <motion.div
                className={isDesktopPopover ? 'map-filter-sheet map-filter-sheet--popover' : 'map-filter-sheet'}
                initial={isDesktopPopover ? { opacity: 0, y: -8 } : { y: '-100%' }}
                animate={isDesktopPopover ? { opacity: 1, y: 0 } : { y: 0 }}
                exit={isDesktopPopover ? { opacity: 0, y: -8 } : { y: '-100%' }}
                transition={
                  isDesktopPopover ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 32 }
                }
              >
                <div className="map-filter-sheet-header">
                  <span className="text-h6 font-heading" style={{ color: 'var(--color-gray-50)' }}>
                    Filtros
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSheetOpen(false)}
                    aria-label="Fechar"
                    className="sidebar-close-btn"
                    style={{ background: 'transparent', color: 'var(--color-primary-100)', borderRadius: 6, width: 28, height: 28, fontSize: 14 }}
                  >
                    ✕
                  </button>
                </div>
                <div className="map-filters map-filters--stacked">
                  <FilterControls
                    {...controlProps}
                    onSelectVehicle={handleSelectVehicle}
                    onSelectAircraft={handleSelectAircraft}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
