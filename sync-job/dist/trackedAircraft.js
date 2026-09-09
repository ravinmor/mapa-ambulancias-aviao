"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGE_SEQUENCE = void 0;
exports.runTrackedAircraftCycle = runTrackedAircraftCycle;
const config_1 = __importDefault(require("./config"));
const db_1 = require("./db");
const trackedAircraftSource_1 = require("./sources/trackedAircraftSource");
const adsbdbSource_1 = require("./sources/adsbdbSource");
const openskyFlightsSource_1 = require("./sources/openskyFlightsSource");
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
exports.STAGE_SEQUENCE = ['SOLO', 'DECOLAGEM', 'SUBIDA', 'CRUZEIRO', 'DESCIDA', 'APROXIMACAO', 'POUSO'];
const CLIMB_DESCENT_THRESHOLD_MS = 1.5; // m/s — abaixo disso e "nivelado", nao subindo/descendo
const CRUISE_ALTITUDE_M = 3000; // acima disso com voo nivelado = cruzeiro
// APROXIMACAO por PROXIMIDADE do destino, nao mais por altitude (pedido do
// usuario, 2026-09-08: "eu quero que o aproximacao nao seja por altura e
// sim por proximidade, assim que estiver <=25km deve entrar em
// aproximacao") — troca o antigo "alt <= 600m". Motivo: altitude sozinha
// nao sabia distinguir "baixo mas longe do destino" (ex: sobrevoando outra
// regiao a baixa altitude) de "baixo E perto de pousar", e nao dava pra
// escalonar o recheck rapido por distancia de verdade. APPROACH_PROXIMITY_KM
// (usado tambem pro recheck, ver abaixo) agora e o UNICO gatilho de entrada
// no estagio.
function deriveStage(previous, state, distanceToDestinationKm) {
    const { onGround, altitude, verticalRate } = state;
    const alt = altitude ?? 0;
    const vRate = verticalRate ?? 0;
    if (onGround) {
        // So conta como "pouso" a transicao vinda de fase aerea — chegar no solo
        // ja estando no solo (ou primeira leitura) e so "solo", sem drama.
        return previous && previous !== 'SOLO' && previous !== 'POUSO' ? 'POUSO' : 'SOLO';
    }
    let candidate;
    if (distanceToDestinationKm != null && distanceToDestinationKm <= APPROACH_PROXIMITY_KM)
        candidate = 'APROXIMACAO';
    else if (vRate < -CLIMB_DESCENT_THRESHOLD_MS)
        candidate = 'DESCIDA';
    else if (alt >= CRUISE_ALTITUDE_M)
        candidate = 'CRUZEIRO';
    // "Nivelado" (|vRate| dentro do limiar) sem altitude de cruzeiro: SO conta
    // como SUBIDA na 1a classificacao (decolagem saindo do chao). Antes isso
    // era o fallback pra QUALQUER nivelamento, inclusive no meio de uma
    // descida em degraus (nivel intermediario do controle de trafego, ou so
    // ruido do dado) — reportado pelo usuario, 2026-09-03: estagio "regredia"
    // de DESCIDA pra SUBIDA nesse momento.
    else
        candidate = 'SUBIDA';
    // A sequencia so anda pra FRENTE enquanto a aeronave esta no ar — nivelar
    // ou oscilar a taxa vertical no meio do voo nao pode fazer o estagio
    // voltar. SOLO/POUSO continuam resetando via o ramo onGround acima, entao
    // "previous" aqui e sempre do MESMO voo (nunca sobra de um voo anterior).
    if (previous && previous !== 'SOLO' && previous !== 'POUSO') {
        if (exports.STAGE_SEQUENCE.indexOf(candidate) < exports.STAGE_SEQUENCE.indexOf(previous)) {
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
function boxDegreesFor(elapsedMs) {
    const elapsedHours = elapsedMs / 3_600_000;
    const km = MAX_SPEED_KMH * elapsedHours;
    const degrees = km / KM_PER_DEGREE;
    return Math.min(Math.max(degrees, MIN_BOX_DEGREES), MAX_BOX_DEGREES);
}
// Checagem mais RAPIDA perto do pouso (pedido do usuario, 2026-09-04, item
// 3: "aplique o 1 2 e 3" da analise de dead reckoning) — uma aeronave em
// fase final perto do destino conhecido pode pousar a qualquer momento; o
// intervalo normal de "voando" (5min) deixava a extrapolacao do frontend
// "voando" reto por cima do aeroporto por minutos antes da proxima checagem
// real confirmar o pouso. Distancia aproximada (nao geodesica precisa, so
// pra decidir "perto o bastante", mesmo espirito de boxDegreesFor acima).
//
// 15km -> 25km (pedido do usuario, 2026-09-04, bug real visto ao vivo:
// GLO perto de Congonhas sumiu de sinal FORA do raio antigo, e nos 5min
// ate a proxima checagem normal ela ja tinha pousado ha muito — o dead
// reckoning "voou" reto por cima do aeroporto e continuou por dezenas de
// km alem, ate perto de Pilar do Sul, sem nenhuma checagem real no meio
// pra corrigir. "5km às vezes é 30s de voo": em velocidade de aproximacao
// (250-400km/h), 15km somem em 2-4min — perto demais do proprio intervalo
// de 5min pra garantir uma checagem real ANTES do pouso.
// 3 tiers de recheck dentro da aproximacao (pedido do usuario, 2026-09-08):
// 45s ate 40km, 30s ate 25km, 2s ate 10km — quanto mais perto, mais vale a
// pena gastar chamada extra pra pegar o pouso quase em tempo real. O tier
// mais externo (40km/45s) e TAMBEM o limiar que define o proprio estagio
// APROXIMACAO, ver deriveStage acima.
const APPROACH_PROXIMITY_KM = 40;
const APPROACH_MID_PROXIMITY_KM = 25;
const APPROACH_CLOSE_PROXIMITY_KM = 10;
const APPROACH_RECHECK_INTERVAL_MS = 45_000;
const APPROACH_MID_RECHECK_INTERVAL_MS = 30_000;
const APPROACH_CLOSE_RECHECK_INTERVAL_MS = 2_000;
// Folga de "quantos recheck's atrasados" pra considerar uma posicao
// "estagnada" (mesmo fix repetido) — ESCALONADA pelo tier atual de
// distancia (pedido do usuario, 2026-09-08: "com esses novos tiers, da pra
// melhorar o algoritmo de identificar se ja pousou?"). Antes era um unico
// valor fixo (2x o tier mais LENTO, 90s) pra qualquer distancia — o que
// desperdicava o proprio motivo do tier de 2s existir: a 10km, rechecar a
// cada 2s so pra ainda esperar 90s de confirmacao e inutil, quase todo
// mundo pousa bem antes disso. Perto (<=10km) confirma quase na hora (poucos
// segundos); mais longe, mantem folga maior (a leitura ainda pode ser so
// ruido/gap temporario de sinal, nao pouso de verdade).
function staleLandedThresholdMs(distanceKm) {
    if (distanceKm <= APPROACH_CLOSE_PROXIMITY_KM)
        return APPROACH_CLOSE_RECHECK_INTERVAL_MS * 3; // ~6s
    if (distanceKm <= APPROACH_MID_PROXIMITY_KM)
        return APPROACH_MID_RECHECK_INTERVAL_MS * 2; // 60s
    return APPROACH_RECHECK_INTERVAL_MS * 2; // 90s
}
function classifyApproachTier(approachDistance, wasFlying) {
    if (approachDistance != null && approachDistance <= APPROACH_CLOSE_PROXIMITY_KM) {
        return { tier: '<=10km', intervalMs: APPROACH_CLOSE_RECHECK_INTERVAL_MS };
    }
    if (approachDistance != null && approachDistance <= APPROACH_MID_PROXIMITY_KM) {
        return { tier: '10-25km', intervalMs: APPROACH_MID_RECHECK_INTERVAL_MS };
    }
    if (approachDistance != null && approachDistance <= APPROACH_PROXIMITY_KM) {
        return { tier: '25-40km', intervalMs: APPROACH_RECHECK_INTERVAL_MS };
    }
    return wasFlying
        ? { tier: '>40km', intervalMs: config_1.default.trackedAircraft.flightSyncIntervalMs }
        : { tier: '>40km', intervalMs: config_1.default.trackedAircraft.idleSyncIntervalMs };
}
function distanceKm(lat1, lon1, lat2, lon2) {
    const deltaLatKm = (lat1 - lat2) * KM_PER_DEGREE;
    const deltaLonKm = (lon1 - lon2) * KM_PER_DEGREE * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(deltaLatKm, deltaLonKm);
}
// Distancia ate o destino usando a ULTIMA posicao conhecida (existing) —
// null se a aeronave nao esta em APROXIMACAO ou falta posicao/destino.
// So checa o estagio APROXIMACAO agora (DESCIDA saiu — sem o gatilho de
// altitude antigo, DESCIDA deixou de implicar "perto", pode ser descida de
// cruzeiro bem longe ainda).
function approachDistanceKm(existing) {
    if (existing?.stage !== 'APROXIMACAO')
        return null;
    if (existing.latitude == null || existing.longitude == null)
        return null;
    if (existing.destinationLatitude == null || existing.destinationLongitude == null)
        return null;
    return distanceKm(existing.latitude, existing.longitude, existing.destinationLatitude, existing.destinationLongitude);
}
function isNearDestinationInApproach(existing) {
    const d = approachDistanceKm(existing);
    return d != null && d <= APPROACH_PROXIMITY_KM;
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
function bearingBetween(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return ((θ * 180) / Math.PI + 360) % 360;
}
function angleDiff(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
}
function resolveTrueTrack(existing, state) {
    if (state.trueTrack == null || existing?.latitude == null || existing?.longitude == null) {
        return state.trueTrack;
    }
    const displacementKm = Math.hypot(state.latitude - existing.latitude, state.longitude - existing.longitude) * KM_PER_DEGREE;
    if (displacementKm < MIN_DISPLACEMENT_KM_FOR_BEARING_CHECK)
        return state.trueTrack;
    const observedBearing = bearingBetween(existing.latitude, existing.longitude, state.latitude, state.longitude);
    if (angleDiff(state.trueTrack, observedBearing) > TRUETRACK_MISMATCH_THRESHOLD_DEG) {
        return observedBearing;
    }
    return state.trueTrack;
}
// Deteccao de decolagem/pouso — R-21, pedido do usuario 2026-09-03: "o
// Command usara isso pra criar um alerta [...] precisa ser robusto". Por
// isso e SEPARADA de deriveStage() (que so alimenta o arco cosmetico e
// reage numa leitura so): aqui, uma transicao so vira oficial
// (flightStartedAt/flightEndedAt) depois de 2 LEITURAS REAIS CONSECUTIVAS
// concordando — uma leitura isolada de on_ground ruidoso (comum em ADS-B
// crowdsourced, ver tambem o bug do trueTrack corrigido hoje) fica presa
// como candidata (pending*At) e e descartada sem alarme se a leitura
// seguinte nao confirmar.
//
// "Parece no ar" exige onGround:false E (altitude > 30m OU velocidade >
// 20m/s ~ 72km/h) — o 2o criterio filtra o caso mais comum de leitura ruim:
// on_ground oscilando por 1 instante com altitude/velocidade ainda perto de
// zero (taxi, ruido do transponder). Na decolagem de verdade a velocidade ja
// passa bem disso no instante do "rodas no ar", entao nao atrasa deteccao
// real nenhuma.
const AIRBORNE_MIN_ALTITUDE_M = 30;
const AIRBORNE_MIN_VELOCITY_MS = 20;
// Historico de voos passados (R-31 cont., pedido do usuario 2026-09-04) —
// intervalo entre syncs (nao vale a pena mais frequente: rotas passadas nao
// mudam, e o endpoint da OpenSky tem janela curta por chamada) e quanto
// tempo pra tras cobrir na 1a sync de uma aeronave nova (sem historico
// nenhum ainda). fetchRecentFlights corta sozinho pro maximo que a OpenSky
// aceita numa unica chamada (~2 dias) — BACKFILL maior que isso so significa
// que a 1a sync cobre so os ultimos ~2 dias mesmo, sem historico profundo.
const HISTORY_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const HISTORY_BACKFILL_SECONDS = 30 * 24 * 3600; // 30 dias (na pratica, corta pra ~2 dias na 1a chamada)
function resolveFlightTiming(existing, state) {
    const looksAirborne = !state.onGround && ((state.altitude ?? 0) > AIRBORNE_MIN_ALTITUDE_M || (state.velocity ?? 0) > AIRBORNE_MIN_VELOCITY_MS);
    // O estado "ja confirmado voando" TEM que vir de flightStartedAt/
    // flightEndedAt (o que ja foi OFICIALMENTE comprometido), NUNCA do
    // existing.onGround bruto — esse campo e reescrito TODO ciclo com a
    // leitura crua, independente de confirmacao (serve pro marcador/estagio/
    // intervalo de polling, que reagem numa leitura so de proposito). Usar
    // onGround aqui foi um bug real (2026-09-03): a 1a leitura no ar virava
    // candidata (pendingDepartureAt) mas TAMBEM ja gravava onGround:false no
    // upsert principal — entao na 2a leitura (a que deveria CONFIRMAR) o
    // codigo lia existing.onGround=false e concluia "ja estava confirmado
    // voando", pulando a confirmacao e deixando o candidato preso pra sempre
    // (reproduzido ao vivo: TAM3144 decolou, cruzou o pais inteiro e comecou
    // a descer com flightStartedAt ainda null).
    const isConfirmedAirborne = existing?.flightStartedAt != null && existing?.flightEndedAt == null;
    if (looksAirborne) {
        if (isConfirmedAirborne) {
            // Ja voando (confirmado) e continua — nada muda, so limpa candidato
            // de pouso que tenha sobrado de uma leitura ruidosa anterior.
            return existing?.pendingArrivalAt ? { pendingArrivalAt: null } : {};
        }
        if (existing?.pendingDepartureAt) {
            // 2a leitura real seguida confirmando "no ar" -> comprometeu, com o
            // horario da 1a leitura (mais preciso que o da confirmacao).
            return { flightStartedAt: existing.pendingDepartureAt, flightEndedAt: null, pendingDepartureAt: null };
        }
        // 1a leitura "no ar" (ou 1a vez vendo esta aeronave ja voando, sem
        // saber quando decolou de verdade) — so marca candidata, nao inventa
        // flightStartedAt=agora.
        return { pendingDepartureAt: state.positionAt, pendingArrivalAt: null };
    }
    // Nao parece no ar (no chao, ou fraco demais pra contar).
    if (!isConfirmedAirborne) {
        // Nao estava confirmado voando (no chao, ou so tinha candidato pendente
        // que nao se repetiu) — limpa candidato de decolagem que tenha sobrado.
        return existing?.pendingDepartureAt ? { pendingDepartureAt: null } : {};
    }
    if (existing?.pendingArrivalAt) {
        // 2a leitura real seguida confirmando "no chao" -> pouso oficial.
        return { flightEndedAt: existing.pendingArrivalAt, pendingArrivalAt: null, pendingDepartureAt: null };
    }
    // 1a leitura "no chao" depois de estar voando — so marca candidata.
    return { pendingArrivalAt: state.positionAt, pendingDepartureAt: null };
}
// Matricula/fabricante/modelo/operador (R-17, pedido do usuario 2026-09-04:
// "adicione o adsbdb pra pegar informacoes da aeronave") — buscados so 1 VEZ
// por aeronave (nao muda) via adsbdb.com, substituindo o endpoint de
// metadados do OpenSky (descontinuado, 410 Gone). INDEPENDENTE de "state"
// (a aeronave estar online neste ciclo) de proposito — bug real corrigido
// 2026-09-04: antes esse fetch vivia dentro do bloco que so roda quando a
// aeronave APARECE no ciclo, entao uma aeronave que pousa/fica offline logo
// depois de entrar na lista nunca tinha chance de ganhar seus metadados.
// Erro aqui NAO pode derrubar o ciclo desta aeronave — so loga.
async function syncAircraftMetadata(icao24, existing) {
    if (existing?.registration)
        return;
    try {
        const metadata = await (0, adsbdbSource_1.fetchAdsbdbAircraft)(icao24);
        if (metadata) {
            await db_1.prisma.trackedAircraft.update({ where: { icao24 }, data: metadata });
            console.log(`[sync-job] aeronave monitorada (${icao24}) metadados encontrados (adsbdb): ${metadata.registration ?? '?'} / ${metadata.model ?? '?'}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sync-job] erro buscando metadados (adsbdb) da aeronave monitorada (${icao24}):`, message);
    }
}
// Historico de voos PASSADOS (R-31 cont., pedido do usuario 2026-09-04:
// "pegue a origem destino de voos passados... vindos do opensky") —
// intervalo PROPRIO (nao todo ciclo) e, pelo MESMO motivo do
// syncAircraftMetadata acima, INDEPENDENTE de "state" — so precisa do
// icao24 e do id da linha, nao da posicao atual.
async function syncFlightHistory(icao24, trackedAircraftId, existing, now) {
    const historyElapsedMs = existing?.historySyncedAt ? now.getTime() - existing.historySyncedAt.getTime() : Number.POSITIVE_INFINITY;
    if (historyElapsedMs < HISTORY_SYNC_INTERVAL_MS)
        return;
    try {
        // sinceSeconds = desde a ultima sync (ou HISTORY_BACKFILL_SECONDS atras
        // se nunca sincronizou) — fetchRecentFlights corta sozinho pro maximo
        // que a OpenSky aceita numa chamada so, entao a 1a sync de uma aeronave
        // nova so cobre a janela mais recente (sem backfill profundo).
        const sinceSeconds = existing?.historySyncedAt
            ? Math.floor(existing.historySyncedAt.getTime() / 1000)
            : Math.floor(now.getTime() / 1000) - HISTORY_BACKFILL_SECONDS;
        const legs = await (0, openskyFlightsSource_1.fetchRecentFlights)(icao24, sinceSeconds);
        if (legs.length > 0) {
            await db_1.prisma.trackedAircraftFlightHistory.createMany({
                data: legs.map((leg) => ({
                    trackedAircraftId,
                    callsign: leg.callsign,
                    departureIcao: leg.departureIcao,
                    arrivalIcao: leg.arrivalIcao,
                    departedAt: leg.departedAt,
                    arrivedAt: leg.arrivedAt,
                })),
                skipDuplicates: true,
            });
            console.log(`[sync-job] aeronave monitorada (${icao24}) historico de voos: ${legs.length} perna(s) sincronizada(s)`);
        }
        await db_1.prisma.trackedAircraft.update({ where: { icao24 }, data: { historySyncedAt: now } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sync-job] erro sincronizando historico de voos da aeronave monitorada (${icao24}):`, message);
    }
}
// Verifica (e, se for a hora, busca) 1 aeronave. Cada uma decide sozinha se
// ja esta na hora dela — por isso o "scanner" que chama isto pode rodar bem
// mais frequente (scannerIntervalMs) sem gastar credito: a maioria dos
// ticks, pra maioria das aeronaves, essa funcao volta sem chamar o OpenSky
// nenhuma vez.
async function checkOne(icao24) {
    const existing = await db_1.prisma.trackedAircraft.findUnique({ where: { icao24 } });
    const now = new Date();
    // "Estava voando" = a ultima leitura tinha ela no ar (isOnline+nao no
    // chao), OU existe uma transicao pendente de confirmar
    // (pendingDepartureAt/pendingArrivalAt) — pedido do usuario, 2026-09-03:
    // "uma maneira bem precisa de deixar registrado o momento da decolagem e
    // do pouso". O pending* e checado FORA do "isOnline===true" de proposito
    // (bug corrigido, 2026-09-03): uma aeronave com pouso pendente que JA
    // ficou offline (o caso exato que a confirmacao por silencio existe pra
    // resolver, ver mais abaixo) tem isOnline=false — com o "E" em vez de
    // "OU" no comeco, ela caia de volta pro intervalo lento (15min) mesmo
    // tendo pendencia, atrasando a confirmacao quase tanto quanto sem o fix.
    const hasPendingTransition = existing?.pendingDepartureAt != null || existing?.pendingArrivalAt != null;
    const wasFlying = (existing?.isOnline === true && existing.onGround === false) || hasPendingTransition;
    // Perto do destino em fase final vence os outros 2 intervalos (mais
    // rapido que ambos), com 3 tiers por distancia — ver approachDistanceKm
    // acima. classifyApproachTier so nomeia a escada (ver comentario la), os
    // valores/limiares sao exatamente os mesmos de sempre.
    const approachDistance = approachDistanceKm(existing);
    const { tier, intervalMs: interval } = classifyApproachTier(approachDistance, wasFlying);
    // updatedAt e sempre escrito (ache ou nao ache, ver upserts abaixo) —
    // reaproveitado aqui como "quando foi a ultima checagem", sem precisar de
    // coluna nova so pra isso.
    const lastCheckedAt = existing?.updatedAt ?? null;
    const elapsedMs = lastCheckedAt ? now.getTime() - lastCheckedAt.getTime() : Number.POSITIVE_INFINITY;
    if (elapsedMs < interval)
        return; // ainda nao e a hora desta aeronave
    let state;
    if (existing?.latitude != null && existing?.longitude != null) {
        const boxDegrees = boxDegreesFor(elapsedMs);
        state = await (0, trackedAircraftSource_1.fetchTrackedAircraftStateNear)(icao24, existing.latitude, existing.longitude, boxDegrees);
        // Resgate: nao achou na caixa pequena (rota mudou mais que o esperado,
        // ou um ciclo anterior falhou e a caixa calculada ficou pequena demais)
        // — tenta 1x global antes de marcar offline.
        if (!state) {
            state = await (0, trackedAircraftSource_1.fetchTrackedAircraftState)(icao24);
        }
    }
    else {
        // 1a vez vendo esta aeronave — sem posicao anterior pra centralizar
        // caixa nenhuma, so da pra ser busca global mesmo.
        state = await (0, trackedAircraftSource_1.fetchTrackedAircraftState)(icao24);
    }
    if (!state) {
        // Nao apareceu neste ciclo: mantem lat/lon/altitude como estavam (ultima
        // posicao conhecida), so marca offline — nunca deleta, nunca zera
        // posicao (pedido explicito do usuario).
        //
        // EXCECAO (pedido do usuario, 2026-09-03 — bug real visto ao vivo:
        // GLO7640 pousou, sumiu de sinal no chao, e o pouso nunca confirmava
        // porque a 2a leitura real que confirmaria nunca chegava — motor
        // desligado nao manda ADS-B nenhum): se ha um pendingArrivalAt pendente
        // (1a leitura ja mostrou "parece no chao"), sumir de sinal DEPOIS disso
        // e o proprio sinal de confirmacao — aeronave estacionada e desligada e
        // o caso NORMAL, nao uma leitura ruidosa isolada (ao contrario da
        // decolagem: sumir de sinal com um pendingDepartureAt pendente continua
        // SEM confirmar nada, de proposito — nesse lado, silencio e ambiguo,
        // pode ser so um sinal fraco em pleno voo, nao decolagem confirmada).
        // stage/onGround entram junto com flightEndedAt nos 2 ramos abaixo —
        // bug reportado pelo usuario, 2026-09-08: sem isso, o pouso ficava
        // "confirmado" so no flightEndedAt (usado pro alerta do Command Center)
        // enquanto a timeline (campo stage, o que o frontend mostra) continuava
        // presa no ultimo estagio aereo real (DESCIDA/APROXIMACAO) pra sempre,
        // ja que deriveStage so roda quando chega uma leitura NOVA — que nunca
        // chega, e por isso a aeronave esta offline.
        const flightTimingOnOffline = {};
        if (existing?.pendingArrivalAt) {
            flightTimingOnOffline.flightEndedAt = existing.pendingArrivalAt;
            flightTimingOnOffline.pendingArrivalAt = null;
            flightTimingOnOffline.stage = 'POUSO';
            flightTimingOnOffline.onGround = true;
        }
        // Pouso por SILENCIO SEM leitura em solo previa (pedido do usuario,
        // 2026-09-04, bug real: GLO perto de Congonhas sumiu de sinal ainda "no
        // ar" pra nos — nunca chegou a mandar 1 leitura sequer com on_ground,
        // entao nunca existiu pendingArrivalAt nenhum, e o ramo acima nunca
        // dispara). Diferente do caso acima: aqui a EVIDENCIA de pouso nao vem
        // de uma leitura real, vem da COMBINACAO fase+proximidade da ULTIMA
        // leitura real (isNearDestinationInApproach) com o proprio silencio —
        // perto o bastante do destino, em fase final, sumir de sinal e o
        // proprio padrao esperado de "pousou e desligou o transponder", nao
        // precisa de confirmacao em 2 leituras como decolagem/pouso normal
        // (aqui so ha 1 leitura possível — a ultima antes do silencio).
        const isConfirmedAirborne = existing?.flightStartedAt != null && existing?.flightEndedAt == null;
        if (!flightTimingOnOffline.flightEndedAt && isConfirmedAirborne && isNearDestinationInApproach(existing)) {
            flightTimingOnOffline.flightEndedAt = existing?.positionAt ?? now;
            flightTimingOnOffline.stage = 'POUSO';
            flightTimingOnOffline.onGround = true;
        }
        const offlineRow = await db_1.prisma.trackedAircraft.upsert({
            where: { icao24 },
            create: { icao24, isOnline: false, tier },
            update: { isOnline: false, updatedAt: now, tier, ...flightTimingOnOffline },
            select: { id: true },
        });
        if (flightTimingOnOffline.flightEndedAt) {
            console.log(`[sync-job] aeronave monitorada (${icao24}) POUSOU (confirmado por silencio${existing?.pendingArrivalAt ? ' pos-pouso' : ' perto do destino em aproximacao'}) — ${flightTimingOnOffline.flightEndedAt.toISOString()}`);
        }
        console.log(`[sync-job] aeronave monitorada (${icao24}) nao apareceu neste ciclo — mantendo ultima posicao conhecida`);
        // Metadados/historico NAO dependem de estar online (ver comentario nas
        // funcoes acima) — rodam mesmo nesse ramo, pra uma aeronave que so
        // aparece offline (recem adicionada e ja fora do ar, ou pousada ha
        // muito tempo) ainda assim ganhar seus dados.
        await syncAircraftMetadata(icao24, existing);
        await syncFlightHistory(icao24, offlineRow.id, existing, now);
        return;
    }
    // OpenSky ACHOU a aeronave (state != null) mas devolveu o MESMO fix de
    // antes (time_position nao avancou) — bug real visto ao vivo, 2026-09-08
    // (AZU4206/e4a2b7 pousando em Viracopos): o ramo "!state" acima (pouso por
    // silencio) so cobre o caso da aeronave SUMIR da resposta do OpenSky, mas
    // aqui ela continuava "aparecendo" a cada ciclo, so que sempre com o
    // MESMO time_position antigo (o proprio cache do OpenSky, nao um sinal
    // novo de verdade) — isOnline ficava true pra sempre e o pouso nunca era
    // confirmado, mesmo com o marcador ja "parado" no aeroporto no frontend
    // (snap por staleness, ver useDeadReckoning.ts). Mesma logica do ramo
    // acima (silencio perto do destino em aproximacao = pousou), so que o
    // gatilho aqui e "sem fix NOVO" em vez de "sem resposta nenhuma".
    const existingPositionAt = existing?.positionAt ?? null;
    const isConfirmedAirborneNow = existing?.flightStartedAt != null && existing?.flightEndedAt == null;
    const isSameOldPosition = existingPositionAt != null && state.positionAt != null && state.positionAt.getTime() <= existingPositionAt.getTime();
    // Reaproveita approachDistance (ja calculado acima pro tier de recheck) —
    // valido aqui porque so e usado dentro do "isNearDestinationInApproach"
    // abaixo, que exige exatamente as mesmas condicoes (stage APROXIMACAO +
    // destino conhecido) que approachDistanceKm ja checou.
    const staleForTooLong = existingPositionAt != null && approachDistance != null && now.getTime() - existingPositionAt.getTime() > staleLandedThresholdMs(approachDistance);
    if (existingPositionAt != null && isSameOldPosition && staleForTooLong && isConfirmedAirborneNow && isNearDestinationInApproach(existing)) {
        const landedRow = await db_1.prisma.trackedAircraft.upsert({
            where: { icao24 },
            create: { icao24, isOnline: false, tier },
            update: { isOnline: false, stage: 'POUSO', onGround: true, flightEndedAt: existingPositionAt, updatedAt: now, tier },
            select: { id: true },
        });
        console.log(`[sync-job] aeronave monitorada (${icao24}) POUSOU (confirmado por estagnacao — OpenSky repetindo o mesmo fix perto do destino em aproximacao) — ${existingPositionAt.toISOString()}`);
        await syncAircraftMetadata(icao24, existing);
        await syncFlightHistory(icao24, landedRow.id, existing, now);
        return;
    }
    // Rota/destino ATUAL (R-18, pedido do usuario 2026-09-04) — MOVIDO pra
    // ANTES do deriveStage (bug reportado pelo usuario, 2026-09-08: TAM3053
    // nunca entrou em APROXIMACAO e GLO1009 apareceu como SUBIDA "prestes a
    // pousar em Guarulhos"). Causa raiz: antes, essa busca rodava DEPOIS do
    // deriveStage/upsert — entao na 1a leitura de uma aeronave RECEM
    // adicionada (existing == null, destino ainda desconhecido), a
    // classificacao por proximidade nao tinha destino nenhum pra comparar e
    // caia no fallback antigo (vRate/altitude), MESMO que a aeronave ja
    // estivesse a poucos km do pouso. O destino so ficava disponivel no
    // ciclo SEGUINTE — geralmente inofensivo (autocorrige na proxima leitura,
    // caso do GLO1009), mas se essa 1a leitura tambem nao virou APROXIMACAO,
    // o intervalo de recheck continuava LENTO (nao ha tier rapido sem
    // APROXIMACAO), e a aeronave podia pousar inteira antes do proximo
    // ciclo — caso do TAM3053, que pulou de DESCIDA direto pra POUSO sem
    // nunca passar por APROXIMACAO. Buscando a rota AQUI, o destino (quando
    // resolvido) ja esta disponivel pra classificar a PROPRIA leitura atual.
    let destinationFields = {};
    let destinationLatitude = existing?.destinationLatitude ?? null;
    let destinationLongitude = existing?.destinationLongitude ?? null;
    if (state.callsign && state.callsign !== existing?.routeCallsign) {
        try {
            const route = await (0, adsbdbSource_1.fetchAdsbdbRoute)(state.callsign);
            destinationLatitude = route?.destinationLatitude ?? null;
            destinationLongitude = route?.destinationLongitude ?? null;
            destinationFields = {
                routeCallsign: state.callsign,
                originIcao: route?.originIcao ?? null,
                originName: route?.originName ?? null,
                destinationIcao: route?.destinationIcao ?? null,
                destinationName: route?.destinationName ?? null,
                destinationLatitude,
                destinationLongitude,
            };
            if (route) {
                console.log(`[sync-job] aeronave monitorada (${icao24}) rota encontrada (adsbdb): ${route.originIcao} -> ${route.destinationIcao}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[sync-job] erro buscando rota (adsbdb) da aeronave monitorada (${icao24}):`, message);
        }
    }
    // Distancia com a posicao NOVA (state) e o destino resolvido ACIMA nesta
    // mesma leitura (nao mais so o de "existing", que podia estar 1 ciclo
    // atrasado).
    const freshDistanceToDestinationKm = destinationLatitude != null && destinationLongitude != null
        ? distanceKm(state.latitude, state.longitude, destinationLatitude, destinationLongitude)
        : null;
    const stage = deriveStage(existing?.stage ?? null, state, freshDistanceToDestinationKm);
    const trueTrack = resolveTrueTrack(existing, state);
    const flightTiming = resolveFlightTiming(existing, state);
    // Tier persistido aqui e recalculado com o FIX FRESCO (nao o "tier"
    // calculado la em cima, que usa a posicao antiga so pra decidir SE ja era
    // hora de checar) — senao o campo exposto ficaria sempre 1 leitura
    // atrasado em relacao ao estagio/distancia que acabaram de ser apurados.
    const freshApproachDistance = stage === 'APROXIMACAO' ? freshDistanceToDestinationKm : null;
    const { tier: freshTier } = classifyApproachTier(freshApproachDistance, !state.onGround);
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
        tier: freshTier,
        isOnline: true,
        positionAt: state.positionAt,
        lastSeenAt: now,
        ...flightTiming,
        ...destinationFields,
    };
    const row = await db_1.prisma.trackedAircraft.upsert({
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
    await db_1.prisma.trackedAircraftPositionHistory.createMany({
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
    await syncAircraftMetadata(icao24, existing);
    await syncFlightHistory(icao24, row.id, existing, now);
    console.log(`[sync-job] aeronave monitorada (${icao24}) ok — fase: ${stage}, alt: ${Math.round(state.altitude ?? 0)}m, vel: ${Math.round((state.velocity ?? 0) * 3.6)}km/h`);
    // Log proprio pra decolagem/pouso CONFIRMADOS (R-21) — e o sinal que o
    // Command vai usar pra alertar, entao vale ficar visivel separado do log
    // generico do ciclo acima.
    if (flightTiming.flightStartedAt) {
        console.log(`[sync-job] aeronave monitorada (${icao24}) DECOLOU (confirmado) — ${flightTiming.flightStartedAt.toISOString()}`);
    }
    if (flightTiming.flightEndedAt) {
        console.log(`[sync-job] aeronave monitorada (${icao24}) POUSOU (confirmado) — ${flightTiming.flightEndedAt.toISOString()}`);
    }
}
async function runTrackedAircraftCycle() {
    for (const icao24 of config_1.default.trackedAircraft.icao24List) {
        try {
            await checkOne(icao24);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[sync-job] erro na aeronave monitorada (${icao24}):`, message);
        }
    }
    // Retencao do trajeto — mesma ideia do pipeline generico, 1 unica limpeza
    // por ciclo do scanner (nao por aeronave, sem necessidade).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config_1.default.trackedAircraft.historyRetentionDays);
    await db_1.prisma.trackedAircraftPositionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });
}
