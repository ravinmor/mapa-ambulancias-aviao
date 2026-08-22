import config from '../config';
import { AircraftEntry, AircraftRegion } from '../types';
import fixture from './opensky.fixture.json';

// Cliente do OpenSky Network — funcao propria, escrita do zero a pedido do
// usuario. Existe um pacote proprio dele ("sky-watcher", em
// D:\Claude\Command-SI\sky-watcher) que consome a mesma API; dele foi
// reaproveitado apenas o CONHECIMENTO do formato da resposta (o mapeamento
// indice->campo abaixo, que ele documenta campo a campo), nao o codigo: aquele
// pacote depende de node-fetch (desnecessario, o Node daqui tem fetch nativo),
// monta a URL de forma quebrada (concatena os valores sem os nomes dos
// parametros) e nao tem timeout — justamente o bug que ja travou o loop de
// historico deste projeto.
//
// Responsabilidade deste arquivo: buscar, validar e traduzir. Ele NAO decide
// quais aeronaves ficam no mapa — isso e das vagas por regiao em aircraft.ts.

// A API devolve cada aeronave como ARRAY POSICIONAL, nao como objeto: os
// indices abaixo sao o contrato. Reconferidos contra a resposta real em
// 2026-08-22. Os indices 12 (sensors), 15 (spi) e 16 (position_source)
// existem mas nao sao usados aqui.
const IDX = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
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
  // Vem null (nao array vazio) quando nada e encontrado na area — tratar
  // como lista vazia em vez de estourar.
  states: RawState[] | null;
}

// Mesmo motivo do FLOW_TIMEOUT_MS em sharepoint.ts: sem timeout, uma chamada
// que nunca responde deixa o fetch pendurado pra sempre, e como startLoop
// (index.ts) so agenda o proximo tick DEPOIS do atual terminar, isso trava o
// loop inteiro permanentemente — nao so aquele ciclo. Bug real ja visto em
// producao neste projeto.
const OPENSKY_TIMEOUT_MS = 20000;

// Abaixo disso, a cota diaria esta acabando e o mapa vai congelar ate a
// virada do dia. Vale aparecer no log antes de o usuario notar pela tela.
const LOW_CREDIT_WARNING = 50;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

// A API ja filtra pelo bounding box, mas reconferir aqui e barato e cobre
// dois casos reais: bounding box mal configurado por variavel de ambiente, e
// o modo fixture (amostra estatica que pode nao casar com a caixa atual).
function toRegion(latitude: number, longitude: number): AircraftRegion | null {
  const { lamin, lamax, lomin, lomax, regionSplitLon } = config.opensky;
  if (latitude < lamin || latitude > lamax) return null;
  if (longitude < lomin || longitude > lomax) return null;
  // Oeste do corte = SP (Sao Paulo esta em -46.6), leste = RJ (-43.2).
  return longitude < regionSplitLon ? 'SP' : 'RJ';
}

function toEntry(raw: RawState): AircraftEntry | null {
  const icao24 = toStringOrNull(raw[IDX.icao24]);
  const latitude = toNumber(raw[IDX.latitude]);
  const longitude = toNumber(raw[IDX.longitude]);
  if (!icao24 || latitude == null || longitude == null) return null;

  const region = toRegion(latitude, longitude);
  if (region == null) return null;

  // Regra confirmada pelo usuario: barometrica primeiro, geometrica (GPS)
  // como fallback, e aeronave sem NENHUMA das duas nao entra no mapa. Note
  // que nao filtramos por on_ground — aeronave no solo pode aparecer (tambem
  // decisao dele); na pratica quase toda aeronave no solo cai por esta regra
  // de altitude, nao por estar no chao.
  const altitude = toNumber(raw[IDX.baroAltitude]) ?? toNumber(raw[IDX.geoAltitude]);
  if (altitude == null) return null;

  // "time_position" e o timestamp do fix de posicao. Quando falta,
  // "last_contact" (qualquer mensagem valida do transponder) e a melhor
  // aproximacao disponivel; sem nenhum dos dois nao da pra ordenar o trajeto
  // nem deduplicar o historico, entao descarta.
  const positionSeconds = toNumber(raw[IDX.timePosition]) ?? toNumber(raw[IDX.lastContact]);
  if (positionSeconds == null) return null;

  // A origem manda o callsign preenchido com espacos a direita ate 8
  // caracteres (25 de 25 na amostra real) — sem o trim, a interface mostra
  // "AZU4449 " e qualquer alinhamento de texto quebra. String vazia depois
  // do trim vira null: e "sem callsign", nao callsign em branco.
  const callsign = toStringOrNull(raw[IDX.callsign])?.trim() || null;

  return {
    icao24,
    callsign,
    originCountry: toStringOrNull(raw[IDX.originCountry]),
    region,
    latitude,
    longitude,
    altitude,
    velocity: toNumber(raw[IDX.velocity]),
    trueTrack: toNumber(raw[IDX.trueTrack]),
    verticalRate: toNumber(raw[IDX.verticalRate]),
    onGround: raw[IDX.onGround] === true,
    squawk: toStringOrNull(raw[IDX.squawk]),
    // A origem manda em SEGUNDOS desde a epoca; Date espera milissegundos.
    positionAt: new Date(positionSeconds * 1000),
  };
}

async function fetchStates(): Promise<RawState[]> {
  if (config.opensky.source === 'fixture') {
    return (fixture.states ?? []) as RawState[];
  }

  const target = new URL(config.opensky.url);
  target.searchParams.set('lamin', String(config.opensky.lamin));
  target.searchParams.set('lomin', String(config.opensky.lomin));
  target.searchParams.set('lamax', String(config.opensky.lamax));
  target.searchParams.set('lomax', String(config.opensky.lomax));

  const response = await fetch(target.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(OPENSKY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenSky retornou ${response.status}: ${await response.text()}`);
  }

  // A propria resposta diz quanto sobrou da cota diaria — como o limite e
  // baixo (400) e o acesso e anonimo, e o unico jeito de acompanhar isso sem
  // adivinhar.
  const remaining = toNumber(response.headers.get('x-rate-limit-remaining'));
  if (remaining != null && remaining <= LOW_CREDIT_WARNING) {
    console.warn(`[opensky] cota diaria acabando: ${remaining} credito(s) restante(s)`);
  }

  const body = (await response.json()) as OpenSkyResponse;
  const states = body.states ?? [];
  console.log(`[opensky] ${states.length} aeronave(s) na area, ${remaining ?? '?'} credito(s) restante(s)`);
  return states;
}

export async function fetchAircraft(): Promise<AircraftEntry[]> {
  const states = await fetchStates();

  const entries: AircraftEntry[] = [];
  for (const raw of states) {
    const entry = toEntry(raw);
    if (entry != null) entries.push(entry);
  }

  const discarded = states.length - entries.length;
  if (discarded > 0) {
    console.log(`[opensky] ${discarded} aeronave(s) descartada(s) (sem altitude, sem posicao ou fora das regioes)`);
  }

  return entries;
}
