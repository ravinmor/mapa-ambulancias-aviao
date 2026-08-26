@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

rem Mesma porta que o Docker usava (10.186.0.199:3010), pra nao precisar
rem trocar o endereco configurado no painel de LED.
set PORT=3010
set API_HOST=localhost
set API_PORT=3000

cd /d "%~dp0"
"%NODE_EXE%" server.cjs
