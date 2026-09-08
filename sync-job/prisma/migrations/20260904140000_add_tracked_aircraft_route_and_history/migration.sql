-- AlterTable
ALTER TABLE "tracked_aircraft" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "model" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "operator" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "origin_icao" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "origin_name" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "destination_icao" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "destination_name" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "route_callsign" TEXT;
ALTER TABLE "tracked_aircraft" ADD COLUMN "history_synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tracked_aircraft_flight_history" (
    "id" SERIAL NOT NULL,
    "tracked_aircraft_id" INTEGER NOT NULL,
    "callsign" TEXT,
    "departure_icao" TEXT,
    "arrival_icao" TEXT,
    "departed_at" TIMESTAMP(3) NOT NULL,
    "arrived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_aircraft_flight_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracked_aircraft_flight_history_tracked_aircraft_id_depar_key" ON "tracked_aircraft_flight_history"("tracked_aircraft_id", "departed_at");

-- AddForeignKey
ALTER TABLE "tracked_aircraft_flight_history" ADD CONSTRAINT "tracked_aircraft_flight_history_tracked_aircraft_id_fkey" FOREIGN KEY ("tracked_aircraft_id") REFERENCES "tracked_aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
