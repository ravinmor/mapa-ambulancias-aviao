import { Request, Response } from 'express';
import { getCurrentFleet } from './vehicles';
import config from './config';

const clients = new Set<Response>();

function send(client: Response, message: unknown): void {
  client.write(`data: ${JSON.stringify(message)}\n\n`);
}

export function streamVehicles(req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  clients.add(res);
  getCurrentFleet()
    .then((snapshot) => send(res, { type: 'snapshot', vehicles: snapshot }))
    .catch((error) => console.error('[broadcast] erro ao enviar snapshot inicial:', error.message));

  req.on('close', () => clients.delete(res));
}

// O dado so muda a cada ~30s (ritmo do sync-job) — 5s de polling ja parece
// instantaneo pra quem olha o mapa. Manda o snapshot completo (frota pequena),
// sem calcular diff.
async function broadcastPeriodically(): Promise<void> {
  if (clients.size > 0) {
    try {
      const snapshot = await getCurrentFleet();
      const message = { type: 'snapshot', vehicles: snapshot };
      for (const client of clients) send(client, message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[broadcast] erro no ciclo de broadcast:', msg);
    }
  }
  setTimeout(broadcastPeriodically, config.broadcastIntervalMs);
}

export function startBroadcast(): void {
  broadcastPeriodically();
  console.log(`[broadcast] rodando a cada ${config.broadcastIntervalMs}ms`);
}
