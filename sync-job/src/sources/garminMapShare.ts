// Rastreamento alternativo via Garmin inReach MapShare (2026-09-22) — feed
// KML PUBLICO e OFICIAL da Garmin (nao e engenharia reversa de API interna;
// "Feed/Share/{id}" e o endpoint documentado pra integracao de terceiros,
// ver https://share.garmin.com/{id} -> botao de compartilhar). Usado pro
// PT-WLO porque ela nao emite ADS-B (ou nao alcanca nenhum receptor de
// OpenSky/ADS-B Exchange/FlightRadar24 — confirmado 2026-09-22 testando as
// 3 redes ao mesmo tempo com a aeronave voando de verdade), mas a
// tripulacao carrega um inReach que reporta posicao via satelite Iridium,
// independente de transponder de radio.
//
// Estrutura do KML (confirmada contra o feed real, 2026-09-22): sempre 2
// <Placemark> — o primeiro e a posicao ATUAL (tem <TimeStamp> +
// <ExtendedData> com os campos abaixo), o segundo e uma LineString de
// trajeto (sem timestamp, nao usada aqui). So o primeiro Placemark importa.

const TIMEOUT_MS = 15000;

export interface GarminMapShareState {
  latitude: number;
  longitude: number;
  altitude: number | null; // metros — "Elevation" ja vem em MSL, mesmo referencial do resto do projeto
  velocity: number | null; // m/s — "Velocity" vem em km/h no feed, convertido aqui
  trueTrack: number | null; // graus — "Course"
  inEmergency: boolean;
  validGpsFix: boolean;
  positionAt: Date;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}

function extractExtendedDataValue(placemark: string, name: string): string | null {
  // <Data name="Elevation"><value>13775.60 m from MSL</value></Data>
  const re = new RegExp(`<Data name="${name}">\\s*<value>([\\s\\S]*?)<\\/value>\\s*<\\/Data>`);
  const match = placemark.match(re);
  return match ? match[1].trim() : null;
}

// "13775.60 m from MSL" -> 13775.60 / "721.9 km/h" -> 721.9 / "0.00 ° True" -> 0.00
function parseLeadingNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export async function fetchGarminMapShareState(shareId: string): Promise<GarminMapShareState | null> {
  const response = await fetch(`https://share.garmin.com/Feed/Share/${encodeURIComponent(shareId)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Garmin MapShare (${shareId}) retornou ${response.status}`);
  }
  const xml = await response.text();

  // So o 1o Placemark (posicao atual) — ver comentario no topo do arquivo.
  const firstPlacemarkMatch = xml.match(/<Placemark>([\s\S]*?)<\/Placemark>/);
  if (!firstPlacemarkMatch) return null;
  const placemark = firstPlacemarkMatch[1];

  const when = extractTag(placemark, 'when');
  const latitude = parseLeadingNumber(extractExtendedDataValue(placemark, 'Latitude'));
  const longitude = parseLeadingNumber(extractExtendedDataValue(placemark, 'Longitude'));
  if (!when || latitude == null || longitude == null) return null;

  const velocityKmh = parseLeadingNumber(extractExtendedDataValue(placemark, 'Velocity'));

  return {
    latitude,
    longitude,
    altitude: parseLeadingNumber(extractExtendedDataValue(placemark, 'Elevation')),
    velocity: velocityKmh != null ? velocityKmh / 3.6 : null,
    trueTrack: parseLeadingNumber(extractExtendedDataValue(placemark, 'Course')),
    inEmergency: extractExtendedDataValue(placemark, 'In Emergency') === 'True',
    validGpsFix: extractExtendedDataValue(placemark, 'Valid GPS Fix') === 'True',
    positionAt: new Date(when),
  };
}
