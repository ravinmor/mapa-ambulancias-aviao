# Deploy no Azure DevOps / Kubernetes

Tres servicos, cada um com seu par de pipelines e sua pasta `.devops/`. Mesmo padrao do
Command Center e das NFs (template `command-center/pipeline-template@v1`).

| Servico | Pasta | Dockerfile (raiz) | Pipelines | Exposicao |
|---|---|---|---|---|
| resgate-api | `api/.devops` | `Dockerfile.api` | `resgate-api-ci` / `resgate-api-cd` | so dentro do cluster (porta 3000) |
| resgate-frontend | `frontend/.devops` | `Dockerfile.frontend` | `resgate-frontend-ci` / `resgate-frontend-cd` | Ingress `resgate<-amb>.<cluster>.<dominio>` |
| resgate-sync-job | `sync-job/.devops` | `Dockerfile.sync-job` | `resgate-sync-job-ci` / `resgate-sync-job-cd` | nenhuma (polling) |

Os Dockerfiles ficam na raiz porque o template de CI builda com a raiz como contexto. Os
`Dockerfile` dentro de cada pasta continuam valendo para o `docker-compose` local.

## Ambientes

| Destino | Branch | Namespace | Host do frontend |
|---|---|---|---|
| DEV | `dev` | `command-center-dev` | `resgate-dev.c3.<dominio>` |
| QA | `qa` | `command-center-qa` | `resgate-qa.c3.<dominio>` |
| HM | `hml` | `command-center-test` | `resgate-test.c3.<dominio>` |
| PRD | `main` | `resgate` (pendente, c1) | `resgate.c1.<dominio>` |

Os tres servicos usam os namespaces do Command Center. Os nomes (`resgate-*`) nao colidem com
`map-*`, que continua sendo servido pelo Command Center ate a virada.

## Banco e Variable Groups

- Banco: `vg-resgate-postgres-nao-produtivo` / `-produtivo` (chaves `resgate_app_postgres_*_<amb>`),
  chaves proprias do app. As `resgate_postgres_*` continuam sendo do mapa do Command Center.
- Power Automate (so o sync-job): `vg-resgate-powerautomate-nao-produtivo`.
- Os valores vem dos VGs. Nenhuma URL ou senha deve ir para o repo.

## sync-job: replicas por ambiente

`sync_job_replicas` fica em `sync-job/.devops/envs/<amb>.yml`: `1` em DEV, QA e HM (o mapa saiu do
Command Center, este e o unico sync-job de cada ambiente) e `0` em PRD ate o resgate existir la.

## Frontend

O nginx le `API_HOST` (padrao `api`, igual ao docker-compose; no cluster, `resgate-api`).
O template fica em `frontend/nginx.conf.template`; o `frontend/nginx.conf` original e do compose.
