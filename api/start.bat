@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

set DATABASE_URL=postgres://postgres@localhost:5432/vehicles
set PORT=3000
set BROADCAST_INTERVAL_MS=5000
set AIRCRAFT_BROADCAST_INTERVAL_MS=30000
set CORS_ORIGIN=*

rem MESMA variavel/valor do sync-job/start.bat (ver comentario la) -- precisa
rem ser identica pra api filtrar a listagem (getTrackedAircraft) pra frota
rem configurada agora, em vez de devolver toda linha historica (bug
rem corrigido 2026-09-09: "ainda tem varias aeronaves na frota").
set TRACKED_AIRCRAFT_ICAO24S=e48006,e49e3a,e48987,e49bfd

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
