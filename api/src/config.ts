function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export interface Config {
  databaseUrl: string;
  // Banco `resgate` (nucleo), separado do map-postgres acima — usado so
  // pelas rotas de missao aerea (missaoAerea.ts). Opcional de proposito
  // (sem required()): implantacoes existentes do container nao tem essa
  // env var ainda, e a api inteira nao pode deixar de subir por causa de
  // uma feature nova e isolada — ver ausencia tratada em dbResgate.ts.
  resgateDatabaseUrl: string | undefined;
  port: number;
  corsOrigin: string;
  broadcastIntervalMs: number;
  historyWindowHours: number;
  historyRowLimit: number;
  aircraftBroadcastIntervalMs: number;
  aircraftHistoryWindowHours: number;
  // Corte do rastro por intervalo entre pontos. A aeronave e identificada
  // pelo icao24, entao se ela sai da area e volta horas depois, reocupa a
  // MESMA linha — sem esse corte, o trajeto ligaria os dois trechos com uma
  // reta atravessando o mapa. Tambem cobre o caso do sync-job ter ficado fora
  // do ar no meio. Default 20 min = 4 ciclos de 5 min: tolera um ciclo ou
  // outro perdido sem quebrar um rastro legitimo.
  aircraftTrailGapMinutes: number;
  // Mesma ideia dos 2 campos acima, so que pro trajeto das aeronaves
  // ESPECIFICAS (TrackedAircraft) — pedido do usuario, 2026-09-02. Janela
  // maior (48h, nao 24h) porque essas aeronaves ficam a maior parte do dia
  // PARADAS (sem ADS-B nenhum) — um voo de horas atras ainda deve aparecer.
  // Gap maior (45min, nao 20) porque o intervalo entre chamadas tambem e
  // maior aqui (5-15min, contra 5min fixo do generico) — ver
  // TrackedAircraftConfig em sync-job/src/config.ts.
  trackedAircraftHistoryWindowHours: number;
  trackedAircraftTrailGapMinutes: number;
  // Trajeto via Garmin inReach MapShare (2026-09-22) — janela/gap PROPRIOS,
  // diferentes do trajeto OpenSky acima: o inReach reporta so a cada
  // ~10-40min (medido ao vivo, bem mais espacado que ADS-B), entao o gap
  // pra "cortar o trajeto" precisa ser maior (senao um voo real vira varios
  // pedacos desconectados), e a janela tambem maior (poucos pontos por
  // hora, um historico curto mostraria quase nada).
  garminHistoryWindowHours: number;
  garminTrailGapMinutes: number;
  // trackedAircraftIcao24List NAO existe aqui (diferente do repo original) —
  // nesta integracao com o Command Center, a frota monitorada e 100%
  // dirigida pela coluna tracked_aircraft.active do Postgres, editavel em
  // runtime via POST/PATCH /api/admin/tracked-aircraft, sem redeploy (D-08
  // desta branch, ver docker-compose.yml). Nao reintroduzir a lista via env
  // var numa sincronizacao futura do subtree.
}

const config: Config = {
  databaseUrl: required('DATABASE_URL'),
  resgateDatabaseUrl: process.env.RESGATE_DATABASE_URL || undefined,
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  broadcastIntervalMs: Number(process.env.BROADCAST_INTERVAL_MS || 5000),
  historyWindowHours: Number(process.env.HISTORY_WINDOW_HOURS || 24),
  historyRowLimit: Number(process.env.HISTORY_ROW_LIMIT || 5000),
  aircraftBroadcastIntervalMs: Number(process.env.AIRCRAFT_BROADCAST_INTERVAL_MS || 30000),
  aircraftHistoryWindowHours: Number(process.env.AIRCRAFT_HISTORY_WINDOW_HOURS || 24),
  aircraftTrailGapMinutes: Number(process.env.AIRCRAFT_TRAIL_GAP_MINUTES || 20),
  trackedAircraftHistoryWindowHours: Number(process.env.TRACKED_AIRCRAFT_HISTORY_WINDOW_HOURS || 48),
  trackedAircraftTrailGapMinutes: Number(process.env.TRACKED_AIRCRAFT_TRAIL_GAP_MINUTES || 45),
  garminHistoryWindowHours: Number(process.env.GARMIN_HISTORY_WINDOW_HOURS || 24 * 14),
  garminTrailGapMinutes: Number(process.env.GARMIN_TRAIL_GAP_MINUTES || 90),
};

export default config;
