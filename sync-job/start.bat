@echo off
setlocal

rem Ajuste NODE_EXE se o node.exe nao estiver no PATH da maquina.
set NODE_EXE=node

set DATABASE_URL=postgres://postgres@localhost:5432/vehicles
set SYNC_INTERVAL_MS=5000
set HISTORY_SYNC_INTERVAL_MS=30000
set HISTORY_BACKFILL_INTERVAL_MS=300000
set MISSION_EVENT_SYNC_INTERVAL_MS=30000
set DATA_SOURCE=sharepoint
set POWER_AUTOMATE_FLEET_URL=https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/19/workflows/a9f6c976a71d4127b2173dcd6560300e/triggers/manual/paths/invoke?api-version=1&sp=%%2Ftriggers%%2Fmanual%%2Frun&sv=1.0&sig=7wwg4mFGkinMw6vifHbem6js5Am4laM8MH5uFqA-Yts
set POWER_AUTOMATE_TRACKING_URL=https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/27/workflows/89e2305152e64223a191f7c3f55d12ac/triggers/manual/paths/invoke?api-version=1&sp=%%2Ftriggers%%2Fmanual%%2Frun&sv=1.0&sig=i8XIqy-x4k-5rgWTv9j7QtFyPKhz3J00kfIgiHK25PM
set POWER_AUTOMATE_HISTORY_BACKFILL_URL=https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/12/workflows/3f2d9bf98b94476c9278cd984995ab55/triggers/manual/paths/invoke?api-version=1&sp=%%2Ftriggers%%2Fmanual%%2Frun&sv=1.0&sig=0A3bqXhT0NgCnZFMInP5Qz9cprvzBSAwWxnZU9ZGvZU
set POWER_AUTOMATE_MISSIONS_URL=https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/d305b1dc2f9a4cdaa48c6f3781b063b6/triggers/manual/paths/invoke?api-version=1&sp=%%2Ftriggers%%2Fmanual%%2Frun&sv=1.0&sig=1U1qo_JlhfwE5N2IlM3BlWrwXkrS2rNbew22JQHfAvI
set POWER_AUTOMATE_REGULATIONS_URL=https://651698189495e1b8a2884489493203.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/01/workflows/b8953810710e4b21b12b3094a1cfd4b4/triggers/manual/paths/invoke?api-version=1&sp=%%2Ftriggers%%2Fmanual%%2Frun&sv=1.0&sig=tVmoNinoh7whC4oH5xGzSCJ2NJaSys_dFoa5X8s_VPE
set OPENSKY_SOURCE=live
set AIRCRAFT_SYNC_INTERVAL_MS=300000
set TRACKED_AIRCRAFT_ICAO24S=c038cc,e80491,e4a2b8,e49608

cd /d "%~dp0"
"%NODE_EXE%" dist\index.js
