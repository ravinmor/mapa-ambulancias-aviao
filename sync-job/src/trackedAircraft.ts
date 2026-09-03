import config from './config';
import { prisma } from './db';
import {
  fetchTrackedAircraftState,
  fetchTrackedAircraftStateNear,
  TrackedAircraftState,
} from './sources/trackedAircraftSource';

// Ciclo das aeronaves especificas (N, uma por ICAO24 fixo) — pipeline
// PARALELO ao generico de aircraft.ts (que fica com o codigo intacto, so
// para de ser chamado em index.ts). Regra de negocio bem diferente da do
// generico: identidade fixa por aeronave, sem vaga/regiao, e NUNCA removida
// por sumir do ar — so marcada offline, mantendo a ultima posicao conhecida
// (pedido do usuario, elaboracao de 2026-09-01).
//
// Estrategia de custo/frequencia (elaborada com o usuario, 2026-09-02): ver
// o comentario grande em config.ts (TrackedAircraftConfig) pra conta
// completa. Resumo: cada aeronave e checada num intervalo PROPRIO,
// adaptativo — espacado enquanto esta no chao (idleSyncIntervalMs), curto
// enquanto esta voando (flightSyncIntervalMs) — e a busca em si usa uma
// caixa PEQUENA ao redor da ultima posicao conhecida sempre que possivel
// (barata, 1 credito), so caindo pra busca global (cara, 4 creditos) na 1a
// vez que uma aeronave e vista ou como resgate se a caixa pequena falhar.

// Sequencia FIXA de fases do voo — a ordem que a linha do tempo em arco do
// frontend (AmilTimelineArc.tsx) sempre segue, independente de quanto tempo
// cada fase dura. Heuristica provisoria a partir de altitude/velocidade
// vertical/on_ground, sem dado de plano de voo nenhum; ajustar limiares
// depois de ver o comportamento real desta aeronave.
export const STAGE_SEQUENCE = ['SOLO', 'DECOLAGEM', 'SUBIDA', 'CRUZEIRO', 'DESCIDA', 'APROXIMACAO', 'POUSO'] as const;
export type Stage = (typeof STAGE_SEQUENCE)[number];

const CLIMB_DESCENT_THRESHOLD_MS = 1.5; // m/s — abaixo disso e "nivelado", nao subindo/descendo
const APPROACH_ALTITUDE_M = 600; // abaixo disso, ja conta como aproximacao/pouso
const CRUISE_ALTITUDE_M = 3000; // acima disso com voo nivelado = cruzeiro

function deriveStage(previous: Stage | null, state: TrackedAircraftState): Stage {
  const { onGround, altitude, verticalRate } = state;
  const alt = altitude ?? 0;
  const vRate = verticalRate ?? 0;

  if (onGround) {
    // So conta como "pouso" a transicao vinda de fase aerea — chegar no solo
    // ja estando no solo (ou primeira leitura) e so "solo", sem drama.
    return previous && previous !== 'SOLO' && previous !== 'POUSO' ? 'POUSO' : 'SOLO';
  }

  let candidate: Stage;
  if (alt <= APPROACH_ALTITUDE_M) candidate = 'APROXIMACAO';
  else if (vRate < -CLIMB_DESCENT_THRESHOLD_MS) candidate = 'DESCIDA';
  else if (alt >= CRUISE_ALTITUDE_M) candidate = 'CRUZEIRO';
  // "Nivelado" (|vRate| dentro do limiar) sem altitude de cruzeiro: SO conta
  // como SUBIDA na 1a classificacao (decolagem saindo do chao). Antes isso
  // era o fallback pra QUALQUER nivelamento, inclusive no meio de uma
  // descida em degraus (nivel intermediario do controle de trafego, ou so
  // ruido do dado) — reportado pelo usuario, 2026-09-03: estagio "regredia"
  // de DESCIDA pra SUBIDA nesse momento.
  else candidate = 'SUBIDA';

  // A sequencia so anda pra FRENTE enquanto a aeronave esta no ar — nivelar
  // ou oscilar a taxa vertical no meio do voo nao pode fazer o estagio
  // voltar. SOLO/POUSO continuam resetando via o ramo onGround acima, entao
  // "previous" aqui e sempre do MESMO voo (nunca sobra de um voo anterior).
  if (previous && previous !== 'SOLO' && previous !== 'POUSO') {
    if (STAGE_SEQUENCE.indexOf(candidate) < STAGE_SEQUENCE.indexOf(previous)) {
      return previous;
    }
  }
  return candidate;
}

// Velocidade maxima plausivel de qualquer aeronave monitorada — usada so pra
// DIMENSIONAR a caixa de busca com folga de seguranca, nao como medida real
// (bem acima de cruzeiro comercial tipico, ~900km/h, pra cobrir jato
// executivo rapido + qualquer erro de estimativa).
const MAX_SPEED_KMH = 1000;
const KM_PER_DEGREE = 111; // aproximacao — a caixa e folga, nao precisao geodesica
// Minimo: cobre ruido de GPS/arredondamento e o proprio deslocamento da
// decolagem, mesmo se o intervalo decorrido for bem curto.
const MIN_BOX_DEGREES = 0.6;
// Maximo: acima disso a caixa ja fica grande/cara o bastante que ir direto
// pra busca global (fetchTrackedAircraftState) para de fazer diferenca real
// de custo — nao vale a complexidade de uma caixa gigante.
const MAX_BOX_DEGREES = 6;

// Meia-largura da caixa de busca, a partir de quanto tempo passou desde a
// ultima checagem desta aeronave — quanto mais tempo parado sem checar, mais
// longe ela pode ter ido, maior a caixa precisa ser pra ainda encontrar.
function boxDegreesFor(elapsedMs: number): number {
  const elapsedHours = elapsedMs / 3_600_000;
  const km = MAX_SPEED_KMH * elapsedHours;
  const degrees = km / KM_PER_DEGREE;
  return Math.min(Math.max(degrees, MIN_BOX_DEGREES), MAX_BOX_DEGREES);
}

// Rumo (trueTrack) as vezes vem incoerente com a posicao — mensagens de
// posicao e de velocidade/rumo chegam de fontes/receptores diferentes no
// ADS-B crowdsourced, e podem se dessincronizar (reportado pelo usuario,
// 2026-09-03: aeronave em descida reta pro sudeste, mas o rumo reportado
// apontava quase pro lado oposto — o icone e a ponta do trajeto pareciam
// mostrar uma curva de 180 graus que nunca aconteceu; o HISTORICO real de
// posicao, sem esse campo, mostrava uma reta continua).
//
// Correcao: SEMPRE que da pra comparar (ha posicao anterior conhecida e
// deslocamento grande o suficiente pra o rumo geometrico ser confiavel, nao
// ruido de GPS parado), calcula o rumo observado entre a posicao anterior e
// a nova — se ele diverge demais do rumo que o OpenSky reportou, usa o
// observado no lugar. Roda de novo TODO ciclo, com dado fresco — sem
// bandeira nem estado persistido pra "modo corrigido": no ciclo em que o
// rumo reportado voltar a bater com a posicao, a checagem passa sozinha e o
// valor real volta a ser usado (pedido do usuario: "quando o rumo se
// acertar, o mapa corrigir" — sem isso, e exatamente o que ja acontece).
const MIN_DISPLACEMENT_KM_FOR_BEARING_CHECK = 0.5; // abaixo disso, ruido de GPS domina o rumo geometrico
const TRUETRACK_MISMATCH_THRESHOLD_DEG = 90; // vento/deriva real nunca chega perto disso

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function resolveTrueTrack(
  existing: { latitude: number | null; longitude: number | null } | null,
  state: TrackedAircraftState,
): number | null {
  if (state.trueTrack == null || existing?.latitude == null || existing?.longitude == null) {
    return state.trueTrack;
  }
  const displacementKm =
    Math.hypot(state.latitude - existing.latitude, state.longitude - existing.longitude) * KM_PER_DEGREE;
  if (displacementKm < MIN_DISPLACEMENT_KM_FOR_BEARING_CHECK) return state.trueTrack;

  const observedBearing = bearingBetween(existing.latitude, existing.longitude, state.latitude, state.longitude);
  if (angleDiff(state.trueTrack, observedBearing) > TRUETRACK_MISMATCH_THRESHOLD_DEG) {
    return observedBearing;
  }
  return state.trueTrack;
}

// Verifica (e, se for a hora, busca) 1 aeronave. Cada uma decide sozinha se
// ja esta na hora dela — por isso o "scanner" que chama isto pode rodar bem
// mais frequente (scannerIntervalMs) sem gastar credito: a maioria dos
// ticks, pra maioria das aeronaves, essa funcao volta sem chamar o OpenSky
// nenhuma vez.
async function checkOne(icao24: string): Promise<void> {
  const existing = await prisma.trackedAircraft.findUnique({ where: { icao24 } });
  const now = new Date();

  // "Estava voando" = a ultima leitura tinha ela no ar. Decide qual dos 2
  // intervalos vale pra ESTA aeronave neste tick.
  const wasFlying = existing?.isOnline === true && existing.onGround === false;
  const interval = wasFlying ? config.trackedAircraft.flightSyncIntervalMs : config.trackedAircraft.idleSyncIntervalMs;

  // updatedAt e sempre escrito (ache ou nao ache, ver upserts abaixo) —
  // reaproveitado aqui como "quando foi a ultima checagem", sem precisar de
  // coluna nova so pra isso.
  const lastCheckedAt = existing?.updatedAt ?? null;
  const elapsedMs = lastCheckedAt ? now.getTime() - lastCheckedAt.getTime() : Number.POSITIVE_INFINITY;
  if (elapsedMs < interval) return; // ainda nao e a hora desta aeronave

  let state: TrackedAircraftState | null;
  if (existing?.latitude != null && existing?.longitude != null) {
    const boxDegrees = boxDegreesFor(elapsedMs);
    state = await fetchTrackedAircraftStateNear(icao24, existing.latitude, existing.longitude, boxDegrees);
    // Resgate: nao achou na caixa pequena (rota mudou mais que o esperado,
    // ou um ciclo anterior falhou e a caixa calculada ficou pequena demais)
    // — tenta 1x global antes de marcar offline.
    if (!state) {
      state = await fetchTrackedAircraftState(icao24);
    }
  } else {
    // 1a vez vendo esta aeronave — sem posicao anterior pra centralizar
    // caixa nenhuma, so da pra ser busca global mesmo.
    state = await fetchTrackedAircraftState(icao24);
  }

  if (!state) {
    // Nao apareceu neste ciclo: mantem lat/lon/altitude como estavam (ultima
    // posicao conhecida), so marca offline — nunca deleta, nunca zera
    // posicao (pedido explicito do usuario).
    await prisma.trackedAircraft.upsert({
      where: { icao24 },
      create: { icao24, isOnline: false },
      update: { isOnline: false, updatedAt: now },
    });
    console.log(`[sync-job] aeronave monitorada (${icao24}) nao apareceu neste ciclo — mantendo ultima posicao conhecida`);
    return;
  }

  const stage = deriveStage((existing?.stage as Stage | null) ?? null, state);
  const trueTrack = resolveTrueTrack(existing, state);
  const position = {
    callsign: state.callsign,
    latitude: state.latitude,
    longitude: state.longitude,
    altitude: state.altitude,
    velocity: state.velocity,
    trueTrack,
    verticalRate: state.verticalRate,
    onGround: state.onGround,
    squawk: state.squawk,
    stage,
    isOnline: true,
    positionAt: state.positionAt,
    lastSeenAt: now,
  };

  const row = await prisma.trackedAircraft.upsert({
    where: { icao24 },
    create: { icao24, ...position },
    update: { ...position, updatedAt: now },
    select: { id: true },
  });

  // Trajeto (pedido do usuario, 2026-09-02: "trajeto de avioes do mapa de
  // ambulancias completo, inclusive com diferenciacao de altitude por
  // cor") — mesmo esquema do pipeline generico (TrackedAircraftPositionHistory
  // espelha AircraftPositionHistory). skipDuplicates cobre o caso de
  // time_position repetido entre ciclos (aeronave nao reportou posicao
  // nova), sem precisar checar isso na mao.
  await prisma.trackedAircraftPositionHistory.createMany({
    data: [
      {
        trackedAircraftId: row.id,
        latitude: state.latitude,
        longitude: state.longitude,
        altitude: state.altitude,
        velocity: state.velocity,
        trueTrack: state.trueTrack,
        positionAt: state.positionAt,
      },
    ],
    skipDuplicates: true,
  });

  console.log(
    `[sync-job] aeronave monitorada (${icao24}) ok — fase: ${stage}, alt: ${Math.round(state.altitude ?? 0)}m, vel: ${Math.round((state.velocity ?? 0) * 3.6)}km/h`,
  );
}

export async function runTrackedAircraftCycle(): Promise<void> {
  for (const icao24 of config.trackedAircraft.icao24List) {
    try {
      await checkOne(icao24);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sync-job] erro na aeronave monitorada (${icao24}):`, message);
    }
  }

  // Retencao do trajeto — mesma ideia do pipeline generico, 1 unica limpeza
  // por ciclo do scanner (nao por aeronave, sem necessidade).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.trackedAircraft.historyRetentionDays);
  await prisma.trackedAircraftPositionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });
}
