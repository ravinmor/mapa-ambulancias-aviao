import { Polyline } from 'react-leaflet';
import type { TrailPoint } from './useMapSelection';
import { altitudeColor } from './aircraft';

// Trajeto da aeronave colorido pela altitude ao longo do caminho.
//
// Uma Polyline do Leaflet tem UMA cor so — nao existe gradiente nativo num
// path do Leaflet. A solucao e desenhar o trajeto como uma sequencia de
// segmentos curtos, cada um com a cor da altitude naquele trecho. Com pontos
// suficientes a leitura e de um degrade continuo, e de quebra cada segmento
// carrega a informacao correta do trecho que representa (uma linha com
// gradiente "decorativo" nao teria essa garantia).
//
// A cor de cada segmento vem da MEDIA das altitudes das duas pontas — assim a
// transicao entre segmentos vizinhos e suave, em vez de dar um degrau na cor
// a cada ponto.

export default function AircraftTrail({
  points,
  isFocusing,
}: {
  points: TrailPoint[];
  isFocusing: boolean;
}) {
  if (points.length < 2) return null;

  return (
    <>
      {points.slice(1).map((point, index) => {
        const previous = points[index];
        const from = previous.altitude;
        const to = point.altitude;
        // Se so um dos lados tem altitude, usa o que existe; se nenhum tem,
        // altitudeColor cai na cor neutra sozinho.
        const average = from != null && to != null ? (from + to) / 2 : from ?? to ?? null;

        return (
          <Polyline
            key={`${previous.positionAt ?? index}-${point.positionAt ?? index}`}
            positions={[
              [previous.latitude, previous.longitude],
              [point.latitude, point.longitude],
            ]}
            pathOptions={{
              color: altitudeColor(average),
              weight: 3,
              // Mesmo motivo do marcador: some durante o flyTo pra nao
              // aparecer esticado pela animacao de zoom do Leaflet.
              opacity: isFocusing ? 0 : 0.95,
              lineCap: 'round',
            }}
          />
        );
      })}
    </>
  );
}
