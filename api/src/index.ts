import express from 'express';
import config from './config';
import routes from './routes';
import { startBroadcast } from './broadcast';
import { startAircraftBroadcast } from './aircraftBroadcast';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(routes);

// Sem espera por conexao aqui de proposito — o Dockerfile roda "prisma migrate
// deploy" (com retry) antes de iniciar o processo, entao o Postgres ja esta
// garantidamente pronto quando chegamos aqui.
startBroadcast();
startAircraftBroadcast();
app.listen(config.port, () => {
  console.log(`[api] rodando na porta ${config.port}`);
});
