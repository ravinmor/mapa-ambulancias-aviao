import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TrackedAircraft } from './types';
import { trackedAircraftName } from './trackedAircraft';
import { airplanePhoto, helicopterPhoto, pickHelicopterIcaosFlat } from './vehiclePhotos';

// Painel de status da frota, expansivel a partir da topbar (pedido do
// usuario, 2026-09-03) — referencia visual: card com foto, nome/serial, e
// uma pilula de status colorida. So 3 status possiveis pedidos pelo
// usuario (diferente do card de referencia, que tinha 4): Em missao,
// Disponivel, Pousado.
//
// Deriva o status do MESMO campo "stage" que ja alimenta o arco de
// estagios (sync-job/src/trackedAircraft.ts) — sem dado novo nenhum:
// SOLO (parada antes de qualquer voo) = Disponivel; POUSO (acabou de
// pousar) = Pousado; qualquer estagio aereo = Em missao.
export type FleetStatusKind = 'missao' | 'disponivel' | 'pousado';

export function statusFor(aircraft: TrackedAircraft): { kind: FleetStatusKind; label: string } {
  if (aircraft.stage === 'SOLO') return { kind: 'disponivel', label: 'Disponível' };
  if (aircraft.stage === 'POUSO') return { kind: 'pousado', label: 'Pousado' };
  return { kind: 'missao', label: 'Em missão' };
}

interface AmilFleetStatusProps {
  aircraft: TrackedAircraft[];
  // Mesma funcao que o clique no marcador do mapa ja usa (useMapSelection),
  // reaproveitada aqui — pedido do usuario, 2026-09-03: "quando clique em
  // uma dessas aeronaves selecione ela no mapa". Clicar de novo no card da
  // JA selecionada desseleciona, igual clicar 2x no marcador (mesmo
  // comportamento, uma unica fonte de verdade pra "clicou == selecionar").
  onSelectAircraft: (id: number) => void;
}

export default function AmilFleetStatus({ aircraft, onSelectAircraft }: AmilFleetStatusProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar em QUALQUER lugar fora do painel (pedido do usuario,
  // 2026-09-03), inclusive no mapa por baixo — o container (ref) engloba o
  // botao E o painel juntos, entao um clique no PROPRIO botao (pra fechar
  // manualmente) continua "dentro" e nao dispara esse fechamento duplicado
  // (senao o toggle do botao + este handler se cancelariam, deixando
  // sempre aberto). "mousedown" (nao "click") e o padrao pra esse tipo de
  // detector — dispara antes de outros handlers de click no alvo (ex: o
  // clique num marcador do mapa, que TAMBEM deve fechar o painel).
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // 2 das 4 viram "helicoptero" (pedido do usuario, 2026-09-03: "duas
  // imagens de aeronave e duas de helicoptero... continue com os mesmos
  // avioes, porem coloque a imagem de helicoptero para dois deles") —
  // decorativo, nao reflete tipo real (mesma logica/aviso ja usado pro
  // mapa generico em vehiclePhotos.ts). icao24Key estabiliza o useMemo
  // contra a lista mudando de REFERENCIA a cada segundo (dead reckoning)
  // sem os icao24s em si terem mudado.
  const icao24Key = aircraft.map((a) => a.icao24).join(',');
  const helicopterIcaos = useMemo(() => pickHelicopterIcaosFlat(aircraft.map((a) => a.icao24), 2), [icao24Key]);

  return (
    <div className="amil-fleet-status" ref={containerRef}>
      <button type="button" className="amil-fleet-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Frota
        <span className="amil-fleet-count">{aircraft.length}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="amil-fleet-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          >
            <div className="amil-fleet-panel-title">Fleet Status</div>
            <div className="amil-fleet-grid">
              {aircraft.map((a) => {
                const status = statusFor(a);
                const photo = helicopterIcaos.has(a.icao24) ? helicopterPhoto : airplanePhoto;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="amil-fleet-card"
                    onClick={() => {
                      onSelectAircraft(a.id);
                      setOpen(false);
                    }}
                  >
                    <div className="amil-fleet-card-image" style={{ backgroundImage: `url(${photo})` }}>
                      <span className={`amil-fleet-status-pill is-${status.kind}`}>
                        <span className="amil-fleet-status-dot" />
                        {status.label}
                      </span>
                    </div>
                    <div className="amil-fleet-card-body">
                      <strong>{trackedAircraftName(a)}</strong>
                      <small>SN {a.icao24.toUpperCase()}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
