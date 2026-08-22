import { useEffect, useState } from 'react';
import type { Aircraft } from './types';

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

const TICK_MS = 1000;

// Teto de extrapolacao. Se o dado parar de chegar (sync-job fora do ar, cota
// estourada), sem esse limite a aeronave sairia navegando sozinha pela tela
// pra sempre, cada vez mais longe da realidade. Passado esse tempo ela
// congela na ultima posicao plausivel — melhor um marcador parado que um
// marcador confiantemente errado.
const MAX_EXTRAPOLATION_SEC = 15 * 60;

// Metros por grau de latitude. Longitude encolhe com o cosseno da latitude.
const METERS_PER_DEGREE = 111320;

function extrapolate(aircraft: Aircraft, nowMs: number): Aircraft {
  const { latitude, longitude, velocity, trueTrack, positionAt } = aircraft;

  // Sem posicao, sem velocidade, sem rumo ou parada no solo nao ha o que
  // estimar — devolve como veio.
  if (latitude == null || longitude == null || velocity == null || trueTrack == null || positionAt == null) {
    return aircraft;
  }
  if (aircraft.onGround || velocity <= 0) return aircraft;

  const elapsedSec = (nowMs - new Date(positionAt).getTime()) / 1000;
  if (elapsedSec <= 0) return aircraft;

  const cappedSec = Math.min(elapsedSec, MAX_EXTRAPOLATION_SEC);
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

export function useDeadReckoning(aircraft: Aircraft[]): Aircraft[] {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return aircraft.map((a) => extrapolate(a, nowMs));
}
