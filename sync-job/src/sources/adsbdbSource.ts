// Cliente do adsbdb.com — API publica GRATUITA, SEM autenticacao (pedido do
// usuario, 2026-09-04: "adicione o adsbdb pra pegar informacoes da aeronave
// e a origem destino"). Substitui o endpoint de metadados do OpenSky, que
// foi DESCONTINUADO (410 Gone, confirmado 2026-09-04) — ver R-17/R-30 no
// CONTROLE_Aeronave_Amil.md.
//
// 2 endpoints usados:
// - /v0/aircraft/{icao24}: matricula/fabricante/modelo/operador. Cobertura
//   parcial (banco crowdsourced) — "unknown aircraft" e resposta NORMAL, nao
//   erro, pra aeronaves fora do catalogo deles.
// - /v0/callsign/{callsign}: origem/destino do voo ATUAL, a partir do
//   callsign (numero do voo, ex: GLO7641) — tambem cobertura parcial (so
//   rotas conhecidas/regulares).

const ADSBDB_TIMEOUT_MS = 10000;

async function fetchAdsbdb<T>(path: string): Promise<{ response: T } | { response: string }> {
  const response = await fetch(`https://api.adsbdb.com/v0/${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(ADSBDB_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`adsbdb retornou ${response.status} em /${path}: ${await response.text()}`);
  }
  return (await response.json()) as { response: T } | { response: string };
}

export interface AdsbdbAircraft {
  registration: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
  // Foto real da aeronave (pedido do usuario, 2026-09-04: "painel cabeçalho
  // com a imagem da aeronave") — cobertura MUITO mais parcial ainda que o
  // resto (a maioria das aeronaves catalogadas no adsbdb nao tem foto),
  // frontend precisa de fallback pro placeholder generico ja usado em
  // AmilFleetStatus quando vier null.
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
}

interface AdsbdbAircraftResponse {
  aircraft: {
    registration?: string | null;
    manufacturer?: string | null;
    type?: string | null;
    registered_owner?: string | null;
    url_photo?: string | null;
    url_photo_thumbnail?: string | null;
  };
}

// null = adsbdb nao tem essa aeronave catalogada ("unknown aircraft") — nao
// e erro, e resposta normal do endpoint.
export async function fetchAdsbdbAircraft(icao24: string): Promise<AdsbdbAircraft | null> {
  const body = await fetchAdsbdb<AdsbdbAircraftResponse>(`aircraft/${icao24}`);
  if (typeof body.response === 'string') return null;
  const a = body.response.aircraft;
  return {
    registration: a.registration ?? null,
    manufacturer: a.manufacturer ?? null,
    model: a.type ?? null,
    operator: a.registered_owner ?? null,
    photoUrl: a.url_photo ?? null,
    photoThumbnailUrl: a.url_photo_thumbnail ?? null,
  };
}

export interface AdsbdbRoute {
  originIcao: string | null;
  originName: string | null;
  destinationIcao: string | null;
  destinationName: string | null;
  // Coordenadas do destino (pedido do usuario, 2026-09-04) — usadas pro
  // dead reckoning saber quando esta perto do pouso e travar a extrapolacao
  // (ver useDeadReckoning.ts) e pra linha tracejada ate o destino no mapa.
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}

interface AdsbdbAirport {
  icao_code?: string | null;
  municipality?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface AdsbdbRouteResponse {
  flightroute: {
    origin?: AdsbdbAirport | null;
    destination?: AdsbdbAirport | null;
  };
}

function formatAirport(airport: AdsbdbAirport | null | undefined): string | null {
  if (!airport?.icao_code) return null;
  return airport.municipality ? `${airport.municipality} (${airport.icao_code})` : airport.icao_code;
}

// null = adsbdb nao conhece essa rota pra este callsign ("unknown callsign",
// ou callsign generico demais) — nao e erro.
export async function fetchAdsbdbRoute(callsign: string): Promise<AdsbdbRoute | null> {
  const body = await fetchAdsbdb<AdsbdbRouteResponse>(`callsign/${encodeURIComponent(callsign.trim())}`);
  if (typeof body.response === 'string') return null;
  const { origin, destination } = body.response.flightroute;
  return {
    originIcao: origin?.icao_code ?? null,
    originName: formatAirport(origin),
    destinationIcao: destination?.icao_code ?? null,
    destinationName: formatAirport(destination),
    destinationLatitude: destination?.latitude ?? null,
    destinationLongitude: destination?.longitude ?? null,
  };
}
