-- AlterTable
ALTER TABLE "tracked_aircraft" ADD COLUMN "flight_started_at" TIMESTAMP(3);
ALTER TABLE "tracked_aircraft" ADD COLUMN "flight_ended_at" TIMESTAMP(3);
ALTER TABLE "tracked_aircraft" ADD COLUMN "pending_departure_at" TIMESTAMP(3);
ALTER TABLE "tracked_aircraft" ADD COLUMN "pending_arrival_at" TIMESTAMP(3);
