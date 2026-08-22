import type { Aircraft } from './types';

// Cor, rotulo e unidade das aeronaves. Equivalente do vehicleStatus.ts, que
// faz o mesmo pras vans — mesmo papel, dado diferente: van tem status
// discreto, aeronave tem grandezas continuas.

// Teto da escala de cor. 12.000 m cobre praticamente todo voo comercial de
// cruzeiro; acima disso a cor satura no topo em vez de continuar mudando.
export const ALTITUDE_CEILING_M = 12000;

// Gradiente continuo entre as duas pontas da escala definidas em theme.css
// (ciano no solo, violeta no teto). Usa color-mix em vez de calcular hex em
// JS por dois motivos: mantem a regra do projeto de nunca hardcodar cor fora
// do theme.css (se a paleta mudar la, muda aqui junto), e o espaco oklab
// interpola de forma perceptualmente uniforme — em sRGB o meio do caminho
// entre ciano e violeta fica com uma faixa acinzentada suja.
//
// Usado tanto no marcador quanto em cada segmento do trajeto (AircraftTrail),
// que e o que faz a linha mudar de cor conforme o aviao sobe ou desce.
export function altitudeColor(altitude: number | null): string {
  if (altitude == null) return 'var(--color-altitude-unknown)';
  const t = Math.min(Math.max(altitude / ALTITUDE_CEILING_M, 0), 1);
  const pct = (t * 100).toFixed(1);
  return `color-mix(in oklab, var(--color-altitude-500) ${pct}%, var(--color-altitude-100))`;
}

// Callsign e o nome que o controle de trafego usa e o que a pessoa reconhece
// ("TAM3466"). Quando o transponder nao reporta, sobra o icao24 — que e
// sempre presente, so nao e amigavel. Em maiuscula porque a origem manda o
// hex em minuscula e fica estranho no meio de callsigns maiusculos.
export function aircraftName(aircraft: Aircraft): string {
  return aircraft.callsign ?? aircraft.icao24.toUpperCase();
}

// A origem manda metros, mas aviacao fala em pes — mostramos os dois, com o
// pe primeiro por ser a unidade da area.
export function formatAltitude(altitude: number | null): string {
  if (altitude == null) return '—';
  const feet = Math.round(altitude * 3.28084);
  return `${feet.toLocaleString('pt-BR')} ft (${Math.round(altitude).toLocaleString('pt-BR')} m)`;
}

// m/s e a unidade da origem, mas ninguem le velocidade de aeronave assim.
export function formatVelocity(velocity: number | null): string {
  if (velocity == null) return '—';
  return `${Math.round(velocity * 3.6).toLocaleString('pt-BR')} km/h`;
}

// O sinal importa mais que o numero: o que a pessoa quer saber e se esta
// subindo, descendo ou nivelado. A faixa morta de 0,5 m/s evita ficar
// piscando entre "subindo" e "descendo" por ruido do transponder em voo reto.
export function formatVerticalRate(verticalRate: number | null): string {
  if (verticalRate == null) return '—';
  const perMinute = Math.round(verticalRate * 60);
  if (Math.abs(verticalRate) < 0.5) return 'nivelado';
  const arrow = verticalRate > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(perMinute).toLocaleString('pt-BR')} m/min`;
}

export function formatTrack(trueTrack: number | null): string {
  if (trueTrack == null) return '—';
  return `${Math.round(trueTrack)}°`;
}
