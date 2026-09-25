import config from './config';
import { prisma } from './db';
import { fetchLogAereo, type LogAereoEntry } from './sources/logAereo';
import { fetchAeronaves, fetchSolicitacoes } from './sources/solicitacoesAeronaves';

// Deteccao de agendamento/decolagem/aproximacao de voo — cruza 2 fluxos
// Power Automate DIFERENTES com a aeronave rastreada por ICAO24
// (TrackedAircraft, ver trackedAircraft.ts — rastreio ADS-B real, tabela
// SEPARADA). Nenhum dos dois se fala com TrackedAircraft por FK: aqui so
// gravamos o resultado na MESMA linha (chave icao24 real OU sintetica, ver
// `resolveTrackedKey` abaixo) que o rastreio ja usa, pro Command Center ler
// tudo numa unica consulta.
//
// V5 (2026-09-25, substitui a v4 de 2026-09-24): o alerta de decolagem/
// aproximacao deixou de ser por horario PREVISTO (DataChegadaOrigem/
// DataChegadaDestino, removido) e passou a ser por EVENTO REAL — botoes que
// o PILOTO vai clicando durante o voo, registrados no fluxo
// MapaAmbulancias_ObterLogAereo (lista f_Log_Aereo, ver sources/logAereo.ts).
// Pedido do usuario: a aeronave faz o trajeto BASE -> ORIGEM (pega o
// paciente) -> DESTINO, entao cada tipo de alerta dispara 2x por missao:
//   "Saida da Base aerea" | "Saida da origem"          -> "prestes a decolar"
//   "Chegada na origem"   | "Chegada no destino final" -> "aproximando do destino"
// Isso muda o dedup: nao da mais pra usar "1x por missionId" (v4) porque o
// MESMO kind dispara 2x na MESMA missao — o dedup agora e' por linha de log
// (`departureAlertLogId`/`arrivalAlertLogId` guardam o `ID` da ULTIMA linha
// de f_Log_Aereo que ja disparou aquele alerta; uma linha NOVA com `ID`
// maior dispara de novo, mesmo dentro da mesma missao).
//
// V4 (2026-09-24) continua valendo pro alerta "agendada": itera TODAS as
// aeronaves de d_Cadastro_Aeronaves, sem lista pre-configurada nossa,
// identificacao por `aeronave.id`. Chave sintetica `reg-<id>` em
// TrackedAircraft quando a aeronave nao tem ICAO24 real.
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

const STATUS_AGUARDANDO_ACEITE = normalize('Aguardando aceite');
const STATUS_CANCELADA = normalize('Cancelada');
const STATUS_CONCLUIDA = normalize('Concluída');

// Status de f_Log_Aereo (botoes do piloto) que disparam cada alerta —
// confirmado contra export real da lista, 2026-09-25 (missao de teste
// ID_Solicitacao 55, sequencia completa ao vivo).
const STATUS_DEPARTURE = new Set([normalize('Saída da Base aérea'), normalize('Saída da origem')]);
const STATUS_ARRIVAL = new Set([normalize('Chegada na origem'), normalize('Chegada no destino final')]);

// Chave da linha em TrackedAircraft: ICAO24 real quando a aeronave tiver
// (campo novo `ICAO24` em d_Cadastro_Aeronaves, preenchido manualmente so'
// pra quem tem rastreio de verdade hoje — PT-WLO), senao uma chave
// SINTETICA estavel por aeronave (`reg-<id>`) — garante linha PROPRIA por
// aeronave (popup/dedup corretos), mesmo sem ICAO real. Nunca colide com um
// ICAO24 de verdade (hex de 6 digitos nunca comeca com "reg-").
function resolveTrackedKey(aeronaveId: number, icao24: string | null): string {
  return icao24 ?? `reg-${aeronaveId}`;
}

export async function runAircraftSchedulingCycle(): Promise<void> {
  const cfg = config.aircraftScheduling;
  if (!cfg) return;

  const [aeronaves, solicitacoes] = await Promise.all([fetchAeronaves(cfg.url), fetchSolicitacoes(cfg.url)]);
  // Log de eventos reais do piloto — INDEPENDENTE (fluxo/lista diferentes),
  // so busca se a URL dele estiver configurada (opt-in, mesmo padrao do
  // resto). Sem ela, os alertas de decolagem/aproximacao simplesmente nao
  // disparam (so' "agendada" continua funcionando).
  const logAereo = config.aircraftLog ? await fetchLogAereo(config.aircraftLog.url) : [];

  for (const aeronave of aeronaves) {
    try {
      await processAeronave(aeronave, solicitacoes, logAereo);
    } catch (error) {
      // Uma aeronave com erro nao pode travar as outras — bug real da v3,
      // que dava `return` no meio do ciclo inteiro no primeiro problema
      // encontrado.
      console.error(
        `[sync-job] agendamento de aeronave: erro processando "${aeronave.nome ?? aeronave.id}" (id ${aeronave.id})`,
        error,
      );
    }
  }
}

async function processAeronave(
  aeronave: Awaited<ReturnType<typeof fetchAeronaves>>[number],
  solicitacoes: Awaited<ReturnType<typeof fetchSolicitacoes>>,
  logAereo: LogAereoEntry[],
): Promise<void> {
  const vinculadas = solicitacoes.filter((s) => s.aeronaveId === aeronave.id);
  // Maior ID = mais recente (sem depender de `created`, que pode faltar).
  const latest = vinculadas.reduce<(typeof vinculadas)[number] | null>(
    (best, current) => (best == null || current.id > best.id ? current : best),
    null,
  );

  if (!latest) {
    // Sem solicitacao nenhuma vinculada ainda — nao e' erro, so' nao ha
    // agendamento no momento. Nao mexe no que ja foi salvo (evita apagar o
    // ultimo agendamento conhecido por uma leitura vazia passageira).
    return;
  }

  const trackedKey = resolveTrackedKey(aeronave.id, aeronave.icao24);

  const existing = await prisma.trackedAircraft.findUnique({
    where: { icao24: trackedKey },
    select: {
      scheduledMissionId: true,
      schedulingStatus: true,
      departureAlertLogId: true,
      arrivalAlertLogId: true,
    },
  });

  const isNowAguardandoAceite = normalize(latest.status) === STATUS_AGUARDANDO_ACEITE;
  // "Ja estava Aguardando aceite" so conta se for a MESMA solicitacao — cobre
  // o caso de ela ser reatribuida de verdade depois de voltar de "Pendencia"
  // (mesmo ID, mas TRANSICIONOU de novo pra Aguardando aceite — deve
  // alertar de novo, nao so' na 1a vez que essa solicitacao apareceu).
  const isSameMissionAsBefore = existing?.scheduledMissionId === latest.id;
  const wasAguardandoAceiteForThisMission =
    isSameMissionAsBefore && normalize(existing?.schedulingStatus) === STATUS_AGUARDANDO_ACEITE;
  const isNewScheduling = isNowAguardandoAceite && !wasAguardandoAceiteForThisMission;

  const newSchedulingFields = isNewScheduling
    ? {
        scheduledAt: new Date(),
        scheduledMissionId: latest.id,
        scheduledPatientName: latest.pacienteNome,
        scheduledAircraftId: aeronave.id,
        scheduledAircraftName: aeronave.nome,
      }
    : {};

  // Missao ativa (nem cancelada nem concluida) — avalia os alertas de
  // decolagem/aproximacao a partir do log real. Solicitacao encerrada nao
  // precisa mais dessa checagem (o log da missao encerrada nao muda mais).
  const statusNorm = normalize(latest.status);
  const isMissionActive = statusNorm !== STATUS_CANCELADA && statusNorm !== STATUS_CONCLUIDA;

  let departureAlertFields: { departureAlertAt?: Date; departureAlertLogId?: number } = {};
  let arrivalAlertFields: { arrivalAlertAt?: Date; arrivalAlertLogId?: number } = {};

  if (isMissionActive) {
    const entriesForMission = logAereo.filter((entry) => entry.idSolicitacao === latest.id);

    // Pra cada categoria, pega a linha de log mais RECENTE (maior ID) que
    // ainda nao foi processada (ID > o que ja foi disparado antes) — se
    // varias linhas novas da mesma categoria chegaram entre 2 ciclos (raro,
    // ciclo de 5s), so' a mais recente conta; e' o mesmo criterio de "borda"
    // ja usado pro resto do dominio (aceitavel, nao um requisito formal de
    // nao perder eventos intermediarios).
    const lastDepartureLogId = isNewScheduling ? null : (existing?.departureAlertLogId ?? null);
    const newestDeparture = entriesForMission
      .filter((entry) => STATUS_DEPARTURE.has(normalize(entry.status)) && (lastDepartureLogId == null || entry.id > lastDepartureLogId))
      .reduce<LogAereoEntry | null>((best, current) => (best == null || current.id > best.id ? current : best), null);

    if (newestDeparture) {
      departureAlertFields = {
        departureAlertAt: newestDeparture.dataHora ?? new Date(),
        departureAlertLogId: newestDeparture.id,
      };
      console.log(
        `[sync-job] ALERTA DE DECOLACAO detectado — solicitacao #${latest.id}, aeronave "${aeronave.nome}" (id ${aeronave.id}, chave ${trackedKey}), evento "${newestDeparture.status}" (log #${newestDeparture.id})`,
      );
    }

    const lastArrivalLogId = isNewScheduling ? null : (existing?.arrivalAlertLogId ?? null);
    const newestArrival = entriesForMission
      .filter((entry) => STATUS_ARRIVAL.has(normalize(entry.status)) && (lastArrivalLogId == null || entry.id > lastArrivalLogId))
      .reduce<LogAereoEntry | null>((best, current) => (best == null || current.id > best.id ? current : best), null);

    if (newestArrival) {
      arrivalAlertFields = {
        arrivalAlertAt: newestArrival.dataHora ?? new Date(),
        arrivalAlertLogId: newestArrival.id,
      };
      console.log(
        `[sync-job] ALERTA DE APROXIMACAO DO DESTINO detectado — solicitacao #${latest.id}, aeronave "${aeronave.nome}" (id ${aeronave.id}, chave ${trackedKey}), evento "${newestArrival.status}" (log #${newestArrival.id})`,
      );
    }
  }

  const allFields = { ...newSchedulingFields, ...departureAlertFields, ...arrivalAlertFields };

  await prisma.trackedAircraft.upsert({
    where: { icao24: trackedKey },
    create: { icao24: trackedKey, schedulingStatus: latest.status, ...allFields },
    update: { schedulingStatus: latest.status, ...allFields },
  });

  if (isNewScheduling) {
    console.log(
      `[sync-job] NOVO AGENDAMENTO detectado — solicitacao #${latest.id} (paciente "${latest.pacienteNome ?? 'desconhecido'}"), aeronave "${aeronave.nome}" (id ${aeronave.id}, chave ${trackedKey}) status "${latest.status}"`,
    );
  }
}
