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

# Deteccao de agendamento via fluxo Power Automate PA-RESGATE-
# GerenciaSolicitacoes (app de resgate, diferente dos flows
# MapaAmbulancias_* acima). Desde a v4 (2026-09-24) itera TODAS as
# aeronaves do fluxo sozinho -- AIRCRAFT_SCHEDULING_ICAO24/REGISTRATION
# (par fixo antigo) nao existem mais, removidos daqui tambem.
#
# URL de PRODUCAO, trocada 2026-09-25 -- a URL antiga aqui (ambiente
# 651698189495e1b8a2884489493203.e6, mesmo prefixo do LOG_AEREO homologacao
# abaixo) era HOMOLOGACAO apesar do nome do site (AmilResgateProd, SEM
# numero) parecer producao. O site de producao de verdade e' AmilResgatePROD2
# (com numero) -- confirmado ao vivo, dado real de 4 aeronaves (LEARJET 31 =
# PT-WLO, KOALA = PP-AMI). ATENCAO: essa lista de producao NAO tem a coluna
# ICAO24 ainda (existe so' na de homologacao) -- precisa ser criada e
# preenchida la tambem antes do alerta de decolagem linkar com o rastreio
# real.
$env:POWER_AUTOMATE_SOLICITACOES_URL = "https://defaulte79034b6c14f4d3ea08fd8d7d46432.71.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/21/workflows/c9eb34c931ce4ddc85d7a2f38ce309fd/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=rETRQvxv_vZ6dwVmXse60uW0uB48n_H2hXK1n5JU0LU"

# Log de eventos REAIS do piloto (2026-09-25) -- fluxo Power Automate
# MapaAmbulancias_ObterLogAereo, lista f_Log_Aereo. Botoes que o piloto vai
# clicando durante o voo (Saida da Base aerea/Chegada na origem/Saida da
# origem/Chegada no destino final) -- alimenta os alertas "prestes a
# decolar"/"aproximando do destino" no Command Center.
#
# URL de PRODUCAO (ambiente Power Automate de producao, dentro da Solucao
# "Amil Resgate - Aeronave", apontando pro site AmilResgatePROD2). A 1a
# versao desse fluxo tinha sido criada por engano no ambiente de
# homologacao (mesmo ID de ambiente da URL antiga de
# POWER_AUTOMATE_SOLICITACOES_URL acima), so' apontando pro site certo --
# corrigido recriando o fluxo depois de trocar de ambiente de verdade.
$env:POWER_AUTOMATE_LOG_AEREO_URL = "https://defaulte79034b6c14f4d3ea08fd8d7d46432.71.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/377fea6ff1a14a848c9def3e4b4fdef1/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lLafs3HoYbwo6EVAXcTZ8MmEMKn6UGUpSixiFDf9ihc"

# PT-WLO (2026-09-23) — posicao real via Garmin inReach MapShare (a
# aeronave nao emite ADS-B alcancavel por nenhuma rede publica). Feed KML
# publico: https://share.garmin.com/FREXJ
$env:GARMIN_MAPSHARE_ID = "FREXJ"
$env:GARMIN_TRACKING_ICAO24 = "e48019"

Set-Location $PSScriptRoot
& $NODE_EXE dist\index.js
