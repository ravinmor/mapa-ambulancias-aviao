import { Request, Response } from 'express';
import { getCurrentAircraft } from './aircraft';
import config from './config';

// Stream proprio, separado do das vans (broadcast.ts) — mesma mecanica, outra
// cadencia. Sao 2 EventSource abertos no navegador em vez de 1: bem dentro do
// limite de conexoes por origem, e mantem os dois pipelines independentes
// (um erro na consulta de aeronave nao derruba o mapa das ambulancias).
const clients = new Set<Response>();

function send(client: Response, message: unknown): void {
  client.write(`data: ${JSON.stringify(message)}\n\n`);
}

export function streamAircraft(req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  clients.add(res);
  getCurrentAircraft()
    .then((snapshot) => send(res, { type: 'snapshot', aircraft: snapshot }))
    .catch((error) => console.error('[aircraft-broadcast] erro ao enviar snapshot inicial:', error.message));

  req.on('close', () => clients.delete(res));
}

// Bem mais espacado que o broadcast das vans (5s): o dado de aeronave so muda
// a cada ciclo do sync-job, que e de 5 minutos por causa da cota diaria do
// OpenSky. Bater no Postgres a cada 5s aqui seria consulta sem nenhuma
// chance de dado novo no meio do caminho.
async function broadcastPeriodically(): Promise<void> {
  if (clients.size > 0) {
    try {
      const snapshot = await getCurrentAircraft();
      const message = { type: 'snapshot', aircraft: snapshot };
      for (const client of clients) send(client, message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[aircraft-broadcast] erro no ciclo de broadcast:', msg);
    }
  }
  setTimeout(broadcastPeriodically, config.aircraftBroadcastIntervalMs);
}

export function startAircraftBroadcast(): void {
  broadcastPeriodically();
  console.log(`[aircraft-broadcast] rodando a cada ${config.aircraftBroadcastIntervalMs}ms`);
}
