"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAdsbdbAircraft = fetchAdsbdbAircraft;
exports.fetchAdsbdbRoute = fetchAdsbdbRoute;
const ADSBDB_TIMEOUT_MS = 10000;
async function fetchAdsbdb(path) {
    const response = await fetch(`https://api.adsbdb.com/v0/${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(ADSBDB_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`adsbdb retornou ${response.status} em /${path}: ${await response.text()}`);
    }
    return (await response.json());
}
// null = adsbdb nao tem essa aeronave catalogada ("unknown aircraft") — nao
// e erro, e resposta normal do endpoint.
async function fetchAdsbdbAircraft(icao24) {
    const body = await fetchAdsbdb(`aircraft/${icao24}`);
    if (typeof body.response === 'string')
        return null;
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
function formatAirport(airport) {
    if (!airport?.icao_code)
        return null;
    return airport.municipality ? `${airport.municipality} (${airport.icao_code})` : airport.icao_code;
}
// null = adsbdb nao conhece essa rota pra este callsign ("unknown callsign",
// ou callsign generico demais) — nao e erro.
async function fetchAdsbdbRoute(callsign) {
    const body = await fetchAdsbdb(`callsign/${encodeURIComponent(callsign.trim())}`);
    if (typeof body.response === 'string')
        return null;
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
