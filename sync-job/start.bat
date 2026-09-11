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

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
