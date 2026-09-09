import { useEffect, useState } from 'react';

// Navegacao estimada ("dead reckoning") — move a aeronave na tela a cada
// segundo, entre uma atualizacao real e outra.
//
// Por que isso existe: o usuario pediu o aviao atualizando de 1 em 1 segundo.
// Buscar dado real nessa frequencia e impossivel no acesso anonimo do
// OpenSky — 86.400 chamadas/dia contra uma cota de 400, ou seja 216x o
// orcamento inteiro. O que da pra fazer (e o que os rastreadores de voo
// comerciais fazem) e ESTIMAR a posicao entre as medicoes: sabendo onde a
// aeronave estava, a que velocidade e em que rumo, da pra calcular onde ela
// deve estar agora.
//
// Consequencia honesta: entre uma medicao e outra a posicao desenhada e
// calculada, nao medida. Ela e corrigida a cada ciclo real do sync-job.
//
// GENERICO (2026-09-02): antes so aceitava o tipo Aircraft do mapa das
// ambulancias — generalizado pra qualquer formato que tenha os campos
// necessarios, pra a pagina da aeronave especifica (AmilJetPage.tsx,
// TrackedAircraft) reusar a mesma logica sem duplicar.

export interface DeadReckonable {
  latitude: number | null;
  longitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  positionAt: string | null;
  onGround: boolean;
  // Opcionais (R-31 cont., pedido do usuario 2026-09-04) — quando presentes,
  // TRAVAM a extrapolacao perto do pouso em vez de deixar continuar reto.
  // Bug real visto ao vivo: aeronave sumiu de sinal perto do destino (comum
  // — predios/terreno bloqueiam ADS-B nos ultimos metros antes de tocar o
  // solo) e o dead reckoning continuou "voando" em linha reta por cima do
  // aeroporto e mar afora, ja que a extrapolacao nao sabe nada sobre
  // aeroportos/curva de aproximacao. So a pagina da aeronave especifica
  // preenche isso (tem destino via adsbdb) — o mapa generico das
  // ambulancias nao tem esse conceito, undefined = extrapola normal, sem
  // mudanca de comportamento.
  stage?: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
}

const TICK_MS = 1000;
// Raio (km) do destino e tempo (s) sem fix novo a partir dos quais a
// extrapolacao congela — ver comentario no bloco que usa essas constantes,
// dentro de extrapolate(). O tempo tem folga de 2x sobre o ciclo de
// rebusca rapida do backend (45s) pra nao disparar em falso por um unico
// ciclo atrasado.
const APPROACH_STALE_FREEZE_RADIUS_KM = 8;
const APPROACH_STALE_FREEZE_SEC = 90;
// Raio (km) a partir do qual a extrapolacao troca de "reta a velocidade
// constante" pra "planeio desacelerando ate parar exatamente no destino" —
// ver PLANEIO em extrapolate(). Ponto de partida pra ajustar depois de
// observar o comportamento real (nem tao longe que pareceria desacelerar
// cedo demais pra ser realista, nem tao perto que sobra pouco espaco pra
// absorver o excesso ja extrapolado antes de entrar nessa zona).
const APPROACH_GLIDE_RADIUS_KM = 3;

// Teto de extrapolacao. Se o dado parar de chegar (sync-job fora do ar, cota
// estourada), sem esse limite a aeronave sairia navegando sozinha pela tela
// pra sempre, cada vez mais longe da realidade. Passado esse tempo ela
// congela na ultima posicao plausivel — melhor um marcador parado que um
// marcador confiantemente errado.
//
// Configuravel por chamador (pedido do usuario, 2026-09-02: aeronaves
// especificas devem continuar em dead reckoning mesmo offline) porque o
// ciclo de busca varia por pagina: mapa generico busca fixo de 5 em 5 min
// (15min = 3x de folga), aeronaves especificas ficam paradas e so sao
// rebuscadas de 15 em 15 min (o teto antigo de 15min congelava o marcador
// quase no mesmo instante em que ela ficava offline). Default preserva o
// comportamento do mapa generico.
const DEFAULT_MAX_EXTRAPOLATION_SEC = 15 * 60;

// Metros por grau de latitude. Longitude encolhe com o cosseno da latitude.
const METERS_PER_DEGREE = 111320;

function extrapolate<T extends DeadReckonable>(aircraft: T, nowMs: number, maxExtrapolationSec: number): T {
  const { latitude, longitude, velocity, trueTrack, positionAt } = aircraft;

  // Sem posicao ou sem carimbo de tempo nao ha o que fazer — devolve como
  // veio. Velocidade/rumo NAO entram aqui de proposito (bug reportado pelo
  // usuario, 2026-09-08): o snap pro destino logo abaixo nao depende deles,
  // e precisa rodar mesmo quando a aeronave ja esta onGround (o proprio
  // caso que esse snap existe pra cobrir).
  if (latitude == null || longitude == null || positionAt == null) {
    return aircraft;
  }

  const elapsedSec = (nowMs - new Date(positionAt).getTime()) / 1000;

  // Distancia ate o destino calculada 1x e reaproveitada abaixo (snap por
  // staleness + freeze por manobra) — antes cada bloco calculava a sua,
  // agora e uma so, calculada aqui se o destino for conhecido.
  const distanceToDestinationKm =
    aircraft.destinationLatitude != null && aircraft.destinationLongitude != null
      ? Math.hypot(
          (latitude - aircraft.destinationLatitude) * (METERS_PER_DEGREE / 1000),
          (longitude - aircraft.destinationLongitude) * (METERS_PER_DEGREE / 1000) * Math.cos((latitude * Math.PI) / 180),
        )
      : null;

  // Perto do destino E sem fix novo ha mais tempo que o ciclo de rebusca
  // rapida do backend (45s, ver APPROACH_RECHECK_INTERVAL_MS em
  // trackedAircraft.ts) — sinal quase certo de que o ADS-B sumiu por
  // predio/terreno bem antes do toque (comum, ver comentario no topo do
  // arquivo), nao que a aeronave parou de se mover. Bug reportado pelo
  // usuario 2026-09-08 (aeronave "passando direto do aeroporto" de novo,
  // TAM3229/e49c00 sobre GRU): tirar o freeze de proximidade (pedido
  // anterior, pra nao travar durante curvas legitimas de aproximacao)
  // deixou a extrapolacao correndo reta por cima da pista quando o sinal
  // real morre. Diferenca pro freeze antigo: so trava se o dado ja estiver
  // PARADO por tempo demais — enquanto os fixes reais continuam chegando
  // (a cada ~45s), a aeronave continua se movendo normalmente de 1 em 1
  // segundo ate bem perto da pista. Em vez de congelar na ultima posicao
  // real (pedido do usuario, 2026-09-08), pula direto pra coordenada do
  // destino — silencio nesse raio quase sempre significa "ja pousou", entao
  // o aeroporto e um palpite melhor que o ultimo ponto antes do sinal
  // sumir (que ainda pode estar alguns km fora da pista).
  //
  // ESSE BLOCO TEM QUE RODAR ANTES do "if onGround" abaixo (bug reportado
  // pelo usuario, 2026-09-08: "sem fazer nada ela se moveu do aeroporto pra
  // longe dele e entrou em modo pouso") — o backend agora confirma POUSO
  // via ESTAGNACAO de posicao (mesmo sinal repetido, ver
  // STALE_POSITION_LANDED_THRESHOLD_MS em trackedAircraft.ts), setando
  // onGround=true SEM atualizar latitude/longitude (continuam sendo o
  // ultimo fix real, ainda longe da pista). Se o "if onGround" rodasse
  // primeiro, a aeronave "pulava" de volta pra esse ultimo fix real assim
  // que o backend confirmava o pouso — exatamente o efeito reportado.
  //
  // Gatilho AGORA e "onGround === true OU elapsedSec > 90s" (era SO
  // elapsedSec > 90s) — bug reportado pelo usuario, 2026-09-08 de novo
  // (TAM3367: "atualizou e voltou alguns km, e agora esta congelado"):
  // depois que o backend passou a confirmar pouso por estagnacao em ATE
  // ~6s perto da pista (ver STALE_POSITION_LANDED_THRESHOLD_MS/
  // staleLandedThresholdMs em trackedAircraft.ts), sobrava um buraco real
  // — o backend ja tinha marcado onGround=true, mas o frontend so
  // pulava pro destino depois de esperar os 90s FIXOS daqui, que nunca
  // foram atualizados junto. Nesse buraco (podia chegar a ~84s), o "if
  // onGround" logo abaixo ja freava TUDO (nem extrapolacao, nem snap) —
  // o marcador ficava preso na ultima posicao real, sem se mover, ate o
  // timer local finalmente vencer. onGround vindo do backend e um sinal
  // de pouso MAIS forte que mera estagnacao (o proprio backend so seta
  // isso apos confirmar por proximidade) — nao faz sentido esperar mais
  // 90s por cima disso. O caminho "so estagnacao" (elapsedSec > 90s,
  // onGround ainda false) continua existindo, pro caso do sinal sumir
  // ANTES do backend ter tido a chance de confirmar via qualquer um dos
  // seus proprios mecanismos.
  if (
    aircraft.destinationLatitude != null &&
    aircraft.destinationLongitude != null &&
    (aircraft.onGround || elapsedSec > APPROACH_STALE_FREEZE_SEC) &&
    distanceToDestinationKm != null &&
    distanceToDestinationKm <= APPROACH_STALE_FREEZE_RADIUS_KM
  ) {
    return { ...aircraft, latitude: aircraft.destinationLatitude, longitude: aircraft.destinationLongitude };
  }

  if (aircraft.onGround || velocity == null || trueTrack == null || velocity <= 0) return aircraft;

  // PLANEIO: dentro do raio de aproximacao final, troca a reta a velocidade
  // CONSTANTE por uma desaceleracao ate parar exatamente em cima do destino
  // (pedido do usuario, 2026-09-08 — resposta ao bug "passa do aeroporto e
  // depois teleporta de volta com o estado de pouso").
  //
  // CORRECAO 2026-09-09 (bug reportado pelo usuario: "na maioria das vezes
  // a aeronave passa direto pelo aeroporto e depois aparece em estado de
  // pouso" — o planeio "as vezes funciona, mas na maioria das vezes nao").
  // Causa raiz: a versao anterior so entrava no planeio se o FIX REAL mais
  // recente (nao a posicao ja extrapolada) ja estivesse a <=3km do destino.
  // latitude/longitude aqui SAO o fix real, constantes durante todo o
  // intervalo ate a proxima consulta ao backend — ou seja, essa checagem
  // era avaliada 1 UNICA VEZ por fix, nunca de novo enquanto o tempo passa.
  // Se o fix real chegou com a aeronave a, digamos, 6km (fora do raio), a
  // extrapolacao reta rodava a velocidade constante pelo intervalo INTEIRO
  // ate o proximo fix real — que perto do pouso pode ser varios minutos
  // (a escada de recheck rapido do sync-job so liga depois que uma
  // consulta real confirma <=40km; se o fix anterior a isso pegou a
  // aeronave mais longe, a escada inteira pode ser pulada, ver analise
  // completa na conversa) — tempo de sobra pra voar reto e passar batido
  // pelo aeroporto inteiro sem a checagem nunca ser refeita.
  //
  // Fix: em vez de checar a distancia do FIX (estatica), calcula
  // analiticamente ONDE (e QUANDO, tCruzamento) a trajetoria reta a partir
  // do fix cruzaria o raio de planeio — resolvendo a intersecao reta-
  // circulo (equacao quadratica padrao: |posicao(t) - destino|^2 = R^2,
  // com posicao(t) = fix + velocidade*t). Isso e reavaliado a cada
  // chamada desta funcao (1x/segundo, ver TICK_MS), entao mesmo que o fix
  // em si esteja longe, o momento exato em que a extrapolacao ENTRARIA no
  // raio e detectado no proprio segundo em que elapsedSec o alcanca —
  // nenhuma aeronave real cobre um raio de alguns km inteiro num unico
  // tick de 1s, entao a entrada nao passa mais despercebida.
  // Continuidade: a fisica do planeio comeca a contar do PONTO e TEMPO
  // exatos do cruzamento (latEntry/lonEntry/tCruzamento), nao do fix
  // original — assim, no instante exato em que entra no raio, o planeio
  // comeca com fracao=0 exatamente onde a reta j a estava, sem pulo
  // visual. Fora do raio (discriminante negativo, ou as 2 raizes no
  // passado/nunca cruza — ex: rumo real nao aponta pro destino ainda,
  // tipico de perna base/downwind antes do alinhamento final), cai pro
  // mesmo comportamento de sempre (reta simples), sem risco de "forcar"
  // um planeio pra um destino que a aeronave ainda nao esta mirando.
  if (aircraft.destinationLatitude != null && aircraft.destinationLongitude != null) {
    const latRad = (latitude * Math.PI) / 180;
    const bearingRad = (trueTrack * Math.PI) / 180;
    // Componentes da velocidade em metros/s, mesma convencao do resto do
    // arquivo (norte = cos, leste = sin, antes de converter pra graus).
    const vy = velocity * Math.cos(bearingRad); // m/s pro norte
    const vx = velocity * Math.sin(bearingRad); // m/s pro leste
    // Destino relativo ao FIX atual, em metros (mesma aproximacao "plana"
    // ja usada no resto do arquivo).
    const destYMeters = (aircraft.destinationLatitude - latitude) * METERS_PER_DEGREE;
    const destXMeters = (aircraft.destinationLongitude - longitude) * METERS_PER_DEGREE * Math.cos(latRad);
    const glideRadiusMeters = APPROACH_GLIDE_RADIUS_KM * 1000;

    // |  (vx*t - destX, vy*t - destY)  |^2 = R^2  =>  A*t^2 + B*t + C = 0
    const A = velocity * velocity;
    const B = -2 * (vx * destXMeters + vy * destYMeters);
    const C = destXMeters * destXMeters + destYMeters * destYMeters - glideRadiusMeters * glideRadiusMeters;

    let tCrossing: number | null = null;
    if (C <= 0) {
      // Ja esta DENTRO do raio no proprio fix (o caso que ja funcionava
      // antes) — planeio comeca agora, do jeito que esta.
      tCrossing = 0;
    } else {
      const discriminant = B * B - 4 * A * C;
      if (discriminant >= 0) {
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-B - sqrtDiscriminant) / (2 * A); // menor raiz = 1o cruzamento (entrada)
        if (t1 >= 0) tCrossing = t1; // cruza no futuro — se as 2 raizes forem negativas, ja cruzou (e saiu) antes deste fix, ignora
      }
    }

    if (tCrossing != null && elapsedSec >= tCrossing) {
      // Ponto exato onde a reta cruzou o raio — a partir daqui, MRUV ate
      // parar em cima do destino (mesma cinematica de antes: velocidade
      // media v0/2 durante a frenagem, tStop = 2*d0/v0, s(t) = v0*t -
      // 0.5*(v0/tStop)*t^2), so que ancorada no cruzamento, nao no fix.
      const latEntry = latitude + (vy * tCrossing) / METERS_PER_DEGREE;
      const lonEntry = longitude + (vx * tCrossing) / (METERS_PER_DEGREE * Math.cos(latRad));
      const d0Meters = Math.hypot(vx * tCrossing - destXMeters, vy * tCrossing - destYMeters);
      const elapsedInGlideSec = elapsedSec - tCrossing;

      let fraction: number;
      if (d0Meters <= 0) {
        fraction = 1;
      } else {
        const tStop = (2 * d0Meters) / velocity;
        if (elapsedInGlideSec >= tStop) {
          fraction = 1;
        } else {
          const sT = velocity * elapsedInGlideSec - 0.5 * (velocity / tStop) * elapsedInGlideSec * elapsedInGlideSec;
          fraction = Math.min(Math.max(sT / d0Meters, 0), 1);
        }
      }
      return {
        ...aircraft,
        latitude: latEntry + fraction * (aircraft.destinationLatitude - latEntry),
        longitude: lonEntry + fraction * (aircraft.destinationLongitude - lonEntry),
      };
    }
  }

  if (elapsedSec <= 0) return aircraft;

  const cappedSec = Math.min(elapsedSec, maxExtrapolationSec);
  const distanceM = velocity * cappedSec;
  const bearingRad = (trueTrack * Math.PI) / 180;

  const deltaLat = (distanceM * Math.cos(bearingRad)) / METERS_PER_DEGREE;
  const deltaLon =
    (distanceM * Math.sin(bearingRad)) / (METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));

  return {
    ...aircraft,
    latitude: latitude + deltaLat,
    longitude: longitude + deltaLon,
    // positionAt NAO e alterado de proposito: ele continua sendo o carimbo da
    // ultima medicao REAL. E o que a sidebar mostra ("posicao registrada em")
    // e, mais importante, e a chave que dispara a rebusca do trajeto — se
    // mudasse a cada segundo, o mapa buscaria o historico 60x por minuto.
  };
}

export function useDeadReckoningOne<T extends DeadReckonable>(
  aircraft: T | null,
  maxExtrapolationSec = DEFAULT_MAX_EXTRAPOLATION_SEC,
): T | null {
  const list = useDeadReckoning(aircraft ? [aircraft] : [], maxExtrapolationSec);
  return list[0] ?? null;
}

export function useDeadReckoning<T extends DeadReckonable>(
  aircraft: T[],
  maxExtrapolationSec = DEFAULT_MAX_EXTRAPOLATION_SEC,
): T[] {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return aircraft.map((a) => extrapolate(a, nowMs, maxExtrapolationSec));
}
