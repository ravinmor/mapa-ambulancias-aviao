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
}

const TICK_MS = 1000;

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

  // Sem posicao, sem velocidade, sem rumo ou parada no solo nao ha o que
  // estimar — devolve como veio.
  if (latitude == null || longitude == null || velocity == null || trueTrack == null || positionAt == null) {
    return aircraft;
  }
  if (aircraft.onGround || velocity <= 0) return aircraft;

  const elapsedSec = (nowMs - new Date(positionAt).getTime()) / 1000;
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
