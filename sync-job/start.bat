@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

rem Unico valor fixo aqui de proposito (2026-09-16): e uma constante do
rem Postgres local (pg_ctl do Passo 1), nao um segredo nem algo que varia
rem por maquina. TUDO que varia por maquina (DATA_SOURCE, POWER_AUTOMATE_*,
rem OPENSKY_SOURCE, TRACKED_AIRCRAFT_ICAO24S, intervalos) NAO fica mais
rem escrito aqui -- isso e o que causava conflito de "git pull" toda vez que
rem alguem editava este arquivo pra apontar pro SharePoint real. Em vez
rem disso, crie um ".env" na raiz do projeto (C:\projects\mapa-ambulancias-
rem aviao\.env, gitignored, nunca commitado -- ver .env.example pro
rem formato) com esses valores. O node (dist\index.js) carrega esse .env
rem sozinho ao iniciar.
set DATABASE_URL=postgres://postgres@localhost:5432/vehicles

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
