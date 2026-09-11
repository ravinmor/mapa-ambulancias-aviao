@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

set DATABASE_URL=postgres://postgres@localhost:5432/vehicles
set SYNC_INTERVAL_MS=5000
set HISTORY_SYNC_INTERVAL_MS=30000
set MISSION_EVENT_SYNC_INTERVAL_MS=30000
set DATA_SOURCE=simulated
set OPENSKY_SOURCE=live
set AIRCRAFT_SYNC_INTERVAL_MS=300000

rem Frota de aeronaves monitoradas (rota /aviacao-executiva) -- sem essa
rem variavel cai no fallback antigo do config.ts (e49ef1,e48ba9,e49f52,
rem e4a50e), que nao reflete nenhuma renovacao feita via docker-compose.yml
rem (esse .bat NAO le o .env, entao precisa ser mantida em dia aqui
rem manualmente). Aeronaves "descendo agora" pousam em minutos -- por isso
rem essa lista fica DESATUALIZADA rapido (sintoma real, 2026-09-11: "o
rem alerta parou de funcionar" -- causa raiz era a frota inteira ja ter
rem pousado e sumido do rastreador, aircraftList ficando vazia). Renovar
rem sempre que os testes de alerta pararem de achar aeronave.
rem Renovacao 2026-09-11 (2a rodada, mesmo dia) -- 4 aeronaves reais,
rem descida confirmada ao vivo via OpenSky no momento da troca:
rem e47f51=GLO1435 (~2903m/~5.8m/s), e48274=TAM3177 (~2438m/~5.5m/s),
rem e4827c=TAM4553 (~2637m/~5.5m/s), e48e77=GLO1529 (~3886m/~5.2m/s).
set TRACKED_AIRCRAFT_ICAO24S=e47f51,e48274,e4827c,e48e77

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
