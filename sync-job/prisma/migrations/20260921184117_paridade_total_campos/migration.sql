-- AlterTable
ALTER TABLE "chamados" ADD COLUMN     "aereo_text" TEXT,
ADD COLUMN     "ambulancia_aereo" TEXT,
ADD COLUMN     "destination_doctor" TEXT,
ADD COLUMN     "destination_phone" TEXT,
ADD COLUMN     "expected_arrival_dest_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "order_number" INTEGER,
ADD COLUMN     "origin_doctor" TEXT,
ADD COLUMN     "origin_phone" TEXT,
ADD COLUMN     "patient_email" TEXT,
ADD COLUMN     "request_origin" TEXT,
ADD COLUMN     "requested_at" TIMESTAMP(3),
ADD COLUMN     "requested_vehicle_type" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "tipo_chamado_text" TEXT,
ADD COLUMN     "triage_completed" BOOLEAN;

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "state" TEXT,
ADD COLUMN     "token" TEXT;

-- AlterTable
ALTER TABLE "composicao_equipe" ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "diario_da_missao" ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "disponibilidades" ADD COLUMN     "destination_address_concatenated" TEXT,
ADD COLUMN     "destination_cep" INTEGER,
ADD COLUMN     "destination_city" TEXT,
ADD COLUMN     "destination_complement" TEXT,
ADD COLUMN     "destination_name" TEXT,
ADD COLUMN     "destination_neighborhood" TEXT,
ADD COLUMN     "destination_number" INTEGER,
ADD COLUMN     "destination_state" TEXT,
ADD COLUMN     "destination_street" TEXT,
ADD COLUMN     "device_type" TEXT,
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "disponibilidade_control_status" TEXT,
ADD COLUMN     "equipment_type_and_qty" TEXT,
ADD COLUMN     "expected_arrival_origin_at" TIMESTAMP(3),
ADD COLUMN     "origin_address_concatenated" TEXT,
ADD COLUMN     "origin_cep" INTEGER,
ADD COLUMN     "origin_city" TEXT,
ADD COLUMN     "origin_complement" TEXT,
ADD COLUMN     "origin_name" TEXT,
ADD COLUMN     "origin_neighborhood" TEXT,
ADD COLUMN     "origin_number" INTEGER,
ADD COLUMN     "origin_state" TEXT,
ADD COLUMN     "origin_street" TEXT,
ADD COLUMN     "patient_birth_date" TIMESTAMP(3),
ADD COLUMN     "patient_height_cm" DOUBLE PRECISION,
ADD COLUMN     "patient_height_meters" DOUBLE PRECISION,
ADD COLUMN     "patient_height_meters_and_cm" TEXT,
ADD COLUMN     "patient_name" TEXT,
ADD COLUMN     "patient_weight_kg" DOUBLE PRECISION,
ADD COLUMN     "procedure" TEXT,
ADD COLUMN     "stage2_inform_availability" BOOLEAN,
ADD COLUMN     "stage2_unavailability_reason" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "uses_device" BOOLEAN,
ADD COLUMN     "uses_equipment" BOOLEAN;

-- AlterTable
ALTER TABLE "equipes" ADD COLUMN     "assigned_by" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "operacoes" ADD COLUMN     "acceptance_status" TEXT,
ADD COLUMN     "acknowledgement_status" TEXT,
ADD COLUMN     "aereo_request_id" INTEGER,
ADD COLUMN     "ambulancia_aereo" TEXT,
ADD COLUMN     "arrived_at_dest_status" TEXT,
ADD COLUMN     "arrived_at_origin_status" TEXT,
ADD COLUMN     "assigned_flag" BOOLEAN,
ADD COLUMN     "cancellation_notes" TEXT,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "departed_to_dest_status" TEXT,
ADD COLUMN     "departed_to_origin_status" TEXT,
ADD COLUMN     "destination_address" TEXT,
ADD COLUMN     "disponibilidade_request_id" INTEGER,
ADD COLUMN     "eta_destination" TIMESTAMP(3),
ADD COLUMN     "eta_origin" TIMESTAMP(3),
ADD COLUMN     "finished_status" TEXT,
ADD COLUMN     "min_ambulance_at" TIMESTAMP(3),
ADD COLUMN     "origin_address" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "triagens" ADD COLUMN     "destination_hospital_contact" TEXT,
ADD COLUMN     "detected_incorrect_info" TEXT,
ADD COLUMN     "had_cancellation" TEXT,
ADD COLUMN     "had_intervention" TEXT,
ADD COLUMN     "nurse_absence_reason" TEXT,
ADD COLUMN     "nurse_availability" TEXT,
ADD COLUMN     "origin_hospital_contact" TEXT,
ADD COLUMN     "precaution_type_legacy_text" TEXT,
ADD COLUMN     "request_reason" TEXT,
ADD COLUMN     "requested_at" TIMESTAMP(3),
ADD COLUMN     "resource_needed_legacy_text" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "veiculos" ADD COLUMN     "edition" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "tablet_email" TEXT,
ADD COLUMN     "team_assignment_status" TEXT;
