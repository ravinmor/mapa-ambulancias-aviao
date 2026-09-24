-- CreateEnum
CREATE TYPE "StatusChamado" AS ENUM ('CRIADO_AGUARDANDO_ACEITE', 'CANCELADO', 'IDA_CONCLUIDA', 'VOLTA_CONCLUIDA');

-- CreateEnum
CREATE TYPE "StatusOperacao" AS ENUM ('AGUARDANDO_ACEITE', 'DESLOCANDO_PARA_ORIGEM', 'CHEGOU_NA_ORIGEM', 'DESLOCANDO_PARA_DESTINO', 'CONCLUIDA_PELO_RESGATE', 'CONCLUIDA_PELO_CONTROLE', 'CANCELADA', 'CANCELADA_PELO_RESGATE');

-- CreateEnum
CREATE TYPE "TipoViagem" AS ENUM ('IDA', 'VOLTA');

-- CreateTable
CREATE TABLE "tipos_chamado" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "record_count" TEXT,

    CONSTRAINT "tipos_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_cancelamento" (
    "id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivos_cancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_status_chamado" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "tipos_status_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamados" (
    "id" INTEGER NOT NULL,
    "patient_name" TEXT,
    "medical_record_number" INTEGER,
    "patient_birth_date" TIMESTAMP(3),
    "patient_age" TEXT,
    "patient_sex" TEXT,
    "patient_weight_kg" DOUBLE PRECISION,
    "patient_height_cm" DOUBLE PRECISION,
    "patient_type" TEXT,
    "patient_type_other" TEXT,
    "is_intubated" BOOLEAN,
    "is_obese" BOOLEAN,
    "health_plan" TEXT,
    "contact" TEXT,
    "diagnosis" TEXT,
    "procedure" TEXT,
    "equipment" TEXT,
    "device_usage" TEXT,
    "tipo_chamado_id" INTEGER,
    "call_reason" TEXT,
    "origin_name" TEXT,
    "origin_address" TEXT,
    "origin_sector" TEXT,
    "destination_name" TEXT,
    "destination_address" TEXT,
    "destination_sector" TEXT,
    "companion" TEXT,
    "status" "StatusChamado",
    "status_for_edit" TEXT,
    "motivo_cancelamento_id" INTEGER,
    "cancellation_notes" TEXT,
    "expected_arrival_origin_at" TIMESTAMP(3),
    "actual_arrival_dest_at" TIMESTAMP(3),
    "aereo_request_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_status_history" (
    "id" SERIAL NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "operacao_id" INTEGER,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamado_field_audit" (
    "id" SERIAL NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_field_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diario_da_missao" (
    "id" INTEGER NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "operacao_id" INTEGER,
    "disponibilidade_id" INTEGER,
    "message" TEXT,
    "current_moment" TEXT,
    "trip_type" "TipoViagem",
    "access_type" TEXT,
    "read_status_requester" INTEGER,
    "read_status_control" INTEGER,
    "read_status_rescue" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diario_da_missao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilidades" (
    "id" INTEGER NOT NULL,
    "chamado_id" INTEGER,
    "requester_type" TEXT,
    "ambulance_type" TEXT,
    "tipo_chamado_id" INTEGER,
    "availability_given_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "responded_by_user" TEXT,
    "accepted_or_declined" BOOLEAN,
    "decline_reason" TEXT,
    "responded_at_stage3" TIMESTAMP(3),
    "accepted_by_user" TEXT,
    "finalization_control" TEXT,
    "finalized_at" TIMESTAMP(3),
    "finalized_by_user" TEXT,
    "status" TEXT,
    "control_status" TEXT,
    "requester_status" TEXT,
    "unavailability_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disponibilidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilidade_field_audit" (
    "id" SERIAL NOT NULL,
    "disponibilidade_id" INTEGER NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disponibilidade_field_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaboradores" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "role" TEXT,
    "activity_status" TEXT,
    "whatsapp" TEXT,
    "rg" TEXT,
    "cnh" TEXT,
    "photo_url" TEXT,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipes" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "activity_status" TEXT,
    "whatsapp" TEXT,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composicao_equipe" (
    "id" SERIAL NOT NULL,
    "equipe_id" INTEGER NOT NULL,
    "colaborador_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composicao_equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacoes" (
    "id" INTEGER NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "trip_type" "TipoViagem" NOT NULL,
    "equipe_id" INTEGER,
    "veiculo_id" INTEGER,
    "current_status" "StatusOperacao",
    "short_status" TEXT,
    "operation_status" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by_email" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_email" TEXT,
    "departed_to_origin_at" TIMESTAMP(3),
    "departed_to_origin_by_email" TEXT,
    "arrived_at_origin_at" TIMESTAMP(3),
    "arrived_at_origin_by_email" TEXT,
    "departed_to_dest_at" TIMESTAMP(3),
    "departed_to_dest_by_email" TEXT,
    "arrived_at_dest_at" TIMESTAMP(3),
    "arrived_at_dest_by_email" TEXT,
    "finished_at" TIMESTAMP(3),
    "finished_by_email" TEXT,
    "last_action_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_area_responsible" TEXT,
    "waypoints_json" JSONB,
    "ficha_transporte_frente_url" TEXT,
    "ficha_transporte_verso_url" TEXT,
    "patient_isolation" TEXT,
    "cleaning_nurse" TEXT,
    "app_version" TEXT,
    "device" TEXT,
    "qta" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacao_field_audit" (
    "id" SERIAL NOT NULL,
    "operacao_id" INTEGER NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacao_field_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posicoes_operacao" (
    "id" INTEGER NOT NULL,
    "operacao_id" INTEGER NOT NULL,
    "veiculo_id" INTEGER,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "position_at" TIMESTAMP(3) NOT NULL,
    "vehicle_status" TEXT,
    "action" TEXT,
    "tablet_id" INTEGER,
    "app_version" TEXT,
    "device" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posicoes_operacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posicao_atual_veiculo" (
    "veiculo_id" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "position_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posicao_atual_veiculo_pkey" PRIMARY KEY ("veiculo_id")
);

-- CreateTable
CREATE TABLE "sync_error_log" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "source_item_id" INTEGER,
    "field_name" TEXT,
    "raw_value" TEXT,
    "error_type" TEXT NOT NULL,
    "message" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sync_error_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triagens" (
    "id" INTEGER NOT NULL,
    "chamado_id" INTEGER NOT NULL,
    "diagnosis" TEXT,
    "clinical_history" TEXT,
    "vital_signs" TEXT,
    "resource_type" TEXT,
    "resource_needed" TEXT,
    "companion" TEXT,
    "medications_in_pump" TEXT,
    "bia_ecmo" TEXT,
    "precaution_types" TEXT,
    "weight_and_height" TEXT,
    "incorrect_information" TEXT,
    "interventions" TEXT,
    "needed_medical_contact" BOOLEAN,
    "doctor_name_and_crm" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tablets" (
    "id" INTEGER NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "status" TEXT,
    "user_id" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "position_at" TIMESTAMP(3),

    CONSTRAINT "tablets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veiculos" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "license_plate" TEXT,
    "vehicle_type" TEXT,
    "activity_status" TEXT,
    "operation_status" TEXT,
    "initial_km" DOUBLE PRECISION,
    "tablet_id" INTEGER,
    "tablet_assignment_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veiculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_status_history_chamado_id_idx" ON "chamado_status_history"("chamado_id");

-- CreateIndex
CREATE INDEX "chamado_field_audit_chamado_id_idx" ON "chamado_field_audit"("chamado_id");

-- CreateIndex
CREATE INDEX "diario_da_missao_chamado_id_idx" ON "diario_da_missao"("chamado_id");

-- CreateIndex
CREATE INDEX "diario_da_missao_operacao_id_idx" ON "diario_da_missao"("operacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "disponibilidades_chamado_id_key" ON "disponibilidades"("chamado_id");

-- CreateIndex
CREATE INDEX "disponibilidade_field_audit_disponibilidade_id_idx" ON "disponibilidade_field_audit"("disponibilidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "composicao_equipe_equipe_id_colaborador_id_key" ON "composicao_equipe"("equipe_id", "colaborador_id");

-- CreateIndex
CREATE INDEX "operacoes_chamado_id_idx" ON "operacoes"("chamado_id");

-- CreateIndex
CREATE INDEX "operacao_field_audit_operacao_id_idx" ON "operacao_field_audit"("operacao_id");

-- CreateIndex
CREATE INDEX "posicoes_operacao_operacao_id_idx" ON "posicoes_operacao"("operacao_id");

-- CreateIndex
CREATE INDEX "sync_error_log_entity_type_resolved_idx" ON "sync_error_log"("entity_type", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "triagens_chamado_id_key" ON "triagens"("chamado_id");

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_tipo_chamado_id_fkey" FOREIGN KEY ("tipo_chamado_id") REFERENCES "tipos_chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_motivo_cancelamento_id_fkey" FOREIGN KEY ("motivo_cancelamento_id") REFERENCES "motivos_cancelamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_status_history" ADD CONSTRAINT "chamado_status_history_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_status_history" ADD CONSTRAINT "chamado_status_history_operacao_id_fkey" FOREIGN KEY ("operacao_id") REFERENCES "operacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamado_field_audit" ADD CONSTRAINT "chamado_field_audit_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_da_missao" ADD CONSTRAINT "diario_da_missao_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_da_missao" ADD CONSTRAINT "diario_da_missao_operacao_id_fkey" FOREIGN KEY ("operacao_id") REFERENCES "operacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_da_missao" ADD CONSTRAINT "diario_da_missao_disponibilidade_id_fkey" FOREIGN KEY ("disponibilidade_id") REFERENCES "disponibilidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_tipo_chamado_id_fkey" FOREIGN KEY ("tipo_chamado_id") REFERENCES "tipos_chamado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidade_field_audit" ADD CONSTRAINT "disponibilidade_field_audit_disponibilidade_id_fkey" FOREIGN KEY ("disponibilidade_id") REFERENCES "disponibilidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composicao_equipe" ADD CONSTRAINT "composicao_equipe_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composicao_equipe" ADD CONSTRAINT "composicao_equipe_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacoes" ADD CONSTRAINT "operacoes_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacoes" ADD CONSTRAINT "operacoes_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacoes" ADD CONSTRAINT "operacoes_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacao_field_audit" ADD CONSTRAINT "operacao_field_audit_operacao_id_fkey" FOREIGN KEY ("operacao_id") REFERENCES "operacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posicoes_operacao" ADD CONSTRAINT "posicoes_operacao_operacao_id_fkey" FOREIGN KEY ("operacao_id") REFERENCES "operacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posicoes_operacao" ADD CONSTRAINT "posicoes_operacao_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posicao_atual_veiculo" ADD CONSTRAINT "posicao_atual_veiculo_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagens" ADD CONSTRAINT "triagens_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "chamados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_tablet_id_fkey" FOREIGN KEY ("tablet_id") REFERENCES "tablets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
