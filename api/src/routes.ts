import express, { Request, Response, NextFunction } from 'express';
import { VehicleStatus } from '@prisma/client';
import { prisma } from './db';
import { getCurrentFleet } from './vehicles';
import { getCurrentAircraft } from './aircraft';
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

    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { status: true } });
    if (vehicle?.status !== VehicleStatus.IN_SERVICE) {
      res.json([]);
      return;
    }

    const latest = await prisma.positionHistory.findFirst({
      where: { vehicleId: id, operationId: { not: null } },
      orderBy: { positionAt: 'desc' },
      select: { operationId: true },
    });

    if (latest?.operationId == null) {
      res.json([]);
      return;
    }

    const points = await prisma.positionHistory.findMany({
      where: { vehicleId: id, operationId: latest.operationId },
      orderBy: { positionAt: 'desc' },
      take: limit,
      select: { latitude: true, longitude: true, positionAt: true },
    });

    const ordered = points.reverse();

    const currentPosition = await prisma.currentPosition.findUnique({
      where: { vehicleId: id },
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

router.get(
  '/api/vehicles/:id/mission',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { status: true } });
    if (vehicle?.status !== VehicleStatus.IN_SERVICE) {
      res.json(null);
      return;
    }

    const latest = await prisma.positionHistory.findFirst({
      where: { vehicleId: id, operationId: { not: null } },
      orderBy: { positionAt: 'desc' },
      select: { operationId: true },
    });

    if (latest?.operationId == null) {
      res.json(null);
      return;
    }

    const operationItemId = Number(latest.operationId);
    if (!Number.isInteger(operationItemId)) {
      res.json(null);
      return;
    }

    const mission = await prisma.mission.findUnique({ where: { id: operationItemId } });
    if (mission == null) {
      res.json(null);
      return;
    }

    const regulationId = Number(mission.callId);
    const regulation = Number.isInteger(regulationId)
      ? await prisma.regulation.findUnique({ where: { id: regulationId } })
      : null;

    res.json({ ...mission, regulation });
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

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[api] erro na requisicao:', err.message);
  res.status(500).json({ error: 'internal error' });
});

export default router;
