-- AlterTable
ALTER TABLE "tracked_aircraft" ADD COLUMN     "garmin_altitude" DOUBLE PRECISION,
ADD COLUMN     "garmin_in_emergency" BOOLEAN,
ADD COLUMN     "garmin_latitude" DOUBLE PRECISION,
ADD COLUMN     "garmin_longitude" DOUBLE PRECISION,
ADD COLUMN     "garmin_online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "garmin_position_at" TIMESTAMP(3),
ADD COLUMN     "garmin_true_track" DOUBLE PRECISION,
ADD COLUMN     "garmin_velocity" DOUBLE PRECISION;
