# Tarefas — "Arrumar a casa": split aircraft-tracker + database própria (resgate)

Checklist de controle pro trabalho decidido em 2026-09-21 (sessão de
arquitetura): separar o rastreamento de aeronave do `sync-job`, sair do
`map-postgres` (container local) pra uma database própria da empresa
(`resgate`, em `brcorpdblvd4219`). Pré-requisito da integração de
agendamento de voos (via SharePoint), que continua sendo a tarefa principal
depois desta.

**Decisões já fechadas, não reabrir:**
- Nome do serviço novo: pasta `aircraft-tracker/` (sem prefixo, igual
  `api/`/`sync-job/`/`frontend/`); vira `map-aircraft-tracker` só como nome
  de serviço dentro do `docker-compose.yml` do Command Center.
- Os 2 pipelines de aeronave (genérico `aircraft.ts` + específico
  `trackedAircraft.ts`) migram juntos.
- Mesma stack (Node/TS + Prisma), schema Prisma duplicado (mesmo padrão já
  usado entre `api/`/`sync-job/` hoje).
- Database nova: `resgate`, separada da `commandcenter` — mesmo
  servidor (`brcorpdblvd4219`), schema `public` (sem schema Postgres
  separado dentro dela — foi cogitado, decidido manter simples).
- 11 migrations são só de aeronave (copiar verbatim, nome/conteúdo idêntico,
  pro `aircraft-tracker`); 7 são só de veículo/missão/regulação (ficam no
  `sync-job`); 1 é setting global de timezone, não pertence a nenhum dos
  dois de verdade.
- Gerenciador de pacote do `aircraft-tracker/`: npm puro (`package.json` +
  `package-lock.json`), mesmo padrão do `sync-job/`/`api/` hoje — não entra
  no `pnpm-workspace.yaml` do Command Center (repo é subtree, independente).
- `aircraft-tracker/` tem `README.md` próprio (decisão de 2026-09-21) —
  diferente de `sync-job/`/`api/` hoje, que não têm um dedicado.
- `k8s/aircraft-tracker.yaml` faz parte do split, no molde de
  `k8s/sync-job.yaml` — decisão de 2026-09-21.

**Estrutura de pastas aprovada (2026-09-21) — `mapa-ambulancias-aviao/`:**
```
mapa-ambulancias-aviao/
├── api/                          (sem mudança — continua lendo os 2 domínios)
├── sync-job/                     (fica só com vehicle/mission/regulation)
│   ├── Dockerfile
│   ├── package.json / package-lock.json
│   ├── tsconfig.json
│   ├── .dockerignore
│   ├── start.bat
│   ├── prisma/
│   │   ├── schema/
│   │   │   ├── schema.prisma
│   │   │   ├── vehicle.prisma
│   │   │   ├── current_position.prisma
│   │   │   ├── position_history.prisma
│   │   │   ├── mission.prisma
│   │   │   ├── mission_event.prisma
│   │   │   └── regulation.prisma
│   │   └── migrations/           (7 pastas — veículo/missão/regulação)
│   └── src/
│       ├── index.ts              (6 loops)
│       ├── config.ts             (sem blocos opensky/trackedAircraft)
│       ├── db.ts
│       ├── types.ts              (sem AircraftRegion/AircraftEntry)
│       └── sources/
│           ├── sharepoint.ts
│           └── simulated.ts
├── aircraft-tracker/             ← NOVO, molde exato do sync-job/
│   ├── Dockerfile
│   ├── package.json / package-lock.json
│   ├── tsconfig.json
│   ├── .dockerignore
│   ├── start.bat
│   ├── README.md                 ← próprio, diferente do padrão sync-job/api
│   ├── prisma/
│   │   ├── schema/
│   │   │   ├── schema.prisma
│   │   │   ├── aircraft.prisma
│   │   │   ├── aircraft_position_history.prisma
│   │   │   ├── tracked_aircraft.prisma
│   │   │   └── tracked_aircraft_position_history.prisma
│   │   └── migrations/           (11 pastas — aeronave, copiadas verbatim)
│   └── src/
│       ├── index.ts              (2 loops)
│       ├── config.ts             (só blocos opensky/trackedAircraft)
│       ├── db.ts
│       ├── types.ts              (só AircraftRegion/AircraftEntry)
│       └── sources/
│           ├── opensky.ts
│           ├── openskyAuth.ts
│           ├── openskyFlightsSource.ts
│           ├── trackedAircraftSource.ts
│           └── adsbdbSource.ts
├── frontend/                     (sem mudança)
├── k8s/
│   ├── namespace.yaml
│   ├── postgres.yaml
│   ├── sync-job.yaml
│   ├── aircraft-tracker.yaml     ← NOVO
│   ├── api.yaml
│   ├── frontend.yaml
│   └── secret.example.yaml
├── resources/images/
└── docker-compose.yml            (+ serviço map-aircraft-tracker)
```

**Branch de trabalho:** tudo neste arquivo (as 2 seções) é feito na branch
`feat/docker-mapa-integracao` do Command Center (checkout local em
`Commandcenterrtc/Command_Center_Total_Care`). Pendência do usuário, ainda
sem checklist própria: alinhar depois com os outros repositórios/branches
que não recebem isso automaticamente — `ravinmor/mapa-ambulancias-aviao`
standalone (`master`, o que a máquina do painel de LED usa de verdade;
`mapa-ambulancias-aviao/` dentro do Command Center é cópia via `git
subtree`, edição num lado não propaga pro outro), `feat/mapa-ambulancias-led`
(máquina física do painel, 24/7) e o mirror Azure DevOps de
`feat/docker-mapa-integracao`. Ver seção 2 de
`CONTEXTO_SESSAO_2026-09-21_Reestruturacao_Aircraft_Tracker.md` pro mapa
completo de repos/branches.

---

## Falta

### `mapa-ambulancias-aviao` (repo standalone)

- [ ] Criar `aircraft-tracker/` com `Dockerfile`/`package.json`/`tsconfig.json`
      (molde exato do `sync-job/`, só troca o que builda; npm puro, mesmo
      padrão de `sync-job/`/`api/`)
- [ ] Criar `aircraft-tracker/README.md` (próprio, diferente do padrão
      `sync-job/`/`api/` que não têm um dedicado)
- [ ] `aircraft-tracker/prisma/schema/`: copiar `schema.prisma` +
      `aircraft.prisma` + `aircraft_position_history.prisma` +
      `tracked_aircraft.prisma` + `tracked_aircraft_position_history.prisma`
- [ ] `aircraft-tracker/prisma/migrations/`: copiar as 11 pastas aircraft-only
      verbatim (`add_aircraft`, `add_tracked_aircraft` e as 9 seguintes —
      ver lista completa na conversa de 2026-09-21)
- [ ] Mover pro `aircraft-tracker/src/`: `aircraft.ts`, `trackedAircraft.ts`,
      `db.ts`, `sources/opensky.ts`, `sources/openskyAuth.ts`,
      `sources/openskyFlightsSource.ts`, `sources/trackedAircraftSource.ts`,
      `sources/adsbdbSource.ts`
- [ ] Criar `aircraft-tracker/src/types.ts` só com `AircraftRegion`/`AircraftEntry`
- [ ] Criar `aircraft-tracker/src/config.ts` só com os blocos `opensky`/
      `trackedAircraft` (env vars `OPENSKY_*`/`TRACKED_AIRCRAFT_*`/
      `AIRCRAFT_SYNC_INTERVAL_MS`)
- [ ] Criar `aircraft-tracker/src/index.ts`: dotenv + só os 2 `startLoop`
      (`runAircraftCycle`, `runTrackedAircraftCycle`) — sem os outros 6 loops
      do `sync-job`
- [ ] Remover do `sync-job/src/`: `aircraft.ts`, `trackedAircraft.ts`,
      `sources/opensky.ts`, `sources/openskyAuth.ts`,
      `sources/openskyFlightsSource.ts`, `sources/trackedAircraftSource.ts`,
      `sources/adsbdbSource.ts`
- [ ] Remover do `sync-job/src/config.ts`: blocos `opensky`/`trackedAircraft`
- [ ] Remover do `sync-job/src/types.ts`: `AircraftRegion`/`AircraftEntry`
- [ ] Remover do `sync-job/src/index.ts`: os 2 imports/`startLoop` de aeronave
- [ ] Remover do `sync-job/prisma/schema/`: os 4 arquivos de aeronave
- [ ] Remover do `sync-job/prisma/migrations/`: as 11 pastas aircraft-only
      (fica só com as de veículo/missão/regulação)
- [ ] `api/`: decidir se a pasta `prisma/migrations/` continua com o conjunto
      completo (ela lê os 2 domínios) ou também é filtrada — ela não escreve,
      só lê, então provavelmente não precisa gerar migration nova nunca
- [ ] Criar `k8s/aircraft-tracker.yaml` (molde de `k8s/sync-job.yaml`) —
      novo manifesto pro serviço, ainda não existe

### Banco de dados (`brcorpdblvd4219`)

- [ ] **Você**: `CREATE DATABASE resgate;`
- [ ] **Você**: `CREATE USER`/`GRANT` se optar por credencial própria (em vez
      de reaproveitar a do Command Center)
- [ ] Rodar `prisma migrate deploy` do `sync-job` contra `resgate` —
      banco vazio, aplica do zero só as ~7 migrations de veículo/missão/
      regulação (diferente do cenário "banco já populado" que motivou copiar
      as de aeronave verbatim no split)
- [ ] Rodar `prisma migrate deploy` do `aircraft-tracker` contra
      `resgate` — aplica as 11 de aeronave do zero
- [ ] Validar que a contagem de linhas/estrutura bate com o `map-postgres`
      atual antes de considerar migrado de verdade (hoje: 26 vehicles, 11.944
      position_history, 692 missions, 868 regulations, 536 aircraft, 8
      tracked_aircraft — ver conversa 2026-09-21 pra tabela completa)
- [ ] Decidir se os DADOS existentes no `map-postgres` precisam ser migrados
      (dump/restore) ou se começa vazio em `resgate` (perde histórico
      de posição/missão acumulado)

### Command Center (`docker-compose.yml` + `.env`)

- [ ] Adicionar serviço `map-aircraft-tracker` (`build:
      ./mapa-ambulancias-aviao/aircraft-tracker`)
- [ ] Mover env vars `OPENSKY_*`/`TRACKED_AIRCRAFT_*`/
      `AIRCRAFT_SYNC_INTERVAL_MS` do bloco `map-sync-job` pro bloco
      `map-aircraft-tracker`
- [ ] Atualizar `DATABASE_URL` de `map-sync-job`, `map-api` e
      `map-aircraft-tracker` pra apontar pro `resgate` real (em vez de
      `map-postgres`)
- [ ] Decidir: remover o serviço `map-postgres` do compose de vez, ou manter
      como fallback pra dev sem VPN/acesso à rede corporativa?
- [ ] Atualizar `.env`/`.env.example` com a `DATABASE_URL` nova
- [ ] Testar subida local completa (`docker compose up -d`) apontando pro
      banco real, conferir os 2 pipelines de aeronave e os 6 do sync-job
      funcionando

---

## Depois disso (não começar antes de fechar o acima)

- [ ] Retomar a tarefa principal: integração do agendamento de voos
      (SharePoint → `ScheduledFlight` → correlação com `flightStartedAt`) —
      ver memória `project_integracao_agendamento_voos.md`

---

## Mudança de escopo do banco `resgate` (adicionada 2026-09-21 — escopo
## confirmado com o usuário, ANTES de qualquer trabalho de schema novo)

Contexto: a empresa tem sistema de resgate próprio hoje 100% em SharePoint/
Power Automate/Power Apps (onde despachante/regulador realmente cria/edita
missão, veículo, regulação). Vai precisar migrar pra Postgres/Node-TS "em
algum momento" — sem prazo formal, iniciativa do próprio usuário pra não
gerar banco paralelo com dado duplicado depois. Detalhe completo em memória:
`project_migracao_sistema_resgate_sharepoint.md`.

**Escopo confirmado (2026-09-21):**
- Só "preparar o terreno" AGORA — SharePoint/Power Apps continua sendo o
  sistema de escrita real. `sync-job` continua unidirecional (lê do
  SharePoint, grava no Postgres), sem construir substituição de escrita
  nesta etapa.
- Sem mandato formal da empresa — não precisa alinhar com outro time/prazo
  por enquanto.
- **Antes de desenhar qualquer schema novo para `resgate`**: auditar tudo
  que Power Apps/SharePoint capturam hoje (campos, workflow, permissões,
  auditoria) — o schema atual do `sync-job` (Vehicle/Mission/Regulation/
  PositionHistory/MissionEvent) foi desenhado só pro que o MAPA de
  visualização precisa mostrar, pode faltar tabela/campo inteiro.

- [x] Auditoria Power Apps/SharePoint — **43/43 listas auditadas**
      (2026-09-21, via REST API do SharePoint, sessão logada do usuário no
      Chrome). Detalhe completo em
      `mapa-ambulancias-aviao/AUDITORIA_SharePoint_Resgate.md`.
- [x] Comparar resultado da auditoria com o schema Prisma atual — feito,
      gaps documentados no mesmo arquivo (checklist enfermagem/veículo,
      manutenção, RLS, disponibilidade, triagem fora do schema atual;
      `MissionEvent` tinha fonte real nunca conectada — ver auditoria)
- [x] Decisão de escopo pós-auditoria: **núcleo** = Chamado (=
      `f_Regulacao_Chamados`) / Operação (1:N, equipe+veículo por
      operação) / Veículo / Equipe / Colaborador / Triagem (1:1) /
      Disponibilidade / Diario_da_Missao (era "MissionEvent", fonte real
      confirmada = `f_Diario_da_Missao`). Checklist (9 listas),
      manutenção, RLS, módulo aéreo ficam documentados mas fora do desenho
      de tabelas por agora.
- [x] Decisões de modelagem fechadas: normalização real via FK/join (sem
      herdar duplicação do SharePoint), histórico de STATUS completo,
      auditoria de edição só em campos críticos definidos (endereço/
      diagnóstico/cancelamento no Chamado; equipe/veículo/status na
      Operação; aceite/recusa na Disponibilidade), **garantia de paridade
      total de campo** (nenhuma coluna das listas auditadas fica de fora
      do schema novo, só muda COMO é guardado)
- [x] Desenhar o schema Prisma do núcleo (tabelas + relacionamentos) —
      feito e verificado 2026-09-21, schema completo (15 models: Chamado,
      Operacao, Veiculo, Tablet, Equipe, Colaborador, ComposicaoEquipe,
      Triagem, Disponibilidade, DiarioDaMissao, 3 catálogos, 3 tabelas de
      auditoria, 1 de log de erro de sync, 2 enums) em
      `mapa-ambulancias-aviao/DESENHO_Schema_Resgate_Nucleo.md`
- [x] Ordem decidida (2026-09-21): split do `aircraft-tracker` **pausado**,
      núcleo é prioridade agora. Confirmado também: criar a estrutura do
      banco (schema+migrations) não exige mexer no `sync-job` — são 2
      coisas separadas (estrutura vs. popular com sync real depois).
- [x] Projeto Prisma do núcleo criado em `mapa-ambulancias-aviao/
      resgate-nucleo/prisma/` — schema PRÓPRIO, SEM compartilhar pasta de
      migrations com o `sync-job` (correção importante: se ficasse na
      mesma pasta, um `resgate` novo herdaria as 19 migrations antigas de
      Vehicle/Mission/Regulation junto, recriando o problema de banco
      paralelo duplicado). `sync-job/prisma/` validado intacto depois da
      mudança; `resgate-nucleo/prisma/` validado sozinho (`prisma
      validate`, sem erro).
- [ ] **Ainda em aberto**: o `sync-job` atual (Vehicle/Mission/Regulation)
      é reescrito no futuro pra gravar no núcleo novo, ou os dois
      domínios continuam existindo separados? Não decidido — não bloqueia
      o trabalho atual, só precisa ser resolvido antes de qualquer sync
      real escrever no núcleo.
- [ ] Rodar `prisma migrate dev` de verdade no `resgate-nucleo/` (ainda
      não feito — precisa de conexão com banco real ou de teste; banco
      `resgate` em si ainda não existe, ver pendência abaixo)

---

## Nova iniciativa (adicionada 2026-09-21 — escopo confirmado com o usuário,
## AINDA NÃO PLANEJADA em etapas)

Pedido do usuário: "precisa ser muito bem pensado antes e ser feito em
etapas também" — os 2 itens abaixo são a intenção com escopo já confirmado,
mas NÃO um checklist executável ainda. Falta a sessão de arquitetura própria
(igual a que gerou o resto deste arquivo) pra quebrar em passos concretos.
Independente do split aircraft-tracker/`resgate` acima — ordem entre os
dois ainda não decidida, não travar nenhum dos dois por causa do outro.

- [ ] Migrar o banco do PRÓPRIO Command Center (`commandcenter`, hoje
      gerenciado via `migrations-pg/` + `server/migrate.ts` + tabela
      `_migrations`, 39 arquivos `.sql`) pro sistema de migrations do
      Prisma. Confirmado com o usuário: é só sobre o `commandcenter` —
      **nada a ver com `resgate`** (banco do mapa/aircraft-tracker, esse
      continua sendo criado direto em Prisma desde o início, sem SQL
      legado pra migrar).
- [ ] Separar backend do frontend do Command Center, virando o backend uma
      API consumível — hoje `server/index.ts` serve os dois no mesmo
      processo/porta (frontend React buildado + backend Hono/Node), ver
      comentário no `docker-compose.yml` raiz. Confirmado: escopo é só o
      `app` do Command Center — `map-api`/`map-frontend` (mapa) já são
      containers separados, não entram nesse esforço.

**Ainda em aberto antes de virar checklist executável:**
- Estratégia de migração do `migrations-pg` pro Prisma: `prisma db pull`
  (introspecção do schema já existente, gera o Prisma schema a partir do
  banco real) + `prisma migrate resolve --applied` pra cada uma das 39
  já aplicadas (baseline, sem re-rodar SQL antigo)? Precisa validar essa
  abordagem antes de decidir.
- Como isso se relaciona com o scaffolding de CI/CD achado na branch
  `new-infra` (Azure DevOps) e com `TAREFAS_Docker_Azure_DevOps.md` — é o
  mesmo esforço, um se apoia no outro, ou são independentes?
- Etapas concretas do split backend/frontend (ex: o que muda em
  `server/index.ts`/`server/app.ts`, novo serviço no `docker-compose.yml`
  no molde `map-api`/`map-frontend`, CORS, sessão/auth entre os dois) —
  nada disso desenhado ainda.
