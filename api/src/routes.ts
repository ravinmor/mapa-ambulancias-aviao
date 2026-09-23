import express, { Request, Response, NextFunction } from 'express';
import { prisma } from './db';
import { getCurrentFleet, isStageDone } from './vehicles';
import { getCurrentAircraft } from './aircraft';
import { getTrackedAircraft, getTrackedAircraftFlightHistory } from './trackedAircraft';
import { streamVehicles } from './broadcast';
import { streamAircraft } from './aircraftBroadcast';
import config from './config';

const router = express.Router();

// Sem isso, um erro assincrono nao tratado numa rota derruba o processo inteiro
// (Node 15+ mata o processo em unhandledRejection por padrao).
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// Portado do sync-job antigo (STATUS_TEXT_TO_ENUM, ver comentario em
// vehicles.ts) — usado aqui so pra decidir se o veiculo esta "em operacao"
// (unico caso em que history/mission devolvem dado, resto do tempo a
// posicao/missao mostrada seria de uma corrida ja encerrada).
const STATUS_TEXT_TO_ENUM: Record<string, string> = {
  'Em Operação': 'IN_SERVICE',
  'Baixa Operacional': 'INACTIVE',
  'Em Manutenção': 'MAINTENANCE',
  'Fora da Operação': 'AVAILABLE',
  'Sem Operação': 'AVAILABLE',
  Reserva: 'RESERVE',
  'Apoio Amil': 'EVENT_SUPPORT',
};
function isVehicleInService(operationStatus: string | null): boolean {
  return (operationStatus != null ? STATUS_TEXT_TO_ENUM[operationStatus] : null) === 'IN_SERVICE';
}

router.get('/healthz', (req: Request, res: Response) => res.json({ ok: true }));

router.get('/api/vehicles/stream', streamVehicles);

router.get(
  '/api/vehicles',
  asyncHandler(async (req, res) => {
    res.json(await getCurrentFleet());
  })
);

router.get(
  '/api/vehicles/:id/history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || config.historyRowLimit, 20000);

    const veiculo = await prisma.veiculo.findUnique({ where: { id }, select: { operationStatus: true } });
    if (!isVehicleInService(veiculo?.operationStatus ?? null)) {
      res.json([]);
      return;
    }

    // PosicaoOperacao.operacaoId e obrigatorio na origem (as 2 listas que
    // alimentam a tabela sempre tem o vinculo) — diferente do
    // positionHistory.operationId antigo, que era opcional e String (por
    // vir de Mission.callId, tambem String). Aqui operacaoId ja e o Int de
    // Operacao.id direto, sem conversao.
    const latest = await prisma.posicaoOperacao.findFirst({
      where: { veiculoId: id },
      orderBy: { positionAt: 'desc' },
      select: { operacaoId: true },
    });

    if (!latest) {
      res.json([]);
      return;
    }

    const points = await prisma.posicaoOperacao.findMany({
      where: { veiculoId: id, operacaoId: latest.operacaoId },
      orderBy: { positionAt: 'desc' },
      take: limit,
      select: { latitude: true, longitude: true, positionAt: true },
    });

    const ordered = points.reverse();

    const currentPosition = await prisma.posicaoAtualVeiculo.findUnique({
      where: { veiculoId: id },
      select: { latitude: true, longitude: true, positionAt: true },
    });
    const lastHistoryPoint = ordered[ordered.length - 1];
    if (currentPosition && (!lastHistoryPoint || currentPosition.positionAt > lastHistoryPoint.positionAt)) {
      ordered.push(currentPosition);
    }

    res.json(
      ordered.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        positionAt: p.positionAt,
      }))
    );
  })
);

// Textos descritivos completos do StatusOperacao (ver comentarios em
// nucleo/enums.prisma) — a 2a auditoria do nucleo trocou o texto livre
// "Status_atual_da_operacao" por um enum fechado, entao o texto completo
// (usado como fallback/tooltip na timeline, ver MissionTimeline.tsx) precisa
// ser reconstruido a partir do valor do enum em vez de vir direto da origem.
// shortStatus (Status_resumido_operacao, texto cru mantido por paridade)
// continua sendo a fonte PRIMARIA no frontend — isso aqui e so fallback.
const STATUS_OPERACAO_TEXT: Record<string, string> = {
  AGUARDANDO_ACEITE: 'Aguardando aceite do Controle.',
  DESLOCANDO_PARA_ORIGEM: 'Deslocamento para origem iniciado, aguardando confirmação de chegada na origem.',
  CHEGOU_NA_ORIGEM: 'Chegada na origem confirmada, aguardando iniciar deslocamento para o destino.',
  DESLOCANDO_PARA_DESTINO: 'Deslocamento para o destino iniciado, aguardando confirmação de chegada no destino.',
  CONCLUIDA_PELO_RESGATE: 'Equipe Resgate concluiu missão.',
  CONCLUIDA_PELO_CONTROLE: 'Equipe do Controle concluiu missão.',
  CANCELADA: 'Chamado Cancelado',
  CANCELADA_PELO_RESGATE: 'Operação cancelada pela equipe do Resgate.',
};

router.get(
  '/api/vehicles/:id/mission',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const veiculo = await prisma.veiculo.findUnique({ where: { id }, select: { operationStatus: true } });
    if (!isVehicleInService(veiculo?.operationStatus ?? null)) {
      res.json(null);
      return;
    }

    // Ligacao direta por Operacao.veiculoId (FK real no nucleo) — substitui
    // o passo antigo de achar o ultimo ping de posicao pra descobrir o
    // operationId. lastActionAt desc pega a operacao mais recentemente
    // tocada, que e a que esta em andamento (uma finalizada para de receber
    // acao/posicao nova).
    const operacao = await prisma.operacao.findFirst({
      where: { veiculoId: id },
      orderBy: { lastActionAt: 'desc' },
      include: { chamado: true },
    });

    if (!operacao) {
      res.json(null);
      return;
    }

    const chamado = operacao.chamado;

    res.json({
      id: operacao.id,
      callId: String(operacao.chamadoId),
      tripType: operacao.tripType,
      operationStatus: operacao.operationStatus,
      currentStatusText:
        (operacao.currentStatus ? STATUS_OPERACAO_TEXT[operacao.currentStatus] : null) ?? operacao.shortStatus ?? null,
      shortStatusText: operacao.shortStatus,
      acceptanceStatus: operacao.acceptanceStatus,
      departedToOriginStatus: operacao.departedToOriginStatus,
      arrivedAtOriginStatus: operacao.arrivedAtOriginStatus,
      departedToDestStatus: operacao.departedToDestStatus,
      arrivedAtDestStatus: operacao.arrivedAtDestStatus,
      finishedStatus: operacao.finishedStatus,
      assignedAt: operacao.assignedAt,
      acknowledgedAt: operacao.acknowledgedAt,
      departedToOriginAt: operacao.departedToOriginAt ?? undefined,
      arrivedAtOriginAt: operacao.arrivedAtOriginAt ?? undefined,
      departedToDestAt: operacao.departedToDestAt ?? undefined,
      arrivedAtDestAt: operacao.arrivedAtDestAt ?? undefined,
      finishedAt: operacao.finishedAt ?? undefined,
      lastActionAt: operacao.lastActionAt,
      cancelledAt: operacao.cancelledAt,
      cancellationReason: operacao.cancellationReason,
      etaOrigin: operacao.etaOrigin,
      etaDestination: operacao.etaDestination,
      regulation: chamado
        ? {
            id: chamado.id,
            originName: chamado.originName,
            destinationName: chamado.destinationName,
            originAddress: chamado.originAddress,
            destinationAddress: chamado.destinationAddress,
            originSector: chamado.originSector,
            destinationSector: chamado.destinationSector,
            patientName: chamado.patientName,
            patientAge: chamado.patientAge,
            patientSex: chamado.patientSex,
            birthDate: chamado.patientBirthDate ? chamado.patientBirthDate.toISOString() : null,
            weightKg: chamado.patientWeightKg,
            heightCm: chamado.patientHeightCm != null ? String(chamado.patientHeightCm) : null,
            diagnosis: chamado.diagnosis,
            callReason: chamado.callReason,
            patientType: chamado.patientType,
            patientTypeOther: chamado.patientTypeOther,
            companion: chamado.companion,
            isIntubated: chamado.isIntubated,
            isObese: chamado.isObese,
            triageCompleted: chamado.triageCompleted,
            healthPlan: chamado.healthPlan,
            procedure: chamado.procedure,
            equipment: chamado.equipment,
            deviceUsage: chamado.deviceUsage,
            originDoctor: chamado.originDoctor,
            destinationDoctor: chamado.destinationDoctor,
            notes: chamado.notes,
          }
        : null,
    });
  })
);

router.get('/api/aircraft/stream', streamAircraft);

router.get(
  '/api/aircraft',
  asyncHandler(async (req, res) => {
    res.json(await getCurrentAircraft());
  })
);

router.get(
  '/api/aircraft/:id/history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const windowHours = Math.min(Number(req.query.windowHours) || config.aircraftHistoryWindowHours, 24 * 30);
    const limit = Math.min(Number(req.query.limit) || config.historyRowLimit, 20000);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const points = await prisma.aircraftPositionHistory.findMany({
      where: { aircraftId: id, positionAt: { gt: since } },
      orderBy: { positionAt: 'desc' },
      take: limit,
      select: { latitude: true, longitude: true, altitude: true, positionAt: true },
    });

    // Corta no primeiro buraco grande, caminhando do ponto mais novo pro mais
    // antigo — so o trecho continuo mais recente e devolvido. Sem isso, uma
    // aeronave que saiu da area e voltou depois (reocupando a MESMA linha,
    // pois a chave e o icao24) teria os dois trechos ligados por uma reta
    // atravessando o mapa. Diferente das vans, aqui nao ha CurrentPosition
    // pra costurar no fim: posicao e historico saem da mesma escrita, no
    // mesmo ciclo, entao nunca divergem.
    const maxGapMs = config.aircraftTrailGapMinutes * 60 * 1000;
    const segment: typeof points = [];
    for (let i = 0; i < points.length; i += 1) {
      if (i > 0 && points[i - 1].positionAt.getTime() - points[i].positionAt.getTime() > maxGapMs) break;
      segment.push(points[i]);
    }

    res.json(
      segment.reverse().map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        positionAt: p.positionAt,
      }))
    );
  })
);

// Aeronave especifica rastreada por ICAO24 fixo (ver trackedAircraft.ts) —
// endpoint proprio, separado de /api/aircraft de proposito: e a rota que
// alimenta a pagina em /aviacao-executiva (AmilJetPage.tsx), um mapa e
// design totalmente a parte do mapa operacional das ambulancias. Sem SSE
// aqui — o dado so muda a cada ciclo do sync-job (15 min por causa da cota
// do OpenSky), entao o frontend so faz polling simples, mesmo padrao ja
// usado em MissionStatsCards.tsx.
router.get(
  '/api/tracked-aircraft',
  asyncHandler(async (req, res) => {
    res.json(await getTrackedAircraft());
  })
);

// Trajeto da aeronave especifica (pedido do usuario, 2026-09-02: "trajeto de
// avioes do mapa de ambulancias completo, inclusive com diferenciacao de
// altitude por cor") — mesma logica de /api/aircraft/:id/history (janela +
// corte no 1o buraco grande, ver comentario la), so lendo de
// TrackedAircraftPositionHistory em vez de AircraftPositionHistory.
router.get(
  '/api/tracked-aircraft/:id/history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const windowHours = Math.min(
      Number(req.query.windowHours) || config.trackedAircraftHistoryWindowHours,
      24 * 30
    );
    const limit = Math.min(Number(req.query.limit) || config.historyRowLimit, 20000);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const points = await prisma.trackedAircraftPositionHistory.findMany({
      where: { trackedAircraftId: id, positionAt: { gt: since } },
      orderBy: { positionAt: 'desc' },
      take: limit,
      select: { latitude: true, longitude: true, altitude: true, positionAt: true },
    });

    const maxGapMs = config.trackedAircraftTrailGapMinutes * 60 * 1000;
    const segment: typeof points = [];
    for (let i = 0; i < points.length; i += 1) {
      if (i > 0 && points[i - 1].positionAt.getTime() - points[i].positionAt.getTime() > maxGapMs) break;
      segment.push(points[i]);
    }

    res.json(
      segment.reverse().map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        positionAt: p.positionAt,
      }))
    );
  })
);

// Trajeto via Garmin inReach MapShare (2026-09-22, pedido do usuario:
// "pegue o trajeto do voo da garmin e adapte ao meu trajeto com
// diferenciacao por altitude") — MESMA logica de corte por gap/janela do
// endpoint acima, so lendo de GarminPositionHistory (tabela separada,
// nunca mistura ponto do OpenSky com ponto da Garmin) e com janela/gap
// PROPRIOS (config.garminHistoryWindowHours/garminTrailGapMinutes — ver
// racional em config.ts). Frontend troca qual dos 2 endpoints usa conforme
// o botao de alternar (AmilJetPage.tsx).
router.get(
  '/api/tracked-aircraft/:id/garmin-history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const windowHours = Math.min(
      Number(req.query.windowHours) || config.garminHistoryWindowHours,
      24 * 90
    );
    const limit = Math.min(Number(req.query.limit) || config.historyRowLimit, 20000);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const points = await prisma.garminPositionHistory.findMany({
      where: { trackedAircraftId: id, positionAt: { gt: since } },
      orderBy: { positionAt: 'desc' },
      take: limit,
      select: { latitude: true, longitude: true, altitude: true, positionAt: true },
    });

    const maxGapMs = config.garminTrailGapMinutes * 60 * 1000;
    const segment: typeof points = [];
    for (let i = 0; i < points.length; i += 1) {
      if (i > 0 && points[i - 1].positionAt.getTime() - points[i].positionAt.getTime() > maxGapMs) break;
      segment.push(points[i]);
    }

    res.json(
      segment.reverse().map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        positionAt: p.positionAt,
      }))
    );
  })
);

// Historico de voos PASSADOS da aeronave especifica (R-31 cont., pedido do
// usuario 2026-09-04: "crie um grafico... com o historico de voo") — origem/
// destino + data, sincronizado do OpenSky pelo sync-job.
router.get(
  '/api/tracked-aircraft/:id/flight-history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    res.json(await getTrackedAircraftFlightHistory(id));
  })
);


// Dia inteiro (00h00 de hoje ate 00h00 de amanha), sempre em horario de
// Brasilia — calculado manualmente a partir de UTC (deslocando o timestamp
// e lendo com getUTC*()) em vez de usar o fuso do processo/container Node,
// que pode estar em UTC (bug ja visto: 15h40 de Brasilia virando "noite"
// quando isso ainda era dividido em turnos). Brasil nao tem horario de
// verao desde 2019 — offset fixo de -3h e seguro. Turnos dia/noite foram
// removidos por pedido do usuario (2026-08-27): os indicadores agora sao
// sempre "desde 00h00 de hoje", sem corte de horario.
const BRAZIL_UTC_OFFSET_HOURS = 3;

function currentDayWindow(): { start: Date; end: Date } {
  const now = new Date();
  const brazilClock = new Date(now.getTime() - BRAZIL_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const year = brazilClock.getUTCFullYear();
  const month = brazilClock.getUTCMonth();
  const date = brazilClock.getUTCDate();

  const start = new Date(Date.UTC(year, month, date, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Estados de Operacao.currentStatus que significam "ja terminou, de um jeito
// ou de outro" — decisao 2026-09-22: Operacao.operationStatus (mesma coluna
// de origem "Status_Operacao" que a Mission antiga usava pra achar "Em
// Operação") veio SEMPRE null na 2a auditoria do nucleo contra dado real —
// nao da mais pra usar texto cru. currentStatus (enum StatusOperacao) e a
// fonte nova, confirmada com o usuario.
const TERMINAL_OPERACAO_STATUS = new Set([
  'CONCLUIDA_PELO_RESGATE',
  'CONCLUIDA_PELO_CONTROLE',
  'CANCELADA',
  'CANCELADA_PELO_RESGATE',
]);
function isOperacaoActive(currentStatus: string | null, cancelledAt: Date | null): boolean {
  if (cancelledAt) return false;
  if (!currentStatus) return true; // AGUARDANDO_ACEITE = null na origem, ver enums.prisma
  return !TERMINAL_OPERACAO_STATUS.has(currentStatus);
}

// Indicadores da lateral do mapa: ativas/finalizadas/total/QTA com e sem
// custo, desde 00h00 de hoje (horario de Brasilia) e opcionalmente por
// estado (mesmo filtro SP/RJ do mapa). "QTA com custo" = cancelou depois de
// ja ter saido rumo a origem (gastou deslocamento); "sem custo" = cancelou
// antes disso — definicao dada pelo usuario, sem campo pronto pra isso na
// origem.
router.get(
  '/api/missions/stats',
  asyncHandler(async (req, res) => {
    const { start, end } = currentDayWindow();
    const state = typeof req.query.state === 'string' && req.query.state ? req.query.state : null;

    // Ativas/QTA continuam filtradas por assignedAt (Dt atribuicao) no dia —
    // mas Finalizadas passa a usar acknowledgedAt (Data_e_Hora_da_ciencia),
    // pedido do usuario 2026-09-17: uma operacao atribuida ONTEM mas so
    // finalizada HOJE deve contar como finalizada de hoje, nao de ontem.
    const operacoes = await prisma.operacao.findMany({
      where: {
        OR: [{ assignedAt: { gte: start, lt: end } }, { acknowledgedAt: { gte: start, lt: end } }],
        // insensitive: mesmo cuidado ja existente antes (bug 2026-08-27,
        // indicadores nao respeitando o filtro de estado por causa de caixa).
        ...(state ? { state: { equals: state, mode: 'insensitive' as const } } : {}),
      },
      select: {
        cancelledAt: true,
        qta: true,
        finishedStatus: true,
        currentStatus: true,
        assignedAt: true,
        acknowledgedAt: true,
      },
    });

    let active = 0;
    let finished = 0;
    let qtaWithCost = 0;
    let qtaWithoutCost = 0;

    const inWindow = (d: Date | null) => d != null && d >= start && d < end;

    for (const operacao of operacoes) {
      if (operacao.cancelledAt) {
        if (!inWindow(operacao.assignedAt)) continue;
        // Le direto do campo "QTA" da origem (texto "QTA COM CUSTO"/"QTA SEM
        // CUSTO") — nao infere por status de etapa, ver historico do bug
        // 2026-09-16 no schema antigo. Fallback pra "sem custo" so se o
        // campo vier vazio (registro antigo/incompleto).
        const qta = operacao.qta?.trim().toLowerCase() ?? '';
        if (qta.includes('sem custo')) qtaWithoutCost += 1;
        else if (qta.includes('com custo')) qtaWithCost += 1;
        else qtaWithoutCost += 1;
      } else if (isOperacaoActive(operacao.currentStatus, operacao.cancelledAt)) {
        if (!inWindow(operacao.assignedAt)) continue;
        active += 1;
      } else if (isStageDone(operacao.finishedStatus)) {
        if (!inWindow(operacao.acknowledgedAt)) continue;
        finished += 1;
      }
    }

    res.json({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      active,
      finished,
      total: active + finished + qtaWithCost + qtaWithoutCost,
      qtaWithCost,
      qtaWithoutCost,
    });
  })
);

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[api] erro na requisicao:', err.message);
  res.status(500).json({ error: 'internal error' });
});

export default router;
