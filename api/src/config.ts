function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export interface Config {
  databaseUrl: string;
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
}

const config: Config = {
  databaseUrl: required('DATABASE_URL'),
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
};

export default config;
