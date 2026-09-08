import type { TrackedAircraft } from './types';
import { formatAltitude, formatVelocity, formatVerticalRate, formatTrack } from './aircraft';

// Painel de informações de voo, lado DIREITO — mesmo estilo HUD do
// AmilMetadataPanel (esquerda), pedido do usuário 2026-09-04: "crie mais um
// painel igual esse da imagem com as informações da navbar" (Altitude/
// Velocidade/Rumo/Taxa vertical, que saíram da topbar).
export default function AmilFlightInfoPanel({ aircraft }: { aircraft: TrackedAircraft }) {
  return (
    <div className="amil-metadata-panel amil-hud-panel">
      <div className="amil-metadata-header">
        <svg className="amil-metadata-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2v20M4 8l8-2 8 2M4 16l8 2 8-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="amil-metadata-title">Informações de voo</div>
      </div>
      <div className="amil-metadata-grid">
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Altitude</span>
          <span className="amil-metadata-stat-value">{formatAltitude(aircraft.altitude)}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Velocidade</span>
          <span className="amil-metadata-stat-value">{formatVelocity(aircraft.velocity)}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Rumo</span>
          <span className="amil-metadata-stat-value">{formatTrack(aircraft.trueTrack)}</span>
        </div>
        <div className="amil-metadata-stat">
          <span className="amil-metadata-stat-label">Taxa vertical</span>
          <span className="amil-metadata-stat-value">{formatVerticalRate(aircraft.verticalRate)}</span>
        </div>
      </div>
    </div>
  );
}
