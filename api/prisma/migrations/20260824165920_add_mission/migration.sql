-- CreateTable
CREATE TABLE "missions" (
    "id" INTEGER NOT NULL,
    "call_id" TEXT NOT NULL,
    "vehicle_id" INTEGER,
    "team_id" INTEGER,
    "state" TEXT,
    "trip_type" TEXT,
    "operation_status" TEXT,
    "current_status_text" TEXT,
    "short_status_text" TEXT,
    "acceptance_status" TEXT,
    "departed_to_origin_status" TEXT,
    "arrived_at_origin_status" TEXT,
    "departed_to_dest_status" TEXT,
    "arrived_at_dest_status" TEXT,
    "finished_status" TEXT,
    "assigned_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "last_action_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "eta_origin" TIMESTAMP(3),
    "eta_destination" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "missions_call_id_key" ON "missions"("call_id");

-- CreateIndex
CREATE INDEX "missions_vehicle_id_idx" ON "missions"("vehicle_id");
