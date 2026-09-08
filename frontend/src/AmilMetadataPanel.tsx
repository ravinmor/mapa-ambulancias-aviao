import type { TrackedAircraft } from './types';

// Painel de metadados no lado ESQUERDO (R-31, ultimo item do redesenho de
// layout: "esquerda = metadados, direita = voo+indicadores"). Estilo
// baseado numa referencia visual fornecida pelo usuario, 2026-09-04 (dashboard
// DATAV de aeroporto): moldura fina com "brackets" em L nos cantos, card com
// icone + grid 2x2 de numeros.
//
// Cabecalho com nome/ICAO/foto saiu daqui — agora e o AmilAircraftHeaderPanel
// (acima deste, pedido do usuario 2026-09-04: "painel cabeçalho com a
// imagem da aeronave"), sem duplicar a identidade nos 2 lugares.
//
// Matricula/fabricante/modelo/operador (R-17) vem do adsbdb.com — cobertura
// PARCIAL (banco crowdsourced), "—" quando essa aeronave nao esta
// catalogada la, nao e erro. Origem/destino (R-18) do voo ATUAL vem do
// mesmo adsbdb (rota por callsign), tambem cobertura parcial.
export default function AmilMetadataPanel({ aircraft }: { aircraft: TrackedAircraft }) {
  const hasRoute = aircraft.originIcao || aircraft.destinationIcao;

  return (
    <div className="amil-metadata-panel amil-hud-panel">
      <div className="amil-metadata-panel-title">Metadados</div>
      <div className="amil-metadata-grid">
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Matrícula</span>
          <span className="amil-metadata-stat-value">{aircraft.registration ?? '—'}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Operador</span>
          <span className="amil-metadata-stat-value">{aircraft.operator ?? '—'}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Fabricante</span>
          <span className="amil-metadata-stat-value">{aircraft.manufacturer ?? '—'}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Modelo</span>
          <span className="amil-metadata-stat-value">{aircraft.model ?? '—'}</span>
        </div>
      </div>
      {/* Rota do voo ATUAL (R-18) — so aparece quando o adsbdb encontrou
          origem OU destino pra este callsign, sem inventar tracinho vazio. */}
      {hasRoute && (
        <div className="amil-metadata-route">
          <span>{aircraft.originName ?? aircraft.originIcao ?? '?'}</span>
          <span className="amil-metadata-route-arrow">→</span>
          <span>{aircraft.destinationName ?? aircraft.destinationIcao ?? '?'}</span>
        </div>
      )}
    </div>
  );
}
