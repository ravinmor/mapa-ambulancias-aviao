import config from '../config';
import { getOpenSkyAuthHeaders } from './openskyAuth';

// Cliente minimo do OpenSky pra aeronaves especificas, identificadas por
// ICAO24 — separado de sources/opensky.ts DE PROPOSITO (pedido do usuario: o
// pipeline generico por area/vaga fica intacto no repositorio, so para de
// ser chamado; nao mexer nele). Mesma resposta posicional da API.
//
// 2 modos de busca, usados por trackedAircraft.ts conforme o caso:
// - fetchTrackedAircraftState: SEM caixa (global) — cara (4 creditos), usada
//   so na 1a vez que uma aeronave e vista (sem posicao anterior pra
//   centralizar caixa nenhuma) ou como resgate se a busca por caixa falhar.
// - fetchTrackedAircraftStateNear: COM caixa pequena ao redor de uma posicao
//   conhecida — barata (1 credito, medido 2026-09-02), usada no dia a dia.

const IDX = {
  callsign: 1,
  timePosition: 3,
  lastContact: 4,
  longitude: 5,
  latitude: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  geoAltitude: 13,
  squawk: 14,
} as const;

type RawState = (string | number | boolean | number[] | null)[];

interface OpenSkyResponse {
  time: number;
  states: RawState[] | null;
}

// Mesmo motivo do timeout em sources/opensky.ts: sem isso, uma chamada
// pendurada trava o loop inteiro (startLoop so reagenda apos o ciclo atual
// terminar).
const TIMEOUT_MS = 20000;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

export interface TrackedAircraftState {
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  // Codigo do transponder (4 digitos, ex: "1200" voo VFR generico). Buscado
  // pra alertar visualmente nos 3 codigos universais de emergencia — 7500
  // sequestro, 7600 falha de radio, 7700 emergencia geral (R-15, pedido do
  // usuario 2026-09-02). Mesmo indice/parsing do pipeline generico
  // (sources/opensky.ts).
  squawk: string | null;
  positionAt: Date;
}

function parseFirstState(body: OpenSkyResponse): TrackedAircraftState | null {
  const raw = body.states?.[0];
  if (!raw) return null;

  const latitude = toNumber(raw[IDX.latitude]);
  const longitude = toNumber(raw[IDX.longitude]);
  if (latitude == null || longitude == null) return null;

  // Mesma regra do pipeline generico: time_position primeiro, last_contact
  // como fallback; sem nenhum dos dois nao da pra saber quando foi o fix.
  const positionSeconds = toNumber(raw[IDX.timePosition]) ?? toNumber(raw[IDX.lastContact]);
  if (positionSeconds == null) return null;

  return {
    callsign: toStringOrNull(raw[IDX.callsign])?.trim() || null,
    latitude,
    longitude,
    altitude: toNumber(raw[IDX.baroAltitude]) ?? toNumber(raw[IDX.geoAltitude]),
    velocity: toNumber(raw[IDX.velocity]),
    trueTrack: toNumber(raw[IDX.trueTrack]),
    verticalRate: toNumber(raw[IDX.verticalRate]),
    onGround: raw[IDX.onGround] === true,
    squawk: toStringOrNull(raw[IDX.squawk]),
    positionAt: new Date(positionSeconds * 1000),
  };
}

async function fetchStates(params: Record<string, string>): Promise<OpenSkyResponse> {
  const target = new URL(config.trackedAircraft.url);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = await fetch(target.toString(), {
    headers: { Accept: 'application/json', ...(await getOpenSkyAuthHeaders()) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenSky (aeronave monitorada) retornou ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as OpenSkyResponse;
}

// null = a aeronave nao apareceu na resposta neste ciclo (fora do ar, sem
// ADS-B, ou fora de alcance de receptor) — nao e erro, e "offline agora".
//
// SEM caixa — busca no planeta inteiro. Cara (4 creditos, medido
// 2026-09-02): so pra 1a vez que vemos uma aeronave (sem posicao anterior
// pra centralizar uma caixa pequena) ou como resgate quando a busca por
// caixa (abaixo) nao encontra nada.
export async function fetchTrackedAircraftState(icao24: string): Promise<TrackedAircraftState | null> {
  const body = await fetchStates({ icao24 });
  return parseFirstState(body);
}

// COM caixa pequena centralizada numa posicao conhecida — barata (1 credito
// pra uma caixa do tamanho usado aqui, medido 2026-09-02, mesmo nivel da
// caixa SP+RJ do pipeline generico). boxDegrees e a meia-largura da caixa
// (a mesma pra lat e lon, sem corrigir por cosseno de latitude — folga de
// seguranca, nao precisao, ver boxDegreesFor em trackedAircraft.ts).
export async function fetchTrackedAircraftStateNear(
  icao24: string,
  latitude: number,
  longitude: number,
  boxDegrees: number,
): Promise<TrackedAircraftState | null> {
  const body = await fetchStates({
    icao24,
    lamin: String(latitude - boxDegrees),
    lamax: String(latitude + boxDegrees),
    lomin: String(longitude - boxDegrees),
    lomax: String(longitude + boxDegrees),
  });
  return parseFirstState(body);
}
