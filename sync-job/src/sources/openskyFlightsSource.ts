import { getOpenSkyAuthHeaders } from './openskyAuth';

// Historico de pernas de voo passadas (R-31 cont., pedido do usuario,
// 2026-09-04: "pegue a origem destino de voos passados... vindos do
// opensky") — endpoint SEPARADO do usado pra posicao ao vivo
// (trackedAircraftSource.ts), mesma autenticacao OAuth2 compartilhada.
//
// Limite real da OpenSky (descoberto testando ao vivo, 2026-09-04): "2
// partitions" significa 2 dias-CALENDARIO (UTC), nao 2x24h corridas — uma
// janela de ~47h pode cruzar 3 dias-calendario dependendo da hora em que
// comeca (ex: 23h de segunda + 47h = 22h de quarta, tocando seg/ter/qua = 3
// dias). So uma janela de ATE 24h corridas garante NUNCA tocar mais que 2
// dias-calendario, nao importa o horario de inicio — por isso
// MAX_WINDOW_SECONDS fica em 23h (folga de 1h de seguranca).
const TIMEOUT_MS = 20000;
const MAX_WINDOW_SECONDS = 23 * 3600;

export interface OpenSkyFlightLeg {
  callsign: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  departedAt: Date;
  arrivedAt: Date | null;
}

interface RawFlight {
  callsign: string | null;
  estDepartureAirport: string | null;
  estArrivalAirport: string | null;
  firstSeen: number;
  lastSeen: number | null;
}

// Busca as pernas de voo desta aeronave desde `sinceSeconds` (epoch) ate
// agora — se o intervalo pedido for maior que o limite da OpenSky, corta pra
// so os ultimos MAX_WINDOW_SECONDS (o chamador decide se precisa varrer em
// varias chamadas pra cobrir um periodo maior; hoje so pedimos a janela
// recente, sem backfill historico profundo).
export async function fetchRecentFlights(icao24: string, sinceSeconds: number): Promise<OpenSkyFlightLeg[]> {
  const end = Math.floor(Date.now() / 1000);
  const begin = Math.max(sinceSeconds, end - MAX_WINDOW_SECONDS);

  const url = new URL('https://opensky-network.org/api/flights/aircraft');
  url.searchParams.set('icao24', icao24);
  url.searchParams.set('begin', String(begin));
  url.searchParams.set('end', String(end));

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json', ...(await getOpenSkyAuthHeaders()) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // 404 = nenhum voo encontrado nessa janela — resposta normal, nao erro.
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`OpenSky (historico de voos) retornou ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as RawFlight[] | null;
  if (!Array.isArray(body)) return [];

  return body.map((flight) => ({
    callsign: flight.callsign?.trim() || null,
    departureIcao: flight.estDepartureAirport,
    arrivalIcao: flight.estArrivalAirport,
    departedAt: new Date(flight.firstSeen * 1000),
    arrivedAt: flight.lastSeen ? new Date(flight.lastSeen * 1000) : null,
  }));
}
