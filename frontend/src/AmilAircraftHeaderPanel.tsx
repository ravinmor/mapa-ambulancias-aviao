import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TrackedAircraft } from './types';
import { trackedAircraftName } from './trackedAircraft';
import { statusFor } from './AmilFleetStatus';
import { airplanePhoto } from './vehiclePhotos';

// Painel cabeçalho com foto da aeronave (pedido do usuario, 2026-09-04:
// "painel cabeçalho com a imagem da aeronave"). Foto REAL do adsbdb quando
// existe (cobertura parcial — a maioria das aeronaves catalogadas nem tem
// foto), senão cai pro placeholder generico ja usado no resto do projeto
// (pedido do usuario: "quando tiver imagem mostra, quando não tiver mostra
// a imagem do nosso avião atual").
//
// Botão "Próximo avião" — vertical, mesma altura do card principal, do
// LADO DIREITO dele (pedido do usuario, 2026-09-04: "o antigo botão de
// mostrar os outros aviões seja o botão que abre os outros aviões mas só
// no hover, se clicar nele ele só passa pro próximo... do lado direito do
// painel de aeronave com a mesma altura porém o width de como se fosse um
// botão vertical e escrito próximo avião"). 2 comportamentos DIFERENTES no
// mesmo botão: HOVER revela os outros cards (a direita dele), CLIQUE
// seleciona a proxima aeronave da lista (useMapSelection.focusNext) —
// nao abre nada, so avança.
//
// Cards das outras aeronaves — mesmo tamanho/estilo do painel principal,
// aparecem do lado DIREITO do botao (nao mais do lado do card principal).
// Clicar num deles seleciona aquela aeronave (handleMarkerClick, mesma
// funcao que o painel Frota usa). O card clicado ANIMA pra posicao
// principal (pedido do usuario: "quando um for selecionado deve ter uma
// breve animação desse painel se movendo e pegando o lugar do antigo") via
// `layoutId` do Motion — mesmo id por aeronave em AMBOS os slots (principal
// e "outra"), o Motion detecta a troca de posicao entre renders e anima o
// movimento sozinho.
function layoutIdFor(aircraftId: number): string {
  return `amil-header-card-${aircraftId}`;
}

function AircraftCardContents({ aircraft }: { aircraft: TrackedAircraft }) {
  const status = statusFor(aircraft);
  const photo = aircraft.photoThumbnailUrl ?? aircraft.photoUrl ?? airplanePhoto;
  return (
    <>
      <div className="amil-header-photo" style={{ backgroundImage: `url(${photo})` }}>
        <span className={`amil-fleet-status-pill is-${status.kind}`}>
          <span className="amil-fleet-status-dot" />
          {status.label}
        </span>
      </div>
      <div className="amil-header-body">
        <strong>{trackedAircraftName(aircraft)}</strong>
        <small>{aircraft.icao24.toUpperCase()}</small>
      </div>
    </>
  );
}

export default function AmilAircraftHeaderPanel({
  aircraft,
  allAircraft,
  onSelectAircraft,
  onNext,
}: {
  aircraft: TrackedAircraft;
  allAircraft: TrackedAircraft[];
  onSelectAircraft: (id: number) => void;
  onNext: () => void;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const otherAircraft = allAircraft.filter((a) => a.id !== aircraft.id);

  return (
    <div className="amil-header-panel">
      {/* key={aircraft.id} (bug reportado pelo usuario, 2026-09-04: card
          principal sumia e reaparecia depois de trocar de selecao) — sem
          key, o React reaproveitava a MESMA instancia e so mudava o valor
          de layoutId nela; o Motion nao suporta bem "layoutId mutando num
          componente que sobrevive" (o padrao dele e outro elemento com o
          MESMO layoutId montando/desmontando, que e exatamente o que os
          cards de "outra aeronave" abaixo ja fazem, com key={a.id}). Com
          key aqui tambem, a troca de selecao agora desmonta/remonta o card
          principal do mesmo jeito, e o FLIP fica simetrico dos dois lados. */}
      <motion.div
        key={aircraft.id}
        className="amil-header-card"
        layout
        layoutId={layoutIdFor(aircraft.id)}
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      >
        <AircraftCardContents aircraft={aircraft} />
      </motion.div>
      {otherAircraft.length > 0 && (
        <div className="amil-header-next-group" onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
          <button type="button" className={`amil-header-next-button${isHovering ? ' is-active' : ''}`} onClick={onNext}>
            <span>Próximo avião</span>
          </button>
          <AnimatePresence>
            {isHovering && (
              <motion.div
                className="amil-header-expanded"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              >
                {otherAircraft.map((a) => (
                  <motion.button
                    key={a.id}
                    type="button"
                    className="amil-header-card amil-header-card-other"
                    layout
                    layoutId={layoutIdFor(a.id)}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    onClick={() => onSelectAircraft(a.id)}
                  >
                    <AircraftCardContents aircraft={a} />
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
