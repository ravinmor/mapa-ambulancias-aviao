import config from './config';
import { prisma } from './db';
import { fetchGarminMapShareState } from './sources/garminMapShare';

// Rastreamento alternativo via Garmin inReach MapShare (2026-09-22) — ver
// sources/garminMapShare.ts pro racional completo (aeronave sem ADS-B
// alcancavel por nenhuma rede publica, confirmado ao vivo). Ciclo PROPRIO,
// independente do scanner de OpenSky (trackedAircraft.ts) — os dois rodam
// em paralelo pra MESMA aeronave sem conflito, escrevendo em colunas
// separadas (garmin* vs. as colunas normais).
export async function runGarminTrackingCycle(): Promise<void> {
  const cfg = config.garminTracking;
  if (!cfg) return;

  let state;
  try {
    state = await fetchGarminMapShareState(cfg.shareId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sync-job] erro consultando Garmin MapShare (${cfg.shareId}):`, message);
    return;
  }

  if (!state) {
    console.warn(`[sync-job] Garmin MapShare (${cfg.shareId}) sem posicao valida nesta leitura`);
    return;
  }

  const row = await prisma.trackedAircraft.upsert({
    where: { icao24: cfg.icao24 },
    create: {
      icao24: cfg.icao24,
      garminLatitude: state.latitude,
      garminLongitude: state.longitude,
      garminAltitude: state.altitude,
      garminVelocity: state.velocity,
      garminTrueTrack: state.trueTrack,
      garminInEmergency: state.inEmergency,
      garminOnline: true,
      garminPositionAt: state.positionAt,
    },
    update: {
      garminLatitude: state.latitude,
      garminLongitude: state.longitude,
      garminAltitude: state.altitude,
      garminVelocity: state.velocity,
      garminTrueTrack: state.trueTrack,
      garminInEmergency: state.inEmergency,
      garminOnline: true,
      garminPositionAt: state.positionAt,
    },
    select: { id: true },
  });

  // Trajeto (pedido do usuario, 2026-09-22: "pegue o trajeto do voo da
  // garmin e adapte ao meu trajeto com diferenciacao por altitude") — mesmo
  // esquema do trajeto OpenSky (TrackedAircraftPositionHistory), tabela
  // SEPARADA (GarminPositionHistory, ver comentario no schema).
  // skipDuplicates cobre o caso da mesma leitura vir de novo (o inReach as
  // vezes repete o ultimo ponto entre polls quando nao ha fix novo).
  await prisma.garminPositionHistory.createMany({
    data: [
      {
        trackedAircraftId: row.id,
        latitude: state.latitude,
        longitude: state.longitude,
        altitude: state.altitude,
        velocity: state.velocity,
        trueTrack: state.trueTrack,
        positionAt: state.positionAt,
      },
    ],
    skipDuplicates: true,
  });

  console.log(
    `[sync-job] Garmin MapShare (${cfg.shareId}) ok — lat ${state.latitude.toFixed(4)}, lon ${state.longitude.toFixed(4)}, alt ${Math.round(state.altitude ?? 0)}m, vel ${Math.round((state.velocity ?? 0) * 3.6)}km/h, posicao de ${state.positionAt.toISOString()}`,
  );

  // Mesma retencao do trajeto OpenSky (config.trackedAircraft), sem
  // variavel de ambiente propria — nao ha motivo pra reter os 2 trajetos
  // por tempos diferentes.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.trackedAircraft.historyRetentionDays);
  await prisma.garminPositionHistory.deleteMany({ where: { positionAt: { lt: cutoff } } });
}
