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
rem manualmente). Renovacao 2026-09-11 (pedido do usuario: "aeronaves
rem aleatorias novas") -- 4 aeronaves reais, descida confirmada ao vivo via
rem OpenSky no momento da troca:
rem e48006=GLO9618 (~846m/~6.5m/s), e49e3a=BPC6302 (~1509m/~5.8m/s),
rem e48987=GLO1845 (~2682m/~5.8m/s), e49bfd=TAM3223 (~2515m/~5.5m/s).
set TRACKED_AIRCRAFT_ICAO24S=e48006,e49e3a,e48987,e49bfd

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
