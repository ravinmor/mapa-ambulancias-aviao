import ambulancePhoto from './assets/vehicles/ambulance.jpg';
import airplanePhoto from './assets/vehicles/airplane.png';
import helicopterPhoto from './assets/vehicles/helicopter.jpg';
import type { Aircraft } from './types';

export { ambulancePhoto, airplanePhoto, helicopterPhoto };

// Hash simples e estavel (FNV-like) — mesma string sempre produz o mesmo
// numero, sem depender de Math.random(). E o que torna a escolha de
// helicoptero determinística por identidade da aeronave (icao24), nao por
// posicao na lista ou por instante do calculo.
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Sorteia 1 aeronave de SP e 1 do RJ pra serem "helicoptero" — decorativo,
// nao reflete tipo real de aeronave (a API do OpenSky nao informa isso).
// Determinístico por icao24: a mesma aeronave continua sendo o helicoptero
// enquanto estiver rastreada, mesmo que o componente re-renderize a cada
// segundo (navegacao estimada) ou a cada broadcast (30s) — sem isso o
// sorteio mudaria de aeronave a cada atualizacao, piscando no mapa.
export function pickHelicopterIcaos(aircraft: Aircraft[]): Set<string> {
  const chosen = new Set<string>();
  for (const region of ['SP', 'RJ'] as const) {
    const inRegion = aircraft.filter((a) => a.region === region);
    if (inRegion.length === 0) continue;
    const winner = inRegion.reduce((best, a) => (hashString(a.icao24) < hashString(best.icao24) ? a : best));
    chosen.add(winner.icao24);
  }
  return chosen;
}
