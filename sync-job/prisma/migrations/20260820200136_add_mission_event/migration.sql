-- CreateTable
CREATE TABLE "mission_events" (
    "id" INTEGER NOT NULL,
    "call_id" TEXT,
    "operation_id" TEXT,
    "availability_id" TEXT,
    "trip_type" TEXT,
    "status_message" TEXT NOT NULL,
    "message" TEXT,
    "access_type" TEXT,
    "state" TEXT,
    "read_status_requester" INTEGER,
    "read_status_control" INTEGER,
    "read_status_rescue" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "mission_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mission_events_operation_id_idx" ON "mission_events"("operation_id");

-- CreateIndex
CREATE INDEX "mission_events_call_id_idx" ON "mission_events"("call_id");

-- CreateIndex
CREATE INDEX "idx_mission_event_time" ON "mission_events"("created_at");
