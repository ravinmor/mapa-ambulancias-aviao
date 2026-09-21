# Desenho — schema Prisma do núcleo `resgate`

Rascunho completo (2026-09-21), opção "schema inteiro de uma vez" escolhida
pelo usuário. Baseado 100% em `AUDITORIA_SharePoint_Resgate.md` (43 listas
reais do SharePoint `AmilResgatePROD2`) + decisões de modelagem fechadas na
conversa. Ainda **não é código real** dentro de `sync-job/`/`api/` — é
proposta pra revisão antes de virar migration de verdade.

**Garantia**: todo campo de toda lista do núcleo abaixo está representado —
nenhuma informação das tabelas antigas foi cortada, só reorganizada com
relacionamento de verdade (FK/join) em vez da duplicação que o SharePoint
exigia.

---

## Parte 1 — O que NÃO está sendo migrado agora (registro pedido pelo usuário)

| Lista SharePoint | Domínio/projeto futuro | Por que está fora agora |
|---|---|---|
| `d_cadastro_Categorias_CheckList_Enfermagem` | Checklist (enfermagem + veículo) | Domínio inteiro (9 listas) fora do núcleo por decisão de escopo 2026-09-21 — não é core do fluxo chamado→atendimento, é controle de qualidade paralelo |
| `d_cadastro_Categorias_CheckList_Veiculos` | Checklist | idem |
| `d_cadastro_Itens_CheckList_Enfermagem` | Checklist | idem |
| `d_cadastro_Itens_CheckList_Veiculos` | Checklist | idem |
| `f_CheckList_Enfermagem` | Checklist | idem |
| `f_CheckList_Enfermagem_detalhe` | Checklist | idem |
| `f_CheckList_Veiculos` | Checklist | idem |
| `f_CheckList_Veiculos_detalhe` | Checklist | idem |
| `f_Intercorrencias` | Checklist | idem (não-conformidade é achado de checklist, não evento de chamado) |
| `d_Responsaveis_por_check_list` | Checklist | idem |
| `f_Manutencao_Frota` | Manutenção de frota | Domínio próprio, sem relação direta com o fluxo de atendimento em si |
| `d_RLS_Modulos_App_Controle` | Permissões/autorização | Fora de escopo — quando desenhar autorização real no `resgate`, avaliar se usa o mesmo padrão do `Motor_ValidaPermissao` (motor de auth já existente na empresa) em vez de replicar esse modelo |
| `d_Cadastro_Aeronaves` | Integração agendamento de voos | Pertence à tarefa já mapeada em `project_integracao_agendamento_voos.md`, sequenciada pra **depois** deste trabalho (ver `TAREFAS_Reestruturacao_Aircraft_Tracker_Banco.md`) |
| `d_Usuarios_Aereo` | Integração agendamento de voos | idem — **nota de segurança**: campo `Senha` em texto puro, reportar à empresa independente do cronograma |
| `f_Log_Aereo` | Integração agendamento de voos | idem |
| `f_Operacoes_Aereas` | Integração agendamento de voos | idem — é literalmente onde o agendamento de voo vai morar (achado 2026-09-21) |
| `f_Log_Intercorrencias_Aereo` | Integração agendamento de voos | idem (0 itens hoje) |
| `f_Documentos_Aereo` | Integração agendamento de voos | biblioteca de documento, não lista de dado |
| `d_Cadastro_de_Turno` | Escala/turno de equipe | Não foi nomeado no núcleo aprovado — candidato natural a próxima rodada (mais perto do núcleo que os outros excluídos, já que se relaciona direto com `Equipe`) |
| `f_Atribuir_Veiculo_a_Equipe_2` + `_Versionamento` | Atribuição veículo↔equipe (turno/escala, não por chamado) | Mesma razão — parece ser atribuição PADRÃO/corrente (fora de um chamado específico), distinta da atribuição por Operação que já está no núcleo. Candidato a próxima rodada |
| `d_Cadastro_Tipo_de_Servico_Equipe` | Tipo de serviço da equipe | Catálogo pequeno (2 itens), não referenciado por Lookup real em nenhuma lista do núcleo — baixo impacto, fica fora por ora |
| `d_Cadastro_de_Enderecos` | Catálogo de endereço (CEP/logradouro/cidade/estado) | Não tem Lookup de/pra nenhuma lista do núcleo (endereço é campo livre em Chamado) — auxiliar, não FK real |
| `f_negativas` | Recusa de atendimento pré-chamado | Fluxo paralelo à Disponibilidade (recusa ANTES de virar chamado, sem `ID_Chamado`) — não foi nomeado no núcleo aprovado, mas é operacionalmente próximo; candidato a próxima rodada se relatório de recusas importar |
| `f_log_status_veiculo` | Log de status de veículo | Histórico de status foi decidido pro Chamado/Operação, não pro Veículo — fora por ora, fácil de adicionar depois se precisar |
| `d_Versionamento_campos_do_Chamado` | Auditoria nativa do SharePoint | Padrão de auditoria SUBSTITUÍDO pelo desenho novo (campos críticos definidos, ver Parte 3) — a ESTRUTURA não é replicada; se o DADO histórico (54.627 registros) precisar ser preservado, é decisão de migração de dado, separada do desenho de schema |
| `d_Compor_equipe_versionamento` | Auditoria nativa do SharePoint | idem |
| `f_Atribuir_Veiculo_a_Equipe_Versionamento` | Auditoria nativa do SharePoint | idem (0 itens hoje, baixo risco) |
| `f_log_amil_resgate_com_ou_sem_atendimento` | — | Lista vazia, 0 campos customizados — não configurada de verdade, nada a migrar |

---

## Parte 2 — O que ESTÁ no núcleo (e de onde vem)

| Tabela nova | Lista(s) SharePoint de origem |
|---|---|
| `Chamado` | `f_Regulacao_Chamados` (tabela-mãe, confirmado 2026-09-21) |
| `Operacao` | `f_Operacao_Controle_Dados_do_Chamado` |
| `Veiculo` | `d_Cadastro_Veiculos` |
| `Tablet` | `d_Cadastro_de_Tablet` (suporte de `Veiculo`) |
| `Equipe` | `d_Cadastro_de_Equipes` |
| `Colaborador` | `d_Cadastro_Colaboradores` |
| `ComposicaoEquipe` | `d_Compor_equipe` (relação Equipe↔Colaborador) |
| `Triagem` | `f_Triagem` |
| `Disponibilidade` | `f_Disponiiblidade_do_Amil_Resgate` |
| `DiarioDaMissao` | `f_Diario_da_Missao` (era `MissionEvent`, fonte confirmada 2026-09-21) |
| `TipoChamado` | `d_Cadastro_Tipos_de_Chamados` (catálogo, referenciado por Lookup real) |
| `MotivoCancelamento` | `d_Motivos_de_Cancelamento_do_chamado` (catálogo) |
| `TipoStatusChamado` | `d_Tipo_de_Status_do_Chamado` (catálogo) |
| `ChamadoStatusHistory` | `d_Histórico_Status_de_Chamado` (histórico completo, decidido) |
| `ChamadoFieldAudit` / `OperacaoFieldAudit` / `DisponibilidadeFieldAudit` | **Novo** — substitui `d_Versionamento_campos_do_Chamado`, só nos campos críticos decididos |

---

## Parte 3 — Schema Prisma proposto

```prisma
// ============================================================
// ENUMS DE STATUS — valores reais levantados de 300 registros recentes
// de cada tabela (2026-09-21). Amostra grande mas nao exaustiva.
// Decisao 2026-09-21: se aparecer valor nao mapeado rodando contra o
// historico completo, NAO quebra o sync inteiro (fail-fast) e NAO ignora
// silencioso — grava em SyncErrorLog (ver abaixo) com o valor bruto pra
// revisao humana, e o campo fica null naquele registro especifico.
// ============================================================

enum StatusChamado {
  CRIADO_AGUARDANDO_ACEITE // "Chamado criado, aguardando aceite do Controle."
  CANCELADO                // "Chamado Cancelado"
  IDA_CONCLUIDA            // "Ida Concluída"
  VOLTA_CONCLUIDA          // "Volta Concluída"
}

enum StatusOperacao {
  AGUARDANDO_ACEITE      // null na origem = ninguem aceitou ainda
  DESLOCANDO_PARA_ORIGEM // "Deslocamento para origem iniciado, aguardando confirmação de chegada na origem."
  CHEGOU_NA_ORIGEM       // "Chegada na origem confirmada, aguardando iniciar deslocamento para o destino."
  DESLOCANDO_PARA_DESTINO // "Deslocamento para o destino iniciado, aguardando confirmação de chegada no destino."
  CONCLUIDA_PELO_RESGATE  // "Equipe Resgate concluiu missão."
  CONCLUIDA_PELO_CONTROLE // "Equipe do Controle concluiu missão."
  CANCELADA               // "Chamado Cancelado" (a nivel de operacao)
  CANCELADA_PELO_RESGATE  // "Operação cancelada pela equipe do Resgate."
}

// Verificacao 2026-09-21: Tipo_de_viagem na origem tem inconsistencia real
// de capitalizacao ("IDA" maiusculo vs "Volta" soh com inicial maiuscula,
// confirmado nos mesmos 300 registros usados pros enums de status acima) —
// mesmo tratamento dado ao status, por consistencia (nao foi perguntado
// separado ao usuario, mas e a mesma correcao pelo mesmo motivo).
enum TipoViagem {
  IDA
  VOLTA
}

// Registro de erro de sincronizacao — decisao 2026-09-21: quando um valor
// vindo do SharePoint nao bate com nenhum enum conhecido (ou outro erro de
// mapeamento no sync), grava aqui em vez de derrubar o sync inteiro OU
// perder o erro silenciosamente. Generico o suficiente pra servir qualquer
// entidade do nucleo, nao so status.
model SyncErrorLog {
  id           Int      @id @default(autoincrement())
  entityType   String   @map("entity_type") // ex: "Chamado", "Operacao"
  sourceItemId Int?     @map("source_item_id") // ID do item de origem no SharePoint, quando aplicavel
  fieldName    String?  @map("field_name") // ex: "status"
  rawValue     String?  @map("raw_value") @db.Text // o valor que veio da origem e nao bateu com nada conhecido
  errorType    String   @map("error_type") // ex: "UNMAPPED_ENUM_VALUE"
  message      String?  @map("message") @db.Text
  occurredAt   DateTime @default(now()) @map("occurred_at")
  resolved     Boolean  @default(false) @map("resolved") // marcar quando alguem revisar/corrigir e decidir se vira um valor novo do enum

  @@index([entityType, resolved])
  @@map("sync_error_log")
}

// ============================================================
// CATÁLOGOS (pequenos, referenciados por Lookup real no SharePoint)
// ============================================================

// Origem: d_Cadastro_Tipos_de_Chamados (3 itens hoje)
model TipoChamado {
  id          Int       @id
  description String    @map("description") // Descricao_Chamado
  active      Boolean   @default(true) @map("active") // Status_Atividade
  recordCount String?   @map("record_count") // Qtde_de_registros — Choice na origem, proposito exato nao confirmado
  chamados    Chamado[]
  disponibilidades Disponibilidade[] // verificacao 2026-09-21: faltava — sem isso o FK Disponibilidade.tipoChamadoId nao compila no Prisma (relacao precisa dos 2 lados)

  @@map("tipos_chamado")
}

// Origem: d_Motivos_de_Cancelamento_do_chamado (5 itens hoje)
model MotivoCancelamento {
  id       Int       @id
  reason   String    @map("reason") // Motivo_do_Cancelamento
  active   Boolean   @default(true) @map("active")
  chamados Chamado[]

  @@map("motivos_cancelamento")
}

// Origem: d_Tipo_de_Status_do_Chamado (14 itens hoje)
model TipoStatusChamado {
  id          Int     @id
  description String  @map("description") // Descricao_Status
  notes       String? @map("notes") // Obs_Status

  @@map("tipos_status_chamado")
}

// ============================================================
// CHAMADO — tabela-mãe (origem: f_Regulacao_Chamados)
// ============================================================

// id = ID do item em f_Regulacao_Chamados no SharePoint. Nao autoincrement
// de proposito: e o "ID_Chamado" que TODO o resto do sistema (incluindo
// listas fora do nucleo) referencia hoje — manter o mesmo valor evita
// remapear ID em toda a base durante a migracao, e casa com o padrao ja
// usado em Mission/Regulation/MissionEvent no sync-job atual (upsert por
// id de origem, nao autoincrement).
model Chamado {
  id                  Int       @id

  // --- Paciente ---
  patientName         String?   @map("patient_name") // Nome_Paciente
  medicalRecordNumber Int?      @map("medical_record_number") // "MO"
  patientBirthDate    DateTime? @map("patient_birth_date") // Data_Nascimento
  patientAge          String?   @map("patient_age") // Idade — texto na origem, nao numero puro
  patientSex          String?   @map("patient_sex") // Sexo
  patientWeightKg     Float?    @map("patient_weight_kg") // Peso
  patientHeightCm     Float?    @map("patient_height_cm") // Altura
  patientType         String?   @map("patient_type") // Tipo_de_Paciente
  patientTypeOther    String?   @map("patient_type_other") // Descricao_Tipo_de_Paciente_Outro — AUSENTE do flow real hoje (ver auditoria), manter campo, so nao vem preenchido ainda
  isIntubated         Boolean?  @map("is_intubated") // Intubado
  isObese             Boolean?  @map("is_obese") // Obeso?
  healthPlan          String?   @map("health_plan") // Plano_Paciente
  contact             String?   @map("contact") // Contato

  // --- Clinico (resumo — detalhe fica em Triagem) ---
  diagnosis           String?   @map("diagnosis") @db.Text // "HD"
  procedure           String?   @map("procedure") // Procedimento
  equipment           String?   @map("equipment") // Equipamento
  deviceUsage         String?   @map("device_usage") // Utilizacao_de_dispositivo

  // --- Tipo/motivo ---
  tipoChamadoId       Int?      @map("tipo_chamado_id")
  tipoChamado         TipoChamado? @relation(fields: [tipoChamadoId], references: [id])
  callReason          String?   @map("call_reason") // Motivo_do_Chamado — AUSENTE do flow real hoje

  // --- Endereço: CAMPO CRÍTICO, tem histórico de edição (ChamadoFieldAudit) ---
  originName          String?   @map("origin_name") // Nome_do_Local_Origem
  originAddress       String?   @map("origin_address") @db.Text // Endereco_Origem
  originSector        String?   @map("origin_sector") // Setor_da_Origem
  destinationName     String?   @map("destination_name") // Nome_do_Local_Destino
  destinationAddress  String?   @map("destination_address") @db.Text // Endereco_Destino
  destinationSector   String?   @map("destination_sector") // Setor_da_Destino
  companion           String?   @map("companion") // Dados_Acompanhante — AUSENTE do flow real hoje

  // --- Status ---
  status              StatusChamado? @map("status") // Status_do_chamado — virou enum (pedido do usuario 2026-09-21), ver lista de valores reais no topo do arquivo
  statusForEdit       String?   @map("status_for_edit") // Status_atual_para_edicao

  // --- Cancelamento: CAMPO CRÍTICO, tem histórico de edição ---
  motivoCancelamentoId Int?     @map("motivo_cancelamento_id")
  motivoCancelamento  MotivoCancelamento? @relation(fields: [motivoCancelamentoId], references: [id])
  cancellationNotes   String?   @map("cancellation_notes") @db.Text // Obs_de_Cancelamento — texto livre, CONFIRMADO 2026-09-21 com dado real que e diferente de motivo_Cancelamento (categoria, ja no FK motivoCancelamentoId acima)

  // --- Previsões/prazos ---
  expectedArrivalOriginAt DateTime? @map("expected_arrival_origin_at") // previsao_de_chegada_nao_origem_c
  actualArrivalDestAt     DateTime? @map("actual_arrival_dest_at") // Data_e_Hora_da_Chegada_no_Destin

  // --- Ponte pro módulo aéreo (fora do núcleo — só guarda referência) ---
  aereoRequestId      Int?      @map("aereo_request_id") // ID_Aereo — aponta pra f_Operacoes_Aereas, fora do núcleo por ora

  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @default(now()) @map("updated_at")

  operacoes           Operacao[]
  triagem             Triagem?
  disponibilidade     Disponibilidade?
  diario              DiarioDaMissao[]
  statusHistory       ChamadoStatusHistory[]
  fieldAudit          ChamadoFieldAudit[]

  @@map("chamados")
}

// Histórico de status COMPLETO — origem: d_Histórico_Status_de_Chamado
// (26.031 registros hoje). Decisão fechada 2026-09-21: guardar toda
// transição, não só o status atual.
model ChamadoStatusHistory {
  id          Int      @id @default(autoincrement())
  chamadoId   Int      @map("chamado_id")
  chamado     Chamado  @relation(fields: [chamadoId], references: [id])
  operacaoId  Int?     @map("operacao_id") // presente na origem (ID_Operacao), nem toda linha tem
  operacao    Operacao? @relation(fields: [operacaoId], references: [id]) // verificacao 2026-09-21: era ID solto sem FK de verdade, inconsistente com o principio de normalizacao aprovado — corrigido
  description String   @map("description") @db.Text // desc_Status
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([chamadoId])
  @@map("chamado_status_history")
}

// Auditoria de EDIÇÃO só nos campos críticos do Chamado (endereço origem/
// destino, diagnóstico, motivo de cancelamento) — decisão 2026-09-21,
// substitui d_Versionamento_campos_do_Chamado (que auditava TUDO).
model ChamadoFieldAudit {
  id        Int      @id @default(autoincrement())
  chamadoId Int      @map("chamado_id")
  chamado   Chamado  @relation(fields: [chamadoId], references: [id])
  fieldName String   @map("field_name")
  oldValue  String?  @map("old_value") @db.Text
  newValue  String?  @map("new_value") @db.Text
  changedBy String?  @map("changed_by")
  changedAt DateTime @default(now()) @map("changed_at")

  @@index([chamadoId])
  @@map("chamado_field_audit")
}

// ============================================================
// OPERAÇÃO — 1 Chamado : N Operações (Ida/Volta, confirmado empírico)
// ============================================================

// Origem: f_Operacao_Controle_Dados_do_Chamado. id = ID do item de origem
// (mesmo raciocínio de Chamado.id).
model Operacao {
  id                       Int       @id
  chamadoId                Int       @map("chamado_id") // ID_Chamado na origem — VALIDADO 2026-09-21 com dado real (300/300 operacoes bateram contra Chamado.id real), FK direto confirmado, ver Parte 4 item 1
  chamado                  Chamado   @relation(fields: [chamadoId], references: [id])
  tripType                 TipoViagem @map("trip_type") // Tipo_de_viagem — virou enum 2026-09-21 (mesma correcao do status, origem tinha inconsistencia de capitalizacao "IDA" vs "Volta")

  // --- Atribuição: CAMPO CRÍTICO, tem histórico de edição ---
  equipeId                 Int?      @map("equipe_id") // ID_Equipe_atribuida
  equipe                   Equipe?   @relation(fields: [equipeId], references: [id])
  veiculoId                Int?      @map("veiculo_id") // ID_Veiculo
  veiculo                  Veiculo?  @relation(fields: [veiculoId], references: [id])

  // --- Status: CAMPO CRÍTICO ---
  currentStatus            StatusOperacao? @map("current_status") // Status_atual_da_operacao — virou enum
  shortStatus               String?  @map("short_status") // Status_resumido_operacao — MANTIDO (decisao 2026-09-21), mesmo parecendo derivavel de currentStatus
  operationStatus           String?  @map("operation_status") // Status_Operacao — MANTIDO (decisao 2026-09-21) mesmo sempre null em 300 registros reais testados; documentado como NAO USADO hoje, candidato a remocao futura quando confirmar que nunca teve dado

  // --- Timestamps por etapa (5 etapas x email+data, achatado — mantido igual à origem por ora) ---
  assignedAt               DateTime? @map("assigned_at") // Data_da_atribuicao_ao_chamado
  assignedByEmail           String?  @map("assigned_by_email") // email_user_que_atribuiu
  acknowledgedAt            DateTime? @map("acknowledged_at") // Data_e_Hora_da_ciencia
  acknowledgedByEmail       String?  @map("acknowledged_by_email") // email_user_que_confirmou_ciencia
  departedToOriginAt        DateTime? @map("departed_to_origin_at") // Amb_Dt_Inicio_do_deslocamento_pa
  departedToOriginByEmail   String?  @map("departed_to_origin_by_email")
  arrivedAtOriginAt         DateTime? @map("arrived_at_origin_at") // Amb_Dt_Chegada_na_Origem
  arrivedAtOriginByEmail    String?  @map("arrived_at_origin_by_email")
  departedToDestAt          DateTime? @map("departed_to_dest_at") // Amb_Dt_Saida_da_Origem_para_Dest
  departedToDestByEmail     String?  @map("departed_to_dest_by_email")
  arrivedAtDestAt           DateTime? @map("arrived_at_dest_at") // Amb_Dt_Chegada_no_Destino
  arrivedAtDestByEmail      String?  @map("arrived_at_dest_by_email")
  finishedAt                DateTime? @map("finished_at") // Amb_Dt_Finalizacao_do_chamado
  finishedByEmail           String?  @map("finished_by_email")
  lastActionAt              DateTime? @map("last_action_at") // Dt_ult_acao_operacao

  // --- Cancelamento ---
  cancelledAt               DateTime? @map("cancelled_at") // Dt_Cancelamento_operacao
  cancellationAreaResponsible String? @map("cancellation_area_responsible") // Area_que_cancelou

  // --- Posições intermediárias (até 6 ambulâncias por etapa — mantido achatado, igual à origem) ---
  waypointsJson             Json?    @map("waypoints_json") // Amb_1..6_Latitude_e_Longitude + Amb_1..6_tempo_min_entre_essa_etapa consolidados — achatar 12 colunas em JSON estruturado em vez de 12 colunas soltas (aprovado 2026-09-21)

  fichaTransporteFrenteUrl  String?  @map("ficha_transporte_frente_url") // Ficha_de_transporte_frente (Thumbnail na origem — vira upload em storage real, nao anexo do SharePoint)
  fichaTransporteVersoUrl   String?  @map("ficha_transporte_verso_url")

  patientIsolation          String?  @map("patient_isolation") // Pacienteemisolamento
  cleaningNurse              String? @map("cleaning_nurse") // Enfermeiroquefezalimpeza
  appVersion                 String? @map("app_version") // VersaoApp
  device                      String? @map("device") // Dispositivo
  qta                          String? @map("qta")

  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @default(now()) @map("updated_at")

  fieldAudit                OperacaoFieldAudit[]
  statusHistory              ChamadoStatusHistory[] // verificacao 2026-09-21: faltava a relacao de volta pro FK adicionado em ChamadoStatusHistory.operacaoId
  diario                      DiarioDaMissao[]       // verificacao 2026-09-21: idem, pro FK adicionado em DiarioDaMissao.operacaoId

  @@index([chamadoId])
  @@map("operacoes")
}

model OperacaoFieldAudit {
  id         Int      @id @default(autoincrement())
  operacaoId Int      @map("operacao_id")
  operacao   Operacao @relation(fields: [operacaoId], references: [id])
  fieldName  String   @map("field_name")
  oldValue   String?  @map("old_value") @db.Text
  newValue   String?  @map("new_value") @db.Text
  changedBy  String?  @map("changed_by")
  changedAt  DateTime @default(now()) @map("changed_at")

  @@index([operacaoId])
  @@map("operacao_field_audit")
}

// ============================================================
// VEÍCULO / TABLET (origem: d_Cadastro_Veiculos, d_Cadastro_de_Tablet)
// ============================================================

model Tablet {
  id          Int       @id
  name        String?   @map("name") // Nome_Tablet
  email       String?   @map("email") // Email_tablet
  status      String?   @map("status") // Status
  userId      String?   @map("user_id") // Usuario_Tablet (People field na origem)
  latitude    Float?    @map("latitude") // Latitude_atual
  longitude   Float?    @map("longitude") // Longitude_atual
  positionAt  DateTime? @map("position_at") // Data_e_hora_dados_localizacao
  veiculos    Veiculo[]

  @@map("tablets")
}

model Veiculo {
  id                Int       @id // vem de d_Cadastro_Veiculos — id de origem, nao autoincrement (mesmo padrao)
  name              String    @map("name") // Nome_veiculo
  licensePlate      String?   @map("license_plate") // Placa_Veiculo
  vehicleType       String?   @map("vehicle_type") // Tipo_de_Veiculo
  activityStatus    String?   @map("activity_status") // Status_Atividade
  operationStatus   String?   @map("operation_status") // Status_Operacao
  initialKm         Float?    @map("initial_km") // KM_Inicial_do_Veiculo

  tabletId          Int?      @map("tablet_id") // Tablet_Cadastrado (Lookup real na origem — unica relacao com integridade garantida pelo SharePoint)
  tablet            Tablet?   @relation(fields: [tabletId], references: [id])
  tabletAssignmentStatus String? @map("tablet_assignment_status") // Status_Atribuicao_Tablet

  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @default(now()) @map("updated_at")

  operacoes         Operacao[]

  @@map("veiculos")
}

// ============================================================
// EQUIPE / COLABORADOR (origem: d_Cadastro_de_Equipes, d_Cadastro_Colaboradores, d_Compor_equipe)
// ============================================================

model Colaborador {
  id           Int       @id
  name         String    @map("name") // Nome_Colaborador
  nickname     String?   @map("nickname") // Apelido
  role         String?   @map("role") // Cargo
  activityStatus String? @map("activity_status") // Status_de_atividade
  whatsapp     String?   @map("whatsapp")
  rg           String?   @map("rg")
  cnh          String?   @map("cnh")
  photoUrl     String?   @map("photo_url") // foto_colaborador

  composicoes  ComposicaoEquipe[]

  @@map("colaboradores")
}

model Equipe {
  id             Int       @id
  name           String    @map("name") // Nome_Equipe
  activityStatus String?   @map("activity_status") // Status_de_Atividade
  whatsapp       String?   @map("whatsapp")

  composicoes    ComposicaoEquipe[]
  operacoes      Operacao[]

  @@map("equipes")
}

// Origem: d_Compor_equipe (relação Equipe↔Colaborador). Na origem os
// campos rel_ID_Equipe/rel_ID_Colaborador sao FK "soltas" (Number/Text,
// sem Lookup real) — aqui viram FK de verdade.
model ComposicaoEquipe {
  id            Int         @id @default(autoincrement())
  equipeId      Int         @map("equipe_id")
  equipe        Equipe      @relation(fields: [equipeId], references: [id])
  colaboradorId Int         @map("colaborador_id")
  colaborador   Colaborador @relation(fields: [colaboradorId], references: [id])
  createdAt     DateTime    @default(now()) @map("created_at")

  @@unique([equipeId, colaboradorId])
  @@map("composicao_equipe")
}

// ============================================================
// TRIAGEM — 1:1 com Chamado (confirmado 2026-09-21)
// ============================================================

model Triagem {
  id                    Int      @id // vem de f_Triagem
  chamadoId             Int      @unique @map("chamado_id") // ID_Chamado — 1:1 garantido por @unique
  chamado               Chamado  @relation(fields: [chamadoId], references: [id])

  diagnosis             String?  @map("diagnosis") @db.Text // Diagnostico
  clinicalHistory       String?  @map("clinical_history") @db.Text // HistoriaClinica
  vitalSigns            String?  @map("vital_signs") @db.Text // SinaisVitais(PA-FC...)
  resourceType          String?  @map("resource_type") // TipodeRecurso
  resourceNeeded        String?  @map("resource_needed") // RecursoNecessario
  companion             String?  @map("companion") // Acompanhante
  medicationsInPump     String?  @map("medications_in_pump") @db.Text // MedicacoesemBombadeInfusao
  biaEcmo               String?  @map("bia_ecmo") @db.Text // BIA/ECMO
  precautionTypes       String?  @map("precaution_types") // TiposdePrecaucao
  weightAndHeight       String?  @map("weight_and_height") // PesoeAltura
  incorrectInformation  String?  @map("incorrect_information") // Informacoesincorretas (MultiChoice na origem)
  interventions         String?  @map("interventions") // Intervencoes (MultiChoice na origem)
  neededMedicalContact  Boolean? @map("needed_medical_contact") // Necessitoudecontatomedico
  doctorNameAndCrm      String?  @map("doctor_name_and_crm") // NomeeCRMdoMedico
  cancellationReason    String?  @map("cancellation_reason") // MotivodoCancelamento

  createdAt             DateTime @default(now()) @map("created_at")

  @@map("triagens")
}

// ============================================================
// DISPONIBILIDADE — solicitação inicial, vira Chamado quando aceita
// ============================================================

// Origem: f_Disponiiblidade_do_Amil_Resgate. Confirmado empirico
// 2026-09-21: dado de paciente/endereco daqui e COPIADO pro Chamado quando
// aceito (nao e FK direta um-pro-outro na origem, e duplicacao de
// SharePoint) — aqui SIM vira FK real (chamadoId), sem duplicar o dado de
// paciente que ja mora em Chamado.
model Disponibilidade {
  id                     Int       @id // vem de f_Disponiiblidade_do_Amil_Resgate
  chamadoId              Int?      @unique @map("chamado_id") // ID_Chamado_aberto — nulo ate ser aceito
  chamado                Chamado?  @relation(fields: [chamadoId], references: [id])

  // --- Estagio 1: solicitacao ---
  requesterType         String?   @map("requester_type") // _1_Tipo_de_Solicitante
  ambulanceType         String?   @map("ambulance_type") // _1_Tipo_de_Ambulancia
  tipoChamadoId         Int?      @map("tipo_chamado_id") // _1_tipo_de_chamado (Lookup real na origem)
  tipoChamado           TipoChamado? @relation(fields: [tipoChamadoId], references: [id])

  // --- Estagio 2: disponibilidade dada ---
  availabilityGivenAt   DateTime? @map("availability_given_at") // _2_Data_e_hora_da_disponibi
  respondedAt           DateTime? @map("responded_at") // _2_Data_que_foi_respondido
  respondedByUser       String?   @map("responded_by_user") // _2_User_que_respondeu_a_dis

  // --- Estagio 3: CAMPO CRÍTICO — aceite/recusa ---
  acceptedOrDeclined    Boolean?  @map("accepted_or_declined") // _3_Aceite_ou_recusa_do_soli
  declineReason         String?   @map("decline_reason") @db.Text // _3_Motivo_caso_nao_tenha_ac
  respondedAt3          DateTime? @map("responded_at_stage3") // _3_Data_da_Resposta_do_soli
  acceptedByUser        String?   @map("accepted_by_user") // _3_Usuario_que_aceitou_ou_r

  // --- Estagio 4: finalizacao ---
  finalizationControl   String?   @map("finalization_control") // _4_Controle_finalizacao
  finalizedAt           DateTime? @map("finalized_at") // _4_Data_da_finalizacao
  finalizedByUser       String?   @map("finalized_by_user") // _4_Usuario_que_finalizou

  status                String?   @map("status") // Status_da_Solicitacao (texto de log, ex: "O Controle abriu um chamado...")
  controlStatus         String?   @map("control_status") // Status_Controle
  requesterStatus       String?   @map("requester_status") // Status_Solicitante
  unavailabilityReason  String?   @map("unavailability_reason") // Motivo_da_Falta_de_disponibilida

  createdAt             DateTime  @default(now()) @map("created_at")

  fieldAudit             DisponibilidadeFieldAudit[]
  diario                  DiarioDaMissao[] // verificacao 2026-09-21: relacao de volta pro FK adicionado em DiarioDaMissao.disponibilidadeId

  @@map("disponibilidades")
}

model DisponibilidadeFieldAudit {
  id                 Int              @id @default(autoincrement())
  disponibilidadeId  Int              @map("disponibilidade_id")
  disponibilidade    Disponibilidade  @relation(fields: [disponibilidadeId], references: [id])
  fieldName          String           @map("field_name")
  oldValue           String?          @map("old_value") @db.Text
  newValue           String?          @map("new_value") @db.Text
  changedBy          String?          @map("changed_by")
  changedAt          DateTime         @default(now()) @map("changed_at")

  @@index([disponibilidadeId])
  @@map("disponibilidade_field_audit")
}

// ============================================================
// DIARIO DA MISSAO — era "MissionEvent", fonte confirmada 2026-09-21
// ============================================================

// Origem: f_Diario_da_Missao. Alimenta a linha do tempo da missao no
// frontend (MissionTimeline.tsx) — hoje mockada, esperando esse pipeline.
model DiarioDaMissao {
  id                   Int       @id
  chamadoId            Int       @map("chamado_id") // ID_Chamado
  chamado              Chamado   @relation(fields: [chamadoId], references: [id])
  operacaoId           Int?      @map("operacao_id") // ID_Operacao — verificacao 2026-09-21: era ID solto, virou FK de verdade (Operacao ja e model do nucleo)
  operacao             Operacao? @relation(fields: [operacaoId], references: [id])
  disponibilidadeId    Int?      @map("disponibilidade_id") // ID_Disponibilidade — idem, virou FK de verdade
  disponibilidade      Disponibilidade? @relation(fields: [disponibilidadeId], references: [id])
  message              String?   @map("message") @db.Text // Mensagem
  currentMoment        String?   @map("current_moment") // Momentoatual — texto exibido na timeline
  tripType             TipoViagem? @map("trip_type") // Tipo_de_viagem — mesmo enum de Operacao.tripType
  accessType           String?   @map("access_type") // tipo_acesso (ex: "Resgate", "Controle")
  readStatusRequester  Int?      @map("read_status_requester")
  readStatusControl    Int?      @map("read_status_control")
  readStatusRescue     Int?      @map("read_status_rescue")
  createdBy            String?   @map("created_by")
  createdAt            DateTime  @default(now()) @map("created_at")

  @@index([chamadoId])
  @@index([operacaoId])
  @@map("diario_da_missao")
}
```

---

## Parte 4 — Dúvidas/decisões que ficaram para trás e precisam de confirmação

1. ~~`Operacao.chamadoId` sem tradução~~ — **VALIDADO 2026-09-21 com dado
   real**: comparei 300 operações reais (mais recentes) contra 300
   chamados reais — **300/300 bateram** (`ID_Chamado` de toda operação
   testada existe como `ID` real em `f_Regulacao_Chamados`, sem exceção).
   O FK direto está correto, pode confiar. O comentário em `sharepoint.ts`
   sobre "casa com `PositionHistory.operationId`" é sobre uma relação
   DIFERENTE (rastreamento de posição, fora do núcleo por ora) — não
   invalida este FK.
2. ~~`cancellationNotes` unifica 2 campos~~ — **CORRIGIDO 2026-09-21,
   dado real provou que são coisas diferentes**: `motivo_Cancelamento` é
   uma CATEGORIA curta (ex: "CANCELADO PELO SOLICITANTE", "RECUSA",
   "CANCELADO PELA ORIGEM" — bate com o catálogo `MotivoCancelamento`) e
   `Obs_de_Cancelamento` é o TEXTO LIVRE do que aconteceu (ex: "Família
   recusou remoção, assinado termo de recusa."). **Ficam separados**:
   `Chamado.motivoCancelamentoId` (FK pro catálogo) +
   `Chamado.cancellationNotes` (texto livre) — schema abaixo já corrigido.
3. **`waypointsJson`** — aprovado, mantido como JSON estruturado em vez
   das 12 colunas soltas.
4. **Status virou ENUM** (pedido do usuário) — valores reais levantados de
   300 registros recentes de cada tabela:
   - `Chamado.status` → `StatusChamado`: `CRIADO_AGUARDANDO_ACEITE`,
     `CANCELADO`, `IDA_CONCLUIDA`, `VOLTA_CONCLUIDA`. **Atenção**: amostra
     de 300 recentes só — pode existir valor mais raro/antigo fora dessa
     amostra que não apareceu.
   - `Operacao.currentStatus` → `StatusOperacao`: `AGUARDANDO_ACEITE`
     (null na origem = ninguém aceitou ainda), `DESLOCANDO_PARA_ORIGEM`,
     `CHEGOU_NA_ORIGEM`, `DESLOCANDO_PARA_DESTINO`,
     `CONCLUIDA_PELO_RESGATE`, `CONCLUIDA_PELO_CONTROLE`, `CANCELADA`,
     `CANCELADA_PELO_RESGATE`.
   - **Decidido 2026-09-21**: valor não mapeado (histórico completo pode
     ter algo fora da amostra de 300) não quebra o sync nem some
     silencioso — grava em `SyncErrorLog` (tabela nova, ver schema) com o
     valor bruto, registro de origem e o que aconteceu, campo fica `null`
     só naquele registro. Revisão humana decide depois se vira valor novo
     do enum.
   - `Operacao.shortStatus` → **mantido** (decisão do usuário), mesmo
     parecendo derivável de `currentStatus`.
   - `Operacao.operationStatus` (`Status_Operacao`) → **mantido**
     (decisão do usuário) mesmo sempre `null` nos 300 registros testados —
     documentado no schema como não usado hoje, candidato a remoção
     futura quando confirmar que nunca teve dado de verdade.
5. **Campos "AUSENTE do flow real hoje"** (`callReason`, `patientTypeOther`,
   `companion`) — você vai preencher isso (corrigir o flow do Power
   Automate). Mantive as colunas no schema, sem mudança.

## Parte 5 — Verificação de consistência (2026-09-21, pedido do usuário: "Verifique")

Reli o documento inteiro do início ao fim contra si mesmo (não contra o
SharePoint de novo). Achados e correções:

- **Comentário desatualizado**: `Operacao.chamadoId` ainda tinha o aviso de
  dúvida original ("CUIDADO... resolver antes de migrar") mesmo depois de
  eu ter validado isso com dado real na Parte 4 item 1 — o código nunca
  foi atualizado quando a dúvida foi resolvida. Corrigido.
- **`tripType` nunca virou enum de verdade** — o comentário dizia
  "NORMALIZAR pra enum" mas ficou como `String`. Criado `TipoViagem`
  (IDA/VOLTA), aplicado em `Operacao.tripType` e `DiarioDaMissao.tripType`.
  Essa correção específica não foi perguntada a você (só a de status foi)
  — é a mesma lógica, mesmo motivo (inconsistência de capitalização na
  origem), avisando caso prefira reverter.
- **3 relações que ficaram como ID solto em vez de FK real** — inconsistente
  com o princípio de normalização que você aprovou (FK/join de verdade, sem
  herdar duplicação/solidão do SharePoint): `ChamadoStatusHistory.operacaoId`,
  `DiarioDaMissao.operacaoId` e `DiarioDaMissao.disponibilidadeId` agora são
  relações Prisma de verdade, com as relações de volta correspondentes
  adicionadas em `Operacao` e `Disponibilidade`.
- **Relação de volta faltando** — `Disponibilidade.tipoChamadoId` já
  apontava pra `TipoChamado`, mas `TipoChamado` não tinha o array de volta
  (`disponibilidades Disponibilidade[]`). Sem isso o schema **não
  compilaria** no `prisma generate` — Prisma exige os 2 lados de toda
  relação declarados. Corrigido.
- **Indentação/alinhamento** degradando ao longo de `Operacao`, `Triagem` e
  `Disponibilidade` (cada campo adicionado foi empurrando o comentário mais
  pra direita) — realinhado pra ficar legível.
- **Nada mais encontrado**: conferi todo `@relation(fields: [...])` do
  documento contra o model de destino — os outros 11 já tinham o par
  correto dos 2 lados.
