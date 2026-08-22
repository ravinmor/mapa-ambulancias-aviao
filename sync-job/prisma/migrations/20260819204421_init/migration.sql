-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IN_SERVICE', 'INACTIVE', 'MAINTENANCE', 'AVAILABLE', 'RESERVE', 'EVENT_SUPPORT');

-- CreateTable
CREATE TABLE "current_positions" (
    "vehicle_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "position_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_positions_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "position_history" (
    "id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "position_at" TIMESTAMP(3) NOT NULL,
    "vehicle_status" "VehicleStatus",
    "call_id" TEXT,
    "operation_id" TEXT,
    "app_version" TEXT,
    "device" TEXT,

    CONSTRAINT "position_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license_plate" TEXT,
    "vehicle_type" TEXT,
    "state" TEXT,
    "status" "VehicleStatus",
    "activity_status" TEXT,
    "assignment_status" TEXT,
    "tablet_email" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_history_vehicle_time" ON "position_history"("vehicle_id", "position_at" DESC);

-- CreateIndex
CREATE INDEX "idx_history_time" ON "position_history"("position_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicle_id_key" ON "vehicles"("vehicle_id");

-- AddForeignKey
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
