-- Alertas de decolagem/aproximacao v5 (2026-09-25) -- troca dedup por
-- missionId (v4, horario previsto) por dedup por linha de log real do
-- piloto (fluxo MapaAmbulancias_ObterLogAereo).
ALTER TABLE "tracked_aircraft" DROP COLUMN "scheduled_departure_at";
ALTER TABLE "tracked_aircraft" DROP COLUMN "departure_alert_mission_id";
ALTER TABLE "tracked_aircraft" DROP COLUMN "scheduled_arrival_at";
ALTER TABLE "tracked_aircraft" DROP COLUMN "arrival_alert_mission_id";
ALTER TABLE "tracked_aircraft" ADD COLUMN "departure_alert_log_id" INTEGER;
ALTER TABLE "tracked_aircraft" ADD COLUMN "arrival_alert_log_id" INTEGER;
