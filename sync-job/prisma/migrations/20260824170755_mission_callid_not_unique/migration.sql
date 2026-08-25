-- DropIndex
DROP INDEX "missions_call_id_key";

-- CreateIndex
CREATE INDEX "missions_call_id_idx" ON "missions"("call_id");
