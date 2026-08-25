import { memo, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Aircraft } from './types';
import { aircraftName, altitudeColor } from './aircraft';
import type { Breakpoint } from './useBreakpoint';

const ICON_SIZE = 22;
const ACTIVE_SCALE = 1.3;

// Triangulo, nao silhueta de aviao: a 22px nenhum desenho com asa/fuselagem
// fica legivel, e a forma precisa dizer UMA coisa — pra onde a aeronave esta
// indo. Junto com o circulo pulsante da van, a leitura fica imediata:
// circulo = ambulancia (sem direcao), seta = aeronave (com direcao).
//
// Usa L.divIcon (HTML/CSS) em vez de um path do Leaflet de proposito. Alem de
// permitir a rotacao por CSS, divIcon aplica className na criacao do elemento,
// entao NAO cai no bug do @react-leaflet/core que atingiu o CircleMarker das
// vans (pathOptions atualiza cor via setStyle mas nunca reaplica a classe).
// Seta simples — a forma que a maioria das aeronaves usa (ver buildIcon).
const AIRPLANE_PATH =
  '<path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor" ' +
  'stroke="rgba(2,8,20,0.75)" stroke-width="1.2" stroke-linejoin="round"/>';

// Vista de cima: linha do rotor principal atravessando a fuselagem + rabo —
// silhueta bem diferente do triangulo do aviao, pro helicoptero se
// distinguir no mapa mesmo em zoom baixo. So as 2 aeronaves sorteadas por
// pickHelicopterIcaos usam isto (ver vehiclePhotos.ts) — nao reflete tipo
// real de aeronave, a API do OpenSky nao informa isso.
const HELICOPTER_PATH =
  '<line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="rgba(2,8,20,0.75)" stroke-width="1"/>' +
  '<line x1="12" y1="16.5" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

function buildIcon(aircraft: Aircraft, isActive: boolean, isHelicopter: boolean): L.DivIcon {
  const color = altitudeColor(aircraft.altitude);
  // Sem rumo conhecido a seta aponta pro norte — melhor que esconder a
  // aeronave, e o caso e raro.
  const rotation = aircraft.trueTrack ?? 0;
  // Rotacao e escala vao juntas no mesmo transform inline: se a escala
  // ficasse numa classe CSS, ela sobrescreveria a rotacao (transform e uma
  // propriedade so, nao acumula entre regras).
  const transform = `rotate(${rotation}deg) scale(${isActive ? ACTIVE_SCALE : 1})`;

  return L.divIcon({
    className: `aircraft-marker${isActive ? ' is-active' : ''}`,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
    // O contorno escuro mantem o icone legivel se o tile por baixo for claro
    // (nuvem, area urbana clara) — sem ele, aeronave alta em violeta some.
    html:
      `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}" ` +
      `style="color:${color};transform:${transform}">` +
      (isHelicopter ? HELICOPTER_PATH : AIRPLANE_PATH) +
      `</svg>`,
  });
}

const AircraftMarkers = memo(function AircraftMarkers({
  aircraft,
  breakpoint,
  selectedAircraftId,
  isFocusing,
  onMarkerClick,
  helicopterIcaos,
}: {
  aircraft: Aircraft[];
  breakpoint: Breakpoint;
  selectedAircraftId: number | null;
  isFocusing: boolean;
  onMarkerClick: (aircraftId: number) => void;
  helicopterIcaos: Set<string>;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <>
      {aircraft
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => {
          const isActive = a.id === hoveredId || a.id === selectedAircraftId;
          return (
            <Marker
              key={a.id}
              position={[a.latitude as number, a.longitude as number]}
              icon={buildIcon(a, isActive, helicopterIcaos.has(a.icao24))}
              // Mesmo motivo do circulo da van: durante o flyTo o Leaflet
              // escala o pane inteiro junto com a animacao de zoom, e num
              // salto grande o marcador parece crescer cobrindo a tela.
              // Some durante o voo e reaparece no moveend.
              opacity={isFocusing ? 0 : 1}
              eventHandlers={{
                click: () => onMarkerClick(a.id),
                mouseover: () => setHoveredId(a.id),
                mouseout: () => setHoveredId((current) => (current === a.id ? null : current)),
              }}
            >
              {breakpoint !== 'mobile' && (
                <Tooltip direction="right" offset={[12, 0]} className="marker-label text-body-sm-semibold font-body">
                  {aircraftName(a)}
                </Tooltip>
              )}
            </Marker>
          );
        })}
    </>
  );
});

export default AircraftMarkers;
