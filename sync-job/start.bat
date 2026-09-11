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
rem variavel cai no fallback antigo do config.ts, que tinha 2 das 4
rem aeronaves sem posicao ao vivo (sintoma real, 2026-09-11: "alerta abre
rem mas nao foca a aeronave no mapa" -- aircraftList[0] caia numa aeronave
rem sem posicao, e /aviacao-executiva so' auto-seleciona quem esta na
rem lista AO VIVO). Dessa vez escolhidas SUBINDO (vrate positivo, acabaram
rem de decolar) em vez de descendo -- ficam no ar por mais tempo, pedido do
rem usuario 2026-09-11 ("pode estar voando", nao precisa ser descendo).
rem e48b01=GLO1027 (~6500m subindo), e4991d=JTL20 (~6972m subindo),
rem e497e5=GLO1654 (~8161m subindo), e480a2=TAM3286 (~6927m subindo).
set TRACKED_AIRCRAFT_ICAO24S=e48b01,e4991d,e497e5,e480a2

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
