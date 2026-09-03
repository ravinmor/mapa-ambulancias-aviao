-- CreateTable
CREATE TABLE "tracked_aircraft_position_history" (
    "id" SERIAL NOT NULL,
    "tracked_aircraft_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "velocity" DOUBLE PRECISION,
    "true_track" DOUBLE PRECISION,
    "position_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_aircraft_position_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tracked_aircraft_history_time" ON "tracked_aircraft_position_history"("position_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_tracked_aircraft_position" ON "tracked_aircraft_position_history"("tracked_aircraft_id", "position_at");

-- AddForeignKey
ALTER TABLE "tracked_aircraft_position_history" ADD CONSTRAINT "tracked_aircraft_position_history_tracked_aircraft_id_fkey" FOREIGN KEY ("tracked_aircraft_id") REFERENCES "tracked_aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
