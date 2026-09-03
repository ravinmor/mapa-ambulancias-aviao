-- CreateTable
CREATE TABLE "tracked_aircraft" (
    "id" SERIAL NOT NULL,
    "icao24" TEXT NOT NULL,
    "label" TEXT,
    "callsign" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "velocity" DOUBLE PRECISION,
    "true_track" DOUBLE PRECISION,
    "vertical_rate" DOUBLE PRECISION,
    "on_ground" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "position_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracked_aircraft_icao24_key" ON "tracked_aircraft"("icao24");
