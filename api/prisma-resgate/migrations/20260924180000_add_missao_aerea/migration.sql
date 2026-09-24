-- CreateTable
CREATE TABLE "missoes_aereas" (
    "id" INTEGER NOT NULL,
    "operacao_id" INTEGER,
    "aeronave_id" INTEGER,
    "criada_at" TIMESTAMP(3),
    "saida_base_at" TIMESTAMP(3),
    "chegada_origem_at" TIMESTAMP(3),
    "saida_origem_at" TIMESTAMP(3),
    "chegada_destino_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missoes_aereas_pkey" PRIMARY KEY ("id")
);
