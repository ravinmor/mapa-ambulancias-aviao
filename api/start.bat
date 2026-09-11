@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

set DATABASE_URL=postgres://postgres@localhost:5432/vehicles
set PORT=3000
set BROADCAST_INTERVAL_MS=5000
set AIRCRAFT_BROADCAST_INTERVAL_MS=30000
set CORS_ORIGIN=*

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
