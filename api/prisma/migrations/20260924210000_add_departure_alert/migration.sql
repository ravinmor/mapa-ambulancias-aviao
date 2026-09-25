-- Alerta "prestes a decolar" (v4, 2026-09-24)
ALTER TABLE "tracked_aircraft" ADD COLUMN "scheduled_departure_at" TIMESTAMP(3);
ALTER TABLE "tracked_aircraft" ADD COLUMN "departure_alert_mission_id" INTEGER;
ALTER TABLE "tracked_aircraft" ADD COLUMN "departure_alert_at" TIMESTAMP(3);
