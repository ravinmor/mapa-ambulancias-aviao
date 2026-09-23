# Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
$NODE_EXE = "node"

# Rede da empresa bloqueia a checagem de revogacao de certificado
# (CRYPT_E_NO_REVOCATION_CHECK) -- sem isso o fetch pro Power Automate
# falha sempre. So usar confiando na rede interna da empresa.
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"

$env:DATABASE_URL = "postgres://postgres@localhost:5432/vehicles"
$env:SYNC_INTERVAL_MS = "5000"
$env:HISTORY_SYNC_INTERVAL_MS = "30000"
$env:HISTORY_BACKFILL_INTERVAL_MS = "300000"
$env:MISSION_EVENT_SYNC_INTERVAL_MS = "30000"
$env:DATA_SOURCE = "sharepoint"
$env:POWER_AUTOMATE_FLEET_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/19/workflows/a9f6c976a71d4127b2173dcd6560300e/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=7wwg4mFGkinMw6vifHbem6js5Am4laM8MH5uFqA-Yts"
$env:POWER_AUTOMATE_TRACKING_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/27/workflows/89e2305152e64223a191f7c3f55d12ac/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=i8XIqy-x4k-5rgWTv9j7QtFyPKhz3J00kfIgiHK25PM"
$env:POWER_AUTOMATE_HISTORY_BACKFILL_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/12/workflows/3f2d9bf98b94476c9278cd984995ab55/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=0A3bqXhT0NgCnZFMInP5Qz9cprvzBSAwWxnZU9ZGvZU"
$env:POWER_AUTOMATE_MISSIONS_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/d305b1dc2f9a4cdaa48c6f3781b063b6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=1U1qo_JlhfwE5N2IlM3BlWrwXkrS2rNbew22JQHfAvI"
$env:POWER_AUTOMATE_REGULATIONS_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/01/workflows/b8953810710e4b21b12b3094a1cfd4b4/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=tVmoNinoh7whC4oH5xGzSCJ2NJaSys_dFoa5X8s_VPE"
$env:OPENSKY_SOURCE = "live"
$env:AIRCRAFT_SYNC_INTERVAL_MS = "300000"
# e48019 = PT-WLO (2026-09-23) -- rastreamento dele hoje vem so do Garmin
# (aircraftScheduling.ts/garminTracking.ts, config proprio abaixo), mas
# mantendo tambem aqui pra consistencia com api/start.bat e pro scanner de
# OpenSky pegar automaticamente se um dia a aeronave passar a emitir ADS-B.
$env:TRACKED_AIRCRAFT_ICAO24S = "c038cc,e80491,e4a2b8,e49608,e48019"

# PT-WLO (2026-09-23) — deteccao de agendamento via fluxo Power Automate
# PA-RESGATE-GerenciaSolicitacoes (app de resgate, diferente dos flows
# MapaAmbulancias_* acima). AIRCRAFT_SCHEDULING_REGISTRATION ainda aponta
# pro placeholder de HOMOLOGACAO (654321) -- trocar pro registro real assim
# que o fluxo de producao estiver disponivel (ver CONTROLE_Aeronave_Amil.md).
$env:POWER_AUTOMATE_SOLICITACOES_URL = "https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/fb79cf3e849f4ab494a40148a6a84590/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=g90eQbjnxSyKHv0XZRXQOdj2aLmCX5vkZTexCYFHjeI"
$env:AIRCRAFT_SCHEDULING_ICAO24 = "e48019"
$env:AIRCRAFT_SCHEDULING_REGISTRATION = "654321"

# PT-WLO (2026-09-23) — posicao real via Garmin inReach MapShare (a
# aeronave nao emite ADS-B alcancavel por nenhuma rede publica). Feed KML
# publico: https://share.garmin.com/FREXJ
$env:GARMIN_MAPSHARE_ID = "FREXJ"
$env:GARMIN_TRACKING_ICAO24 = "e48019"

Set-Location $PSScriptRoot
& $NODE_EXE dist\index.js
