-- CreateTable
CREATE TABLE "aircraft" (
    "id" SERIAL NOT NULL,
    "icao24" TEXT NOT NULL,
    "callsign" TEXT,
    "origin_country" TEXT,
    "tracked_region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "velocity" DOUBLE PRECISION,
    "true_track" DOUBLE PRECISION,
    "vertical_rate" DOUBLE PRECISION,
    "on_ground" BOOLEAN NOT NULL DEFAULT false,
    "squawk" TEXT,
    "position_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft_position_history" (
    "id" SERIAL NOT NULL,
    "aircraft_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "velocity" DOUBLE PRECISION,
    "true_track" DOUBLE PRECISION,
    "position_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircraft_position_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_icao24_key" ON "aircraft"("icao24");

-- CreateIndex
CREATE INDEX "aircraft_tracked_region_idx" ON "aircraft"("tracked_region");

-- CreateIndex
CREATE INDEX "idx_aircraft_history_time" ON "aircraft_position_history"("position_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_aircraft_position" ON "aircraft_position_history"("aircraft_id", "position_at");

-- AddForeignKey
ALTER TABLE "aircraft_position_history" ADD CONSTRAINT "aircraft_position_history_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
