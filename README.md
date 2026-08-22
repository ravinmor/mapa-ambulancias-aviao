# Mapa de ambulâncias — como rodar

## Antes de tudo: Docker Desktop não funciona nessa máquina

Docker Desktop está com um bug (não abre). O app roda através de um Docker Engine
instalado direto numa distro WSL2 chamada **Ubuntu** — separado do Docker Desktop.
Todo comando abaixo passa por `wsl -d Ubuntu`, não pelo `docker` do Windows direto.

**Importante**: essa distro desliga sozinha depois de alguns minutos sem uso, e
isso derruba os containers junto. Enquanto estiver usando o app, deixe uma janela
de terminal aberta dentro da distro (passo 1 abaixo) — isso já evita o problema.

## 1. Abrir uma sessão de trabalho

Abra um PowerShell e rode:

```bash
wsl -d Ubuntu -u root
cd /mnt/d/Claude/Command-SI/mapa-ambulancias-aviao
```

Deixe essa janela aberta enquanto for usar o app. A partir daqui, todo comando
abaixo é digitado direto nessa janela (sem precisar do `wsl -d Ubuntu -u root --`
na frente).

Se preferir rodar um comando pontual sem deixar a janela aberta, dá pra fazer
tudo numa linha só a partir do PowerShell normal:

```bash
wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/Claude/Command-SI/mapa-ambulancias-aviao && docker compose ps"
```

## 2. Comandos do dia a dia

**Iniciar o app** (containers em segundo plano):
```bash
docker compose up -d
```

**Iniciar reconstruindo as imagens** (depois de mudar código em `api/`, `sync-job/` ou `frontend/`):
```bash
docker compose up --build -d
```

**Ver status dos containers**:
```bash
docker compose ps
```

**Ver status incluindo containers parados/com erro**:
```bash
docker compose ps -a
```

**Ver logs**:
```bash
docker compose logs                # tudo, até agora
docker compose logs -f             # tudo, acompanhando ao vivo (Ctrl+C pra sair)
docker compose logs sync-job       # só um serviço
docker compose logs -f api         # um serviço, ao vivo
```

**Parar os containers** (mantém tudo pra religar rápido depois):
```bash
docker compose stop
```

**Derrubar os containers** (remove os containers, mas mantém os dados do Postgres):
```bash
docker compose down
```

**Resetar tudo do zero** (apaga também os dados do Postgres — próxima subida roda o `db/init.sql` de novo):
```bash
docker compose down -v
docker compose up --build -d
```

**Reiniciar só um serviço**:
```bash
docker compose restart api
```

## 3. Acessar o mapa

Com os containers rodando: [http://localhost:3000](http://localhost:3000) (frontend
Vite/React, servido por nginx, que já encaminha as chamadas de API/WebSocket pro
container da `api` — não precisa apontar pra outra porta).

A `api` também fica exposta direto em [http://localhost:3001](http://localhost:3001),
só pra debug (curl/Postman), sem passar pelo frontend.

## 4. Problemas comuns

**Os containers "sumiram" sozinhos depois de um tempo parado.**
A distro WSL2 desligou por ociosidade. É só rodar `docker compose up -d` de novo —
os dados continuam no volume, não perde nada. Pra evitar, mantenha a janela do
passo 1 aberta enquanto estiver usando o app.

**Mudei o `db/init.sql` e não mudou nada no banco.**
Esse script só roda automaticamente na primeira vez que o volume do Postgres é
criado. Pra aplicar mudanças nele: `docker compose down -v` (apaga o volume) e
depois `docker compose up --build -d`.

**O Windows mostra erro ao abrir o Docker Desktop.**
Pode ignorar — não é necessário pra esse projeto, o app não depende dele.

**Quero rodar com dados reais do SharePoint em vez do modo simulado.**
Precisa preencher as variáveis `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `LISTA_AMBULANCIAS_ID`,
`LISTA_RASTREIO_ID` (ver `.env.example`) e trocar `FONTE_DADOS` de `simulado`
para `sharepoint` no `docker-compose.yml`, serviço `sync-job`.
