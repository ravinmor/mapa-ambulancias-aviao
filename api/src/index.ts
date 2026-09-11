// Carrega o .env da RAIZ do projeto (o mesmo que o docker-compose ja usa
// pra substituicao de variavel) — so importa fora do Docker: la dentro o
// container ja recebe tudo via `environment:`, e esse arquivo nem existe na
// imagem (gitignored, nao copiado pelo Dockerfile), entao a chamada abaixo
// so falha silenciosamente e process.env segue como o compose deixou.
// Precisa ser o PRIMEIRO import — 'config' le process.env assim que e
// importado, e com "module":"commonjs" (tsconfig.json) os imports viram
// require() em ordem, entao isso so funciona por vir antes dele.
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

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
