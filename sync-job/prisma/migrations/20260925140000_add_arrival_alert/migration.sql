-- Alerta "aproximando do destino" (2026-09-25)
ALTER TABLE "tracked_aircraft" ADD COLUMN "scheduled_arrival_at" TIMESTAMP(3);
ALTER TABLE "tracked_aircraft" ADD COLUMN "arrival_alert_mission_id" INTEGER;
ALTER TABLE "tracked_aircraft" ADD COLUMN "arrival_alert_at" TIMESTAMP(3);
