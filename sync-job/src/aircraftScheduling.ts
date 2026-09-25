import config from './config';
import { prisma } from './db';
import { fetchAeronaves, fetchSolicitacaoDetalhe, fetchSolicitacoes } from './sources/solicitacoesAeronaves';

// Deteccao de agendamento/decolagem de voo — cruza o fluxo PA-RESGATE-
// GerenciaSolicitacoes com a aeronave rastreada por ICAO24 (TrackedAircraft,
// ver trackedAircraft.ts — rastreio ADS-B real, tabela SEPARADA). Os dois
// nunca se falam por FK: aqui so gravamos o resultado na MESMA linha (chave
// icao24 real OU sintetica, ver `resolveTrackedKey` abaixo) que o rastreio
// ja usa, pro Command Center ler os 2 campos (posicao + agendamento) numa
// unica consulta.
//
// V4 (2026-09-24, substitui a v3 de 2026-09-23): duas mudancas grandes,
// pedidas pelo usuario:
// 1) Itera TODAS as aeronaves de d_Cadastro_Aeronaves, sem lista/registro
//    pre-configurado nosso — "nao vejo o porque precisamos escrever no
//    nosso codigo o icao24 se ja vai vir no fluxo". Identificacao por
//    `aeronave.id` (sempre unico), nao mais por texto de registro (que
//    tinha placeholder DUPLICADO entre 2 aeronaves em producao, confirmado
//    ao vivo 2026-09-24 — "654321" em 2 registros diferentes).
// 2) Novo alerta "prestes a decolar" (P-A1/Q-2, CONTROLE_Aeronave_Amil.md):
//    cruza o horario PREVISTO (DataChegadaOrigem da solicitacao, rotulado
//    "Previsao de Inicio" no proprio e-mail que o fluxo PA-Resgate-
//    NotificaNovaMissaoAerea manda — confirmado lendo o fluxo real
//    2026-09-24) com telemetria ADS-B real (onGround=false), quando essa
//    aeronave tiver rastreio real. Sem rastreio real, dispara so' pelo
//    horario (mesmo fallback do mapa, AmilJetPage.tsx).
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

  for (const aeronave of aeronaves) {
    try {
      await processAeronave(cfg.url, aeronave, solicitacoes);
    } catch (error) {
      // Uma aeronave com erro (ex: obterUma falhando) nao pode travar as
      // outras — bug real da v3, que dava `return` no meio do ciclo inteiro
      // no primeiro problema encontrado.
      console.error(
        `[sync-job] agendamento de aeronave: erro processando "${aeronave.nome ?? aeronave.id}" (id ${aeronave.id})`,
        error,
      );
    }
  }
}

async function processAeronave(
  url: string,
  aeronave: Awaited<ReturnType<typeof fetchAeronaves>>[number],
  solicitacoes: Awaited<ReturnType<typeof fetchSolicitacoes>>,
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
      scheduledDepartureAt: true,
      departureAlertMissionId: true,
      onGround: true,
      isOnline: true,
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
        // Missao nova = previsao de horario tambem reseta (so' fica sabendo
        // de novo com o obterUma abaixo); zera o dedup do alerta de
        // decolagem pra essa missao poder disparar de novo.
        scheduledDepartureAt: null,
        departureAlertMissionId: null,
        departureAlertAt: null,
      }
    : {};

  // Missao ativa (nem cancelada nem concluida) — busca/atualiza o horario
  // previsto e avalia o alerta de decolagem. Solicitacao encerrada nao
  // precisa mais dessa checagem.
  const statusNorm = normalize(latest.status);
  const isMissionActive = statusNorm !== STATUS_CANCELADA && statusNorm !== STATUS_CONCLUIDA;

  let departureFields: { scheduledDepartureAt?: Date | null } = {};
  let departureAlertFields: { departureAlertAt?: Date; departureAlertMissionId?: number } = {};

  if (isMissionActive) {
    const knownDepartureAt = isNewScheduling ? null : (existing?.scheduledDepartureAt ?? null);
    let scheduledDepartureAt = knownDepartureAt;

    // So busca o detalhe (obterUma, 1 chamada extra) se ainda nao temos o
    // horario previsto dessa missao — nao bate toda hora numa mesma missao.
    if (!scheduledDepartureAt) {
      const detalhe = await fetchSolicitacaoDetalhe(url, latest.id);
      if (detalhe?.dataChegadaOrigem) {
        scheduledDepartureAt = detalhe.dataChegadaOrigem;
        departureFields.scheduledDepartureAt = scheduledDepartureAt;
      }
    }

    const alreadyFiredForThisMission = existing?.departureAlertMissionId === latest.id;
    const timeReached = scheduledDepartureAt != null && new Date() >= scheduledDepartureAt;

    // Cruzamento com telemetria real (Q-2): se a aeronave tem rastreio de
    // verdade (isOnline=true em algum momento — ICAO24 real), exige
    // confirmacao de que ela esta' voando antes de disparar. Sem rastreio
    // real (chave sintetica, nunca fica online), dispara so' pelo horario —
    // mesmo fallback ja usado no mapa pra aeronave sem ICAO.
    const hasRealTelemetry = aeronave.icao24 != null && existing?.isOnline === true;
    const telemetryConfirms = !hasRealTelemetry || existing?.onGround === false;

    if (timeReached && telemetryConfirms && !alreadyFiredForThisMission) {
      departureAlertFields = { departureAlertAt: new Date(), departureAlertMissionId: latest.id };
      console.log(
        `[sync-job] ALERTA DE DECOLACAO detectado — solicitacao #${latest.id}, aeronave "${aeronave.nome}" (id ${aeronave.id}, chave ${trackedKey}), previsto para ${scheduledDepartureAt?.toISOString()}`,
      );
    }
  }

  const allFields = { ...newSchedulingFields, ...departureFields, ...departureAlertFields };

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
