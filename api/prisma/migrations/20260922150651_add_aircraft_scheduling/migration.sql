-- AlterTable
ALTER TABLE "tracked_aircraft" ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "scheduling_status" TEXT;

-- RenameIndex
ALTER INDEX "tracked_aircraft_flight_history_tracked_aircraft_id_depar_key" RENAME TO "tracked_aircraft_flight_history_tracked_aircraft_id_departe_key";
