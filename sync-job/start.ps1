# Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
$NODE_EXE = "node"

# Rede da empresa bloqueia a checagem de revogacao de certificado
# (CRYPT_E_NO_REVOCATION_CHECK) -- sem isso o fetch pro Power Automate
# falha sempre. So usar confiando na rede interna da empresa.
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"

# Unico valor fixo aqui de proposito (2026-09-16): e uma constante do
# Postgres local (pg_ctl do Passo 1 do guia), nao um segredo nem algo que
# varia por maquina. TUDO que varia por maquina (DATA_SOURCE,
# POWER_AUTOMATE_*, OPENSKY_SOURCE, TRACKED_AIRCRAFT_ICAO24S, intervalos)
# NAO fica mais escrito aqui -- isso e o que causava conflito de "git pull"
# toda vez que alguem editava este arquivo pra apontar pro SharePoint real
# (e, uma vez, corrompeu uma URL com um "%22" sobrando no fim da assinatura
# ao colar). Em vez disso, crie um ".env" na raiz do projeto
# (C:\projects\mapa-ambulancias-aviao\.env, gitignored, nunca commitado --
# ver .env.example pro formato) com esses valores. O node (dist\index.js)
# carrega esse .env sozinho ao iniciar.
$env:DATABASE_URL = "postgres://postgres@localhost:5432/vehicles"

Set-Location $PSScriptRoot
& $NODE_EXE dist\index.js
