import { Prisma } from '@prisma/client';
import config from './config';
import { prisma } from './db';
import { fetchAircraft } from './sources/opensky';
import { AircraftEntry, AircraftRegion } from './types';

// Decide QUAIS aeronaves ficam no mapa e persiste posicao + trajeto. A busca
// e a traducao do dado bruto sao de sources/opensky.ts — aqui so entra regra
// de negocio.
//
// Regra pedida pelo usuario: no maximo 10 aeronaves, 5 de SP e 5 do RJ, e
// FIXAS — uma vez escolhida, a aeronave continua sendo seguida ate sair da
// area, e so entao a vaga e reposta. Sem isso o conjunto trocaria a cada
// ciclo e o rastro ficaria picotado (o rastro e justamente o que ele quis).

const REGIONS: AircraftRegion[] = ['SP', 'RJ'];

// Centro de cada regiao — usado so pra desempatar quem ocupa uma vaga livre:
// entre varios candidatos, entra o mais proximo do centro da cidade, nao um
// que ja esta de saida pela borda da caixa. Sao coordenadas de cidade, nao
// parametro de operacao, por isso constante e nao variavel de ambiente (o
// bounding box e o corte entre regioes, esses sim, sao configuraveis).
const REGION_CENTER: Record<AircraftRegion, { lat: number; lon: number }> = {
  SP: { lat: -23.5505, lon: -46.6333 },
  RJ: { lat: -22.9068, lon: -43.1729 },
};

// Distancia so pra ORDENAR (nao esta em metros). Corrige a longitude por
// cos(latitude): nesta faixa (~23 graus sul) um grau de longitude vale ~92%
// de um grau de latitude, e sem a correcao o ranking ficaria enviesado no
// sentido leste-oeste.
function distanceToCenter(entry: AircraftEntry): number {
  const center = REGION_CENTER[entry.region];
  const dLat = entry.latitude - center.lat;
  const dLon = (entry.longitude - center.lon) * Math.cos((center.lat * Math.PI) / 180);
  return dLat * dLat + dLon * dLon;
}

// region = null significa "nao mexer na vaga" (aeronave que ja estava sendo
// seguida): so a posicao e atualizada. Passar a regiao explicitamente e o
// que ocupa uma vaga nova.
async function upsertAircraft(
  tx: Prisma.TransactionClient,
  entry: AircraftEntry,
  region: AircraftRegion | null,
): Promise<number> {
  const now = new Date();
  const position = {
    callsign: entry.callsign,
    originCountry: entry.originCountry,
    latitude: entry.latitude,
    longitude: entry.longitude,
    altitude: entry.altitude,
    velocity: entry.velocity,
    trueTrack: entry.trueTrack,
    verticalRate: entry.verticalRate,
    onGround: entry.onGround,
    squawk: entry.squawk,
    positionAt: entry.positionAt,
    lastSeenAt: now,
    updatedAt: now,
  };

  const row = await tx.aircraft.upsert({
    where: { icao24: entry.icao24 },
    // O create so acontece pra aeronave entrando numa vaga nova (quem ja era
    // seguida tem linha) — o fallback pra entry.region cobre o caso teorico
    // de a linha ter sumido do banco entre um ciclo e outro.
    create: { icao24: entry.icao24, trackedRegion: region ?? entry.region, ...position },
    update: region == null ? position : { ...position, trackedRegion: region },
    select: { id: true },
  });

  return row.id;
}

export async function runAircraftCycle(): Promise<void> {
  const candidates = await fetchAircraft();
  const candidateByIcao = new Map(candidates.map((c) => [c.icao24, c]));

  const tracked = await prisma.aircraft.findMany({
    where: { trackedRegion: { not: null } },
    select: { id: true, icao24: true, trackedRegion: true },
  });

  // Uma aeronave ja seguida continua no mapa enquanto aparecer na resposta —
  // e a resposta ja vem filtrada pelo bounding box, entao "apareceu" equivale
  // a "ainda esta na area".
  //
  // A regiao NAO e reavaliada aqui, de proposito: trackedRegion e a VAGA que
  // a aeronave ocupa, nao onde ela esta neste instante. Se fosse reavaliada,
  // uma aeronave cruzando a longitude -45 sumiria do mapa por atravessar uma
  // fronteira invisivel (e com ela o rastro), e a divisao deixaria de ser
  // 5 e 5 — nada impediria as 5 vagas de SP migrarem todas pro RJ.
  const kept: AircraftEntry[] = [];
  const releasedIds: number[] = [];
  const keptIcaos = new Set<string>();

  for (const row of tracked) {
    const candidate = candidateByIcao.get(row.icao24);
    if (candidate == null) {
      releasedIds.push(row.id);
      continue;
    }
    kept.push(candidate);
    keptIcaos.add(row.icao24);
  }

  // Vagas livres, preenchidas por regiao com quem ainda nao esta sendo
  // seguido — mais proximo do centro primeiro.
  const incoming: AircraftEntry[] = [];
  for (const region of REGIONS) {
    const occupied = tracked.filter((r) => r.trackedRegion === region && keptIcaos.has(r.icao24)).length;
    const free = config.opensky.slotsPerRegion - occupied;
    if (free <= 0) continue;

    const chosen = candidates
      .filter((c) => c.region === region && !keptIcaos.has(c.icao24))
      .sort((a, b) => distanceToCenter(a) - distanceToCenter(b))
      .slice(0, free);

    incoming.push(...chosen);
  }

  await prisma.$transaction(async (tx) => {
    if (releasedIds.length > 0) {
      await tx.aircraft.updateMany({
        where: { id: { in: releasedIds } },
        data: { trackedRegion: null, updatedAt: new Date() },
      });
    }

    const historyRows: Prisma.AircraftPositionHistoryCreateManyInput[] = [];

    for (const entry of kept) {
      historyRows.push(buildHistoryRow(await upsertAircraft(tx, entry, null), entry));
    }
    for (const entry of incoming) {
      historyRows.push(buildHistoryRow(await upsertAircraft(tx, entry, entry.region), entry));
    }

    // skipDuplicates + a unique (aircraft_id, position_at) fazem o trabalho
    // que o ID do item do SharePoint faz no historico das vans: se a aeronave
    // nao reportou posicao nova entre dois ciclos, "time_position" repete e a
    // linha e descartada em vez de virar ponto duplicado no trajeto.
    if (historyRows.length > 0) {
      await tx.aircraftPositionHistory.createMany({ data: historyRows, skipDuplicates: true });
    }
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.opensky.historyRetentionDays);
  const deleted = await prisma.aircraftPositionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });

  // Aeronave solta (sem vaga) que nao aparece ha mais tempo que a retencao
  // nao volta a ser util: o historico dela ja foi expurgado acima e a linha
  // so acumularia. O cascade da FK cuida de qualquer ponto remanescente.
  // Sem isso a tabela cresceria pra sempre, ja que aeronave rotaciona muito
  // mais rapido que van (dezenas por dia, nao ~30 fixas).
  const staleAircraft = await prisma.aircraft.deleteMany({
    where: { trackedRegion: null, lastSeenAt: { lt: cutoff } },
  });

  console.log(
    `[sync-job] aeronaves ok — ${kept.length} mantida(s), ${incoming.length} nova(s), ${releasedIds.length} liberada(s); ` +
      `${deleted.count} ponto(s) expirado(s), ${staleAircraft.count} aeronave(s) antiga(s) removida(s)`,
  );
}

function buildHistoryRow(aircraftId: number, entry: AircraftEntry): Prisma.AircraftPositionHistoryCreateManyInput {
  return {
    aircraftId,
    latitude: entry.latitude,
    longitude: entry.longitude,
    altitude: entry.altitude,
    velocity: entry.velocity,
    trueTrack: entry.trueTrack,
    positionAt: entry.positionAt,
  };
}
