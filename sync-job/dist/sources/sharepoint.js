"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharepointSource = exports.BACKFILL_ID_OFFSET = void 0;
const config_1 = __importDefault(require("../config"));
// Reescrito 2026-09-21 pro schema do nucleo `resgate` — ver
// DESENHO_Schema_Resgate_Nucleo.md e AUDITORIA_SharePoint_Resgate.md na
// raiz do repo. Mantém os mesmos helpers/padrões do arquivo antigo
// (callFlow via POST, toChoiceValue pra campo de escolha, watermark por ID
// pro rastreio) — só os mapas de campo e as funções de fetch mudam de
// alvo (Veiculo/Chamado/Operacao/Disponibilidade/Triagem/DiarioDaMissao em
// vez de Vehicle/Mission/Regulation/PositionHistory/MissionEvent).
//
// ATENÇÃO — paridade de campo AINDA NÃO 100% (achado ao escrever este
// arquivo, 2026-09-21): comparando com o dump bruto da auditoria,
// `f_Regulacao_Chamados` tem pelo menos mais 8 campos que o schema
// `Chamado` atual não cobre ainda (`Num_Pedido`, `Telefone_da_Origem`,
// `Telefone_da_Destino`, `Observacao` geral, `Emailpaciente`,
// `OrigemdaSolicitacao`, `MediconoOrigem`/`MediconoDestino`,
// `Dt_Hora_Solicitacao`) — a garantia de "nenhum campo perdido" prometida
// no desenho do núcleo ainda não foi verificada campo-a-campo pra TODAS as
// 8 tabelas do núcleo, só o suficiente pra essa primeira reescrita
// funcionar. Precisa de uma segunda passada de auditoria antes de
// considerar isso fechado — não escondido, só não dava pra fazer tudo de
// uma vez nesta sessão.
// --- Veiculo (d_Cadastro_Veiculos) -----------------------------------------
// Mesmo mapa de campo do antigo FLEET_FIELD — ID do item (nao
// ID_Tablet_Cadastrado) é a chave, ~35% das vans não tem
// ID_Tablet_Cadastrado preenchido, "ID" sempre existe.
const VEICULO_FIELD = {
    id: 'ID',
    name: 'Nome_veiculo',
    licensePlate: 'Placa_Veiculo',
    vehicleType: 'Tipo_de_Veiculo',
    activityStatus: 'Status_Atividade', // objeto { Value }
    operationStatus: 'Status_Operacao', // objeto { Value }
    tabletAssignmentStatus: 'Status_Atribuicao_Tablet', // objeto { Value }
    initialKm: 'KM_Inicial_do_Veiculo',
    tabletId: 'ID_Tablet_Cadastrado',
    tabletEmail: 'Email_Tablet', // 2a auditoria
    state: 'CLIENTEESTADO', // 2a auditoria
    teamAssignmentStatus: 'atribuir_equipe_status', // 2a auditoria
    edition: 'Edicao', // 2a auditoria
    statusChangedAt: 'Modificacao_Status', // 2a auditoria
};
// --- Posicao — DUAS listas, papeis diferentes (RESOLVIDO 2026-09-21) ------
// f_Rastreamento_Ambulancia = ping incremental normal, por veiculo. Sem
// "Acao".
const POSICAO_FIELD = {
    veiculoId: 'ID_Veiculo',
    latitude: 'Latitude',
    longitude: 'Longitude',
    positionAt: 'Data_Localizacao',
    vehicleStatus: 'Status_Veiculo', // string plana nesta lista
    callId: 'ID_Chamado',
    operationId: 'ID_Operacao',
    tabletId: 'ID_Tablet',
    appVersion: 'VersaoApp',
    device: 'Dispositivo',
};
// f_Historico_localizacao_da_operacao = backfill por OPERACAO, só pra
// recuperar "Acao" retroativo. Colisão de nome interno confirmada: "Latitude"
// devolve o ID_Veiculo (nome antigo, renomeado depois de criada), a
// latitude real sai em "Latitude0".
const POSICAO_BACKFILL_FIELD = {
    veiculoId: 'Latitude',
    latitude: 'Latitude0',
    longitude: 'Longitude',
    positionAt: 'Data_Status',
    callId: 'ID_Chamado',
    operationId: 'ID_Operacao',
    appVersion: 'VersaoApp',
    device: 'Dispositivo',
    action: 'Acao',
};
// Offset pra nao colidir ID entre as 2 origens (contadores independentes) —
// mesmo raciocinio do BACKFILL_ID_OFFSET antigo.
exports.BACKFILL_ID_OFFSET = 1_000_000_000;
// --- Chamado (f_Regulacao_Chamados) — tabela-mae, CONFIRMADO 2026-09-21 ---
const CHAMADO_FIELD = {
    id: 'ID',
    patientName: 'Nome_Paciente',
    medicalRecordNumber: 'MO',
    patientBirthDate: 'Data_Nascimento',
    patientAge: 'Idade',
    patientSex: 'Sexo', // Choice
    patientWeightKg: 'Peso',
    patientHeightCm: 'Altura',
    patientType: 'Tipo_de_Paciente', // Choice
    patientTypeOther: 'Descricao_Tipo_de_Paciente_Outro',
    isIntubated: 'Intubado',
    isObese: 'Obeso_x003f_', // "Obeso?" — "?" vira _x003f_ no nome interno
    healthPlan: 'Plano_Paciente', // Choice
    contact: 'Contato',
    patientEmail: 'Emailpaciente', // 2a auditoria
    originPhone: 'Telefone_da_Origem', // 2a auditoria
    destinationPhone: 'Telefone_da_Destino', // 2a auditoria
    diagnosis: 'HD',
    procedure: 'Procedimento', // Choice
    equipment: 'Equipamento',
    deviceUsage: 'Utilizacao_de_dispositivo',
    requestedVehicleType: 'Tipo_de_Veiculo', // 2a auditoria — Choice
    triageCompleted: 'TriagemRealizada', // 2a auditoria
    tipoChamadoId: 'rel_Tipo_Chamado', // Lookup — vem como { Id, Value }
    tipoChamadoText: 'Tipo_Chamado', // 2a auditoria — texto solto, separado do lookup acima
    callReason: 'Motivo_do_Chamado',
    requestOrigin: 'OrigemdaSolicita_x00e7__x00e3_o', // 2a auditoria
    requestedAt: 'Dt_Hora_Solicitacao', // 2a auditoria
    originName: 'Nome_do_Local_Origem',
    originAddress: 'Endereco_Origem',
    originSector: 'Setor_da_Origem',
    destinationName: 'Nome_do_Local_Destino',
    destinationAddress: 'Endereco_Destino',
    destinationSector: 'Setor_da_Destino',
    originDoctor: 'MediconoOrigem', // 2a auditoria
    destinationDoctor: 'MediconoDestino', // 2a auditoria
    state: 'CLIENTEESTADO', // 2a auditoria
    orderNumber: 'Num_Pedido', // 2a auditoria
    notes: 'Observacao', // 2a auditoria
    status: 'Status_do_chamado',
    statusForEdit: 'Status_atual_para_edicao', // Choice
    motivoCancelamento: 'motivo_Cancelamento', // categoria curta — CONFIRMADO 2026-09-21 diferente de Obs_de_Cancelamento
    cancellationNotes: 'Obs_de_Cancelamento', // texto livre
    expectedArrivalOriginAt: 'previsao_de_chegada_nao_origem_c',
    expectedArrivalDestAt: 'Previs_x00e3_odechegadanodestino', // 2a auditoria
    actualArrivalDestAt: 'Data_e_Hora_da_Chegada_no_Destin',
    aereoRequestId: 'ID_Aereo',
    aereoText: 'Aereo', // 2a auditoria
    ambulanciaAereo: 'Ambulancia_Aereo', // 2a auditoria
};
// --- Operacao (f_Operacao_Controle_Dados_do_Chamado) -----------------------
// Mesmo mapa do antigo MISSION_FIELD, so os nomes de destino mudam.
const OPERACAO_FIELD = {
    id: 'ID',
    callId: 'ID_Chamado', // VALIDADO 2026-09-21 (300/300 bateram contra Chamado.id real)
    tripType: 'Tipo_de_viagem',
    equipeId: 'ID_Equipe_atribuida',
    veiculoId: 'ID_Veiculo',
    currentStatus: 'Status_atual_da_operacao',
    shortStatus: 'Status_resumido_operacao',
    operationStatus: 'Status_Operacao',
    acceptanceStatus: 'Status_de_aceite', // 2a auditoria — Choice
    minAmbulanceAt: 'Dataehoram_x00ed_nimaparaaambul_', // 2a auditoria
    assignedFlag: 'Atribuido', // 2a auditoria
    state: 'CLIENTEESTADO', // 2a auditoria
    acknowledgementStatus: 'Amb_Confirmacao_de_ciencia_do_ch', // 2a auditoria — Choice, separado de acknowledgedAt
    departedToOriginStatus: 'Inicio_do_deslocamento_para_orig', // 2a auditoria
    arrivedAtOriginStatus: 'Amb_Ops_Chegada_na_Origem', // 2a auditoria
    departedToDestStatus: 'Amb_Ops_Saida_da_Origem_para_Des', // 2a auditoria
    arrivedAtDestStatus: 'Amb_Ops_Chegada_no_Destino', // 2a auditoria
    finishedStatus: 'Amb_Ops_Finalizacao_do_chamado', // 2a auditoria
    assignedAt: 'Data_da_atribuicao_ao_chamado',
    assignedByEmail: 'email_user_que_atribuiu',
    acknowledgedAt: 'Data_e_Hora_da_ciencia',
    acknowledgedByEmail: 'email_user_que_confirmou_ciencia',
    departedToOriginAt: 'Amb_Dt_Inicio_do_deslocamento_pa',
    departedToOriginByEmail: 'Amb_Email_Inicio_do_deslocamento',
    arrivedAtOriginAt: 'Amb_Dt_Chegada_na_Origem',
    arrivedAtOriginByEmail: 'Amb_Email_Chegada_na_Origem',
    departedToDestAt: 'Amb_Dt_Saida_da_Origem_para_Dest',
    departedToDestByEmail: 'Amb_Email_Saida_da_Origem_para_D',
    arrivedAtDestAt: 'Amb_Dt_Chegada_no_Destino',
    arrivedAtDestByEmail: 'Amb_Email_Chegada_no_Destino',
    finishedAt: 'Amb_Dt_Finalizacao_do_chamado',
    finishedByEmail: 'Amb_Email_Finalizacao_do_chamado',
    lastActionAt: 'Dt_ult_acao_operacao',
    etaOrigin: 'previsao_origem', // 2a auditoria
    etaDestination: 'previsao_destino', // 2a auditoria
    originAddress: 'Endereco_Origem', // 2a auditoria
    destinationAddress: 'Endereco_Destino', // 2a auditoria
    cancelledAt: 'Dt_Cancelamento_operacao',
    cancellationReason: 'Motivo_cancelamento', // 2a auditoria — Choice, nivel operacao
    cancellationNotes: 'Cancelamento_Observacao', // 2a auditoria
    cancellationAreaResponsible: 'Area_que_cancelou',
    aereoRequestId: 'ID_Aereo', // 2a auditoria
    ambulanciaAereo: 'Ambulancia_Aereo', // 2a auditoria
    disponibilidadeRequestId: 'ID_Solicitacao_Disponibilidade', // 2a auditoria
    fichaTransporteFrenteUrl: 'Ficha_de_transporte_frente',
    fichaTransporteVersoUrl: 'Ficha_de_transporte_verso',
    patientIsolation: 'Pacienteemisolamento',
    cleaningNurse: 'Enfermeiroquefezalimpeza',
    appVersion: 'VersaoApp',
    device: 'Dispositivo',
    qta: 'QTA',
};
// Amb_1..6_Latitude_e_Longitude + Amb_1..6_tempo_min_entre_essa_etapa —
// achatado na origem, consolidado aqui num array pro sync gravar como JSON.
const WAYPOINT_FIELDS = [1, 2, 3, 4, 5, 6].map((n) => ({
    latLon: `Amb_${n}_Latitude_e_Longitude`,
    minutesToNextStage: `Amb_${n}_tempo_min_entre_essa_etapa`,
}));
// --- Disponibilidade (f_Disponiiblidade_do_Amil_Resgate) -------------------
// AINDA SEM FLOW configurado — POWER_AUTOMATE_DISPONIBILIDADE_URL não
// existe no .env ainda (domínio novo, descoberto na auditoria). Código
// pronto, ciclo pula sozinho até a URL existir (mesmo padrão dos ciclos
// opcionais já usados no sync-job).
const DISPONIBILIDADE_FIELD = {
    id: 'ID',
    chamadoId: 'ID_Chamado_aberto',
    requesterType: 'OData__x0031__Tipo_de_Solicitante',
    ambulanceType: 'OData__x0031__Tipo_de_Ambulancia',
    tipoChamadoId: 'OData__x0031__tipo_de_chamadoId', // Lookup — sufixo "Id" no nome OData
    // Bloco de paciente/endereco do estagio 1 — 2a auditoria, mesmo padrao de
    // prefixo OData__x0031__ (campo interno comeca com "_1_") confirmado
    // acima nos campos ja existentes.
    originName: 'OData__x0031__Nome_Origem',
    destinationName: 'OData__x0031__Nome_Destino',
    expectedArrivalOriginAt: 'OData__x0031__Data_e_hora_da_chegada_n',
    patientName: 'OData__x0031__Nome_Paciente',
    patientWeightKg: 'OData__x0031__Peso_Paciente',
    patientBirthDate: 'OData__x0031__Data_Nascimento_Paciente',
    patientHeightMeters: 'OData__x0031__Altura_metro',
    patientHeightCm: 'OData__x0031__Altura_cm',
    patientHeightMetersAndCm: 'OData__x0031__Altura_metro_e_cm',
    procedure: 'OData__x0031__Procedimento',
    usesDevice: 'OData__x0031__Utiliza_dispositivo',
    deviceType: 'OData__x0031__Tipo_de_dispositivo',
    usesEquipment: 'OData__x0031__Utiliza_Equipamento',
    equipmentTypeAndQty: 'OData__x0031__Tipo_de_Equipamento_e_qt',
    originCep: 'OData__x0031__CEP_origem',
    originStreet: 'OData__x0031__Endereco_Logradouro_orig',
    originNumber: 'OData__x0031__Endereco_Numero_origem',
    originComplement: 'OData__x0031__Endereco_Complemento_Ori',
    originNeighborhood: 'OData__x0031__Endereco_Bairro_origem',
    originState: 'OData__x0031__Endereco_Estado_origem',
    originCity: 'OData__x0031__Endereco_Cidade_origem',
    originAddressConcatenated: 'OData__x0031__Endereco_origem_concaten',
    destinationCep: 'OData__x0031__CEP_destino',
    destinationStreet: 'OData__x0031__Endereco_Logradouro_dest',
    destinationNumber: 'OData__x0031__Endereco_Numero_destino',
    destinationComplement: 'OData__x0031__Endereco_Complemento_des',
    destinationNeighborhood: 'OData__x0031__Endereco_Bairro_destino',
    destinationState: 'OData__x0031__Endereco_Estado_destino',
    destinationCity: 'OData__x0031__Endereco_Cidade_destino',
    destinationAddressConcatenated: 'OData__x0031__Endereco_destino_concate',
    diagnosis: 'HD',
    state: 'CLIENTEESTADO',
    availabilityGivenAt: 'OData__x0032__Data_e_hora_da_disponibi',
    respondedAt: 'OData__x0032__Data_que_foi_respondido',
    respondedByUser: 'OData__x0032__User_que_respondeu_a_dis',
    stage2UnavailabilityReason: 'OData__x0032__motivo_da_indisponibilid', // 2a auditoria
    stage2InformAvailability: 'OData__x0032__informar_disponibilidade', // 2a auditoria
    acceptedOrDeclined: 'OData__x0033__Aceite_ou_recusa_do_soli',
    declineReason: 'OData__x0033__Motivo_caso_nao_tenha_ac',
    respondedAt3: 'OData__x0033__Data_da_Resposta_do_soli',
    acceptedByUser: 'OData__x0033__Usuario_que_aceitou_ou_r',
    finalizationControl: 'OData__x0034__Controle_finalizacao',
    finalizedAt: 'OData__x0034__Data_da_finalizacao',
    finalizedByUser: 'OData__x0034__Usuario_que_finalizou',
    status: 'Status_da_Solicitacao',
    controlStatus: 'Status_Controle',
    requesterStatus: 'Status_Solicitante',
    unavailabilityReason: 'Motivo_da_Falta_de_disponibilida',
    disponibilidadeControlStatus: 'Status_de_disponibilidade_contro', // 2a auditoria
};
// --- Triagem (f_Triagem) — AINDA SEM FLOW configurado ----------------------
const TRIAGEM_FIELD = {
    id: 'ID',
    chamadoId: 'ID_Chamado',
    diagnosis: 'Diagn_x00f3_stico',
    clinicalHistory: 'Hist_x00f3_riaCl_x00ed_nica',
    vitalSigns: 'SinaisVitais_x0028_PA_x002d_FC_x',
    resourceType: 'TipodeRecurso',
    resourceNeeded: 'RecursoNecess_x00e1_rio',
    companion: 'Acompanhante',
    medicationsInPump: 'Medica_x00e7__x00f5_esemBombadeI',
    biaEcmo: 'BIA_x002f_ECMO_x002d_Confirmarau',
    precautionTypes: 'TiposdePrecau_x00e7__x00e3_o',
    weightAndHeight: 'PesoeAltura',
    incorrectInformation: 'Informa_x00e7__x00f5_esincorreta',
    interventions: 'Interven_x00e7__x00f5_es',
    hadIntervention: 'Houveinterven_x00e7__x00e3_o_x00', // 2a auditoria
    neededMedicalContact: 'Necessitoudecontatom_x00e9_dicoA',
    doctorNameAndCrm: 'NomeeCRMdoM_x00e9_dico',
    cancellationReason: 'MotivodoCancelamento',
    hadCancellation: 'HouveCancelamento_x003f_', // 2a auditoria — "HouveCancelamento?"
    requestReason: 'MotivodaSolicita_x00e7__x00e3_o', // 2a auditoria
    originHospitalContact: 'HospitaldeOrigem_x002d_Contato_x', // 2a auditoria
    destinationHospitalContact: 'HospitaldeDestino_x002d_Contato_', // 2a auditoria
    detectedIncorrectInfo: 'Detectadoinforma_x00e7__x00f5_es', // 2a auditoria
    nurseAvailability: 'Disponibilidade_Enfermeiro', // 2a auditoria
    nurseAbsenceReason: 'Motivo_Ausencia_Enfermeiro', // 2a auditoria
    requestedAt: 'Data_do_chanado', // 2a auditoria — grafia da PROPRIA origem ("chanado", nao "chamado" — nao e erro de digitacao nosso)
    state: 'CLIENTEESTADO', // 2a auditoria
    resourceNeededLegacyText: 'RecursoNecessario', // 2a auditoria — legado, separado do Choice acima
    precautionTypeLegacyText: 'TipoPrecaucao', // 2a auditoria — legado, separado do Choice acima
};
// --- Equipe / Colaborador / ComposicaoEquipe — AINDA SEM FLOW configurado,
// achado 2026-09-21 (2a auditoria): faltava mapeamento inteiro pra essas 3
// listas, nao so campo isolado.
const EQUIPE_FIELD = {
    id: 'ID',
    name: 'Nome_Equipe',
    activityStatus: 'Status_de_Atividade',
    whatsapp: 'Whatsapp',
    state: 'CLIENTEESTADO',
    assignedBy: 'Atribuiu',
};
const COLABORADOR_FIELD = {
    id: 'ID',
    name: 'Nome_Colaborador',
    role: 'Cargo', // Choice
    activityStatus: 'Status_de_atividade', // Choice
    photoUrl: 'foto_colaborador',
    whatsapp: 'Whatsapp',
    nickname: 'Apelido',
    token: 'Token',
    state: 'CLIENTEESTADO',
    rg: 'RG',
    cnh: 'CNH',
};
const COMPOSICAO_EQUIPE_FIELD = {
    id: 'ID',
    equipeId: 'rel_ID_Equipe',
    colaboradorId: 'rel_ID_Colaborador', // Text na origem, apesar do nome — precisa Number()
    state: 'CLIENTEESTADO',
};
// --- Diario da Missao (f_Diario_da_Missao) — era MissionEvent -------------
const DIARIO_FIELD = {
    id: 'ID',
    chamadoId: 'ID_Chamado',
    operacaoId: 'ID_Operacao',
    disponibilidadeId: 'ID_Disponibilidade',
    message: 'Mensagem',
    currentMoment: 'Momentoatual',
    tripType: 'Tipo_de_viagem',
    accessType: 'tipo_acesso',
    readStatusRequester: 'Status_de_leitora_Solicitante',
    readStatusControl: 'Status_de_leitora_Controle',
    readStatusRescue: 'Status_de_leitora_Resgate',
    state: 'CLIENTEESTADO', // 2a auditoria — CORRIGIDO: o codigo antigo (MISSION_EVENT_FIELD) tinha "CLIENTE ESTADO" com espaco, mas esse pipeline nunca rodou em producao de verdade (nunca validado). Conferido ao vivo 2026-09-21: o nome real e sem espaco, igual todo o resto
    createdAt: 'Created',
    createdBy: 'Created By',
};
// Mesmo comportamento do arquivo antigo: gatilho HTTP do Power Automate so
// aceita POST, timeout pra nao travar o loop inteiro se o flow enfileirar/
// throttlar (ver DECISOES_Infra_MapaAmbulancias.md).
const FLOW_TIMEOUT_MS = 20000;
async function callFlow(url, params) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params ?? {})) {
        target.searchParams.set(key, value);
    }
    const response = await fetch(target.toString(), { method: 'POST', signal: AbortSignal.timeout(FLOW_TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`Flow do Power Automate retornou ${response.status} em ${target.pathname}: ${await response.text()}`);
    }
    const body = (await response.json());
    return Array.isArray(body) ? body : body.value;
}
function toNumber(value) {
    if (value == null)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function toDate(value) {
    return value ? new Date(value) : null;
}
function toStringOrNull(value) {
    return value == null ? null : String(value);
}
// Campo de escolha/lookup do SharePoint vem como objeto { Id, Value } via
// conector do Power Automate — aceita string pura tambem (fallback).
function toChoiceValue(value) {
    if (value && typeof value === 'object' && 'Value' in value) {
        return toStringOrNull(value.Value);
    }
    return toStringOrNull(value);
}
function toChoiceId(value) {
    if (value && typeof value === 'object' && 'Id' in value) {
        return toNumber(value.Id);
    }
    return toNumber(value);
}
function toBool(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true')
            return true;
        if (value.toLowerCase() === 'false')
            return false;
    }
    return null;
}
function mapPosicaoItems(items, field) {
    const entries = [];
    for (const item of items) {
        const id = Number(item.ID ?? item.Id);
        const veiculoId = toNumber(item[field.veiculoId]);
        const latitude = toNumber(item[field.latitude]);
        const longitude = toNumber(item[field.longitude]);
        const positionAt = toDate(item[field.positionAt]);
        if (!Number.isInteger(id) || latitude == null || longitude == null || !positionAt) {
            console.warn(`[sharepoint] item de posicao ignorado (dado incompleto): id=${item.ID ?? item.Id}`);
            continue;
        }
        entries.push({
            id,
            veiculoId,
            operacaoId: toNumber(item[field.operationId]),
            chamadoId: toNumber(item[field.callId]),
            latitude,
            longitude,
            positionAt,
            vehicleStatus: 'vehicleStatus' in field ? toStringOrNull(item[field.vehicleStatus]) : null,
            tabletId: 'tabletId' in field ? toNumber(item[field.tabletId]) : null,
            appVersion: toStringOrNull(item[field.appVersion]),
            device: toStringOrNull(item[field.device]),
            action: 'action' in field ? toStringOrNull(item[field.action]) : null,
        });
    }
    return entries;
}
exports.sharepointSource = {
    async fetchVeiculos() {
        if (!config_1.default.sharepoint)
            throw new Error('Configuracao do SharePoint ausente');
        const items = await callFlow(config_1.default.sharepoint.fleetUrl);
        return items.map((item) => ({
            id: Number(item[VEICULO_FIELD.id]),
            name: String(item[VEICULO_FIELD.name] ?? ''),
            licensePlate: toStringOrNull(item[VEICULO_FIELD.licensePlate]),
            vehicleType: toStringOrNull(item[VEICULO_FIELD.vehicleType]),
            activityStatus: toChoiceValue(item[VEICULO_FIELD.activityStatus]),
            operationStatus: toChoiceValue(item[VEICULO_FIELD.operationStatus]),
            initialKm: toNumber(item[VEICULO_FIELD.initialKm]),
            tabletId: toNumber(item[VEICULO_FIELD.tabletId]),
            tabletAssignmentStatus: toChoiceValue(item[VEICULO_FIELD.tabletAssignmentStatus]),
            tabletEmail: toStringOrNull(item[VEICULO_FIELD.tabletEmail]),
            state: toStringOrNull(item[VEICULO_FIELD.state]),
            teamAssignmentStatus: toStringOrNull(item[VEICULO_FIELD.teamAssignmentStatus]),
            edition: toStringOrNull(item[VEICULO_FIELD.edition]),
            statusChangedAt: toDate(item[VEICULO_FIELD.statusChangedAt]),
        }));
    },
    async fetchPosicaoForVeiculo(veiculoId, sinceItemId) {
        if (!config_1.default.sharepoint?.trackingUrl)
            throw new Error('POWER_AUTOMATE_TRACKING_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.trackingUrl, {
            veiculo: String(veiculoId),
            desdeId: String(sinceItemId),
        });
        return mapPosicaoItems(items, POSICAO_FIELD);
    },
    async fetchPosicaoBackfillForOperacao(operacaoId) {
        if (!config_1.default.sharepoint?.historyBackfillUrl)
            throw new Error('POWER_AUTOMATE_HISTORY_BACKFILL_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.historyBackfillUrl, { operacao: String(operacaoId) });
        // Mesmo offset do arquivo antigo — index.ts precisa excluir IDs acima
        // disso do watermark incremental normal, senao o cursor pula pra mais
        // de 1 bilhao e para de achar linha nova (bug real ja visto).
        return mapPosicaoItems(items, POSICAO_BACKFILL_FIELD).map((entry) => ({ ...entry, id: entry.id + exports.BACKFILL_ID_OFFSET }));
    },
    async fetchRecentChamados() {
        if (!config_1.default.sharepoint?.regulationsUrl)
            throw new Error('POWER_AUTOMATE_REGULATIONS_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.regulationsUrl);
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            if (!Number.isInteger(id)) {
                console.warn(`[sharepoint] chamado ignorado (sem ID): id=${item.ID ?? item.Id}`);
                continue;
            }
            entries.push({
                id,
                patientName: toStringOrNull(item[CHAMADO_FIELD.patientName]),
                medicalRecordNumber: toNumber(item[CHAMADO_FIELD.medicalRecordNumber]),
                patientBirthDate: toDate(item[CHAMADO_FIELD.patientBirthDate]),
                patientAge: toStringOrNull(item[CHAMADO_FIELD.patientAge]),
                patientSex: toChoiceValue(item[CHAMADO_FIELD.patientSex]),
                patientWeightKg: toNumber(item[CHAMADO_FIELD.patientWeightKg]),
                patientHeightCm: toNumber(item[CHAMADO_FIELD.patientHeightCm]),
                patientType: toChoiceValue(item[CHAMADO_FIELD.patientType]),
                patientTypeOther: toStringOrNull(item[CHAMADO_FIELD.patientTypeOther]),
                isIntubated: toBool(item[CHAMADO_FIELD.isIntubated]),
                isObese: toBool(item[CHAMADO_FIELD.isObese]),
                healthPlan: toChoiceValue(item[CHAMADO_FIELD.healthPlan]),
                contact: toStringOrNull(item[CHAMADO_FIELD.contact]),
                patientEmail: toStringOrNull(item[CHAMADO_FIELD.patientEmail]),
                originPhone: toStringOrNull(item[CHAMADO_FIELD.originPhone]),
                destinationPhone: toStringOrNull(item[CHAMADO_FIELD.destinationPhone]),
                diagnosis: toStringOrNull(item[CHAMADO_FIELD.diagnosis]),
                procedure: toChoiceValue(item[CHAMADO_FIELD.procedure]),
                equipment: toStringOrNull(item[CHAMADO_FIELD.equipment]),
                deviceUsage: toStringOrNull(item[CHAMADO_FIELD.deviceUsage]),
                requestedVehicleType: toChoiceValue(item[CHAMADO_FIELD.requestedVehicleType]),
                triageCompleted: toBool(item[CHAMADO_FIELD.triageCompleted]),
                tipoChamadoId: toChoiceId(item[CHAMADO_FIELD.tipoChamadoId]),
                tipoChamadoText: toStringOrNull(item[CHAMADO_FIELD.tipoChamadoText]),
                callReason: toStringOrNull(item[CHAMADO_FIELD.callReason]),
                requestOrigin: toStringOrNull(item[CHAMADO_FIELD.requestOrigin]),
                requestedAt: toDate(item[CHAMADO_FIELD.requestedAt]),
                originName: toStringOrNull(item[CHAMADO_FIELD.originName]),
                originAddress: toStringOrNull(item[CHAMADO_FIELD.originAddress]),
                originSector: toStringOrNull(item[CHAMADO_FIELD.originSector]),
                destinationName: toStringOrNull(item[CHAMADO_FIELD.destinationName]),
                destinationAddress: toStringOrNull(item[CHAMADO_FIELD.destinationAddress]),
                destinationSector: toStringOrNull(item[CHAMADO_FIELD.destinationSector]),
                companion: null, // AUSENTE do flow real hoje, ver auditoria
                originDoctor: toStringOrNull(item[CHAMADO_FIELD.originDoctor]),
                destinationDoctor: toStringOrNull(item[CHAMADO_FIELD.destinationDoctor]),
                state: toStringOrNull(item[CHAMADO_FIELD.state]),
                orderNumber: toNumber(item[CHAMADO_FIELD.orderNumber]),
                notes: toStringOrNull(item[CHAMADO_FIELD.notes]),
                statusRaw: toStringOrNull(item[CHAMADO_FIELD.status]),
                statusForEdit: toChoiceValue(item[CHAMADO_FIELD.statusForEdit]),
                motivoCancelamentoRaw: toStringOrNull(item[CHAMADO_FIELD.motivoCancelamento]),
                cancellationNotes: toStringOrNull(item[CHAMADO_FIELD.cancellationNotes]),
                expectedArrivalOriginAt: toDate(item[CHAMADO_FIELD.expectedArrivalOriginAt]),
                expectedArrivalDestAt: toDate(item[CHAMADO_FIELD.expectedArrivalDestAt]),
                actualArrivalDestAt: toDate(item[CHAMADO_FIELD.actualArrivalDestAt]),
                aereoRequestId: toNumber(item[CHAMADO_FIELD.aereoRequestId]),
                aereoText: toStringOrNull(item[CHAMADO_FIELD.aereoText]),
                ambulanciaAereo: toStringOrNull(item[CHAMADO_FIELD.ambulanciaAereo]),
            });
        }
        return entries;
    },
    async fetchRecentOperacoes() {
        if (!config_1.default.sharepoint?.missionsUrl)
            throw new Error('POWER_AUTOMATE_MISSIONS_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.missionsUrl);
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const callId = toNumber(item[OPERACAO_FIELD.callId]);
            if (!Number.isInteger(id) || callId == null) {
                console.warn(`[sharepoint] operacao ignorada (sem ID/ID_Chamado): id=${item.ID ?? item.Id}`);
                continue;
            }
            entries.push({
                id,
                chamadoId: callId,
                tripTypeRaw: toChoiceValue(item[OPERACAO_FIELD.tripType]) ?? '',
                equipeId: toNumber(item[OPERACAO_FIELD.equipeId]),
                veiculoId: toNumber(item[OPERACAO_FIELD.veiculoId]),
                currentStatusRaw: toStringOrNull(item[OPERACAO_FIELD.currentStatus]),
                shortStatus: toStringOrNull(item[OPERACAO_FIELD.shortStatus]),
                operationStatus: toChoiceValue(item[OPERACAO_FIELD.operationStatus]),
                acceptanceStatus: toChoiceValue(item[OPERACAO_FIELD.acceptanceStatus]),
                minAmbulanceAt: toDate(item[OPERACAO_FIELD.minAmbulanceAt]),
                assignedFlag: toBool(item[OPERACAO_FIELD.assignedFlag]),
                state: toStringOrNull(item[OPERACAO_FIELD.state]),
                acknowledgementStatus: toChoiceValue(item[OPERACAO_FIELD.acknowledgementStatus]),
                departedToOriginStatus: toChoiceValue(item[OPERACAO_FIELD.departedToOriginStatus]),
                arrivedAtOriginStatus: toChoiceValue(item[OPERACAO_FIELD.arrivedAtOriginStatus]),
                departedToDestStatus: toChoiceValue(item[OPERACAO_FIELD.departedToDestStatus]),
                arrivedAtDestStatus: toChoiceValue(item[OPERACAO_FIELD.arrivedAtDestStatus]),
                finishedStatus: toChoiceValue(item[OPERACAO_FIELD.finishedStatus]),
                assignedAt: toDate(item[OPERACAO_FIELD.assignedAt]),
                assignedByEmail: toStringOrNull(item[OPERACAO_FIELD.assignedByEmail]),
                acknowledgedAt: toDate(item[OPERACAO_FIELD.acknowledgedAt]),
                acknowledgedByEmail: toStringOrNull(item[OPERACAO_FIELD.acknowledgedByEmail]),
                departedToOriginAt: toDate(item[OPERACAO_FIELD.departedToOriginAt]),
                departedToOriginByEmail: toStringOrNull(item[OPERACAO_FIELD.departedToOriginByEmail]),
                arrivedAtOriginAt: toDate(item[OPERACAO_FIELD.arrivedAtOriginAt]),
                arrivedAtOriginByEmail: toStringOrNull(item[OPERACAO_FIELD.arrivedAtOriginByEmail]),
                departedToDestAt: toDate(item[OPERACAO_FIELD.departedToDestAt]),
                departedToDestByEmail: toStringOrNull(item[OPERACAO_FIELD.departedToDestByEmail]),
                arrivedAtDestAt: toDate(item[OPERACAO_FIELD.arrivedAtDestAt]),
                arrivedAtDestByEmail: toStringOrNull(item[OPERACAO_FIELD.arrivedAtDestByEmail]),
                finishedAt: toDate(item[OPERACAO_FIELD.finishedAt]),
                finishedByEmail: toStringOrNull(item[OPERACAO_FIELD.finishedByEmail]),
                lastActionAt: toDate(item[OPERACAO_FIELD.lastActionAt]),
                etaOrigin: toDate(item[OPERACAO_FIELD.etaOrigin]),
                etaDestination: toDate(item[OPERACAO_FIELD.etaDestination]),
                originAddress: toStringOrNull(item[OPERACAO_FIELD.originAddress]),
                destinationAddress: toStringOrNull(item[OPERACAO_FIELD.destinationAddress]),
                cancelledAt: toDate(item[OPERACAO_FIELD.cancelledAt]),
                cancellationReason: toChoiceValue(item[OPERACAO_FIELD.cancellationReason]),
                cancellationNotes: toStringOrNull(item[OPERACAO_FIELD.cancellationNotes]),
                cancellationAreaResponsible: toChoiceValue(item[OPERACAO_FIELD.cancellationAreaResponsible]),
                aereoRequestId: toNumber(item[OPERACAO_FIELD.aereoRequestId]),
                ambulanciaAereo: toStringOrNull(item[OPERACAO_FIELD.ambulanciaAereo]),
                disponibilidadeRequestId: toNumber(item[OPERACAO_FIELD.disponibilidadeRequestId]),
                waypoints: WAYPOINT_FIELDS.map((w) => ({
                    latLon: toStringOrNull(item[w.latLon]),
                    minutesToNextStage: toNumber(item[w.minutesToNextStage]),
                })),
                fichaTransporteFrenteUrl: toStringOrNull(item[OPERACAO_FIELD.fichaTransporteFrenteUrl]),
                fichaTransporteVersoUrl: toStringOrNull(item[OPERACAO_FIELD.fichaTransporteVersoUrl]),
                patientIsolation: toStringOrNull(item[OPERACAO_FIELD.patientIsolation]),
                cleaningNurse: toStringOrNull(item[OPERACAO_FIELD.cleaningNurse]),
                appVersion: toStringOrNull(item[OPERACAO_FIELD.appVersion]),
                device: toStringOrNull(item[OPERACAO_FIELD.device]),
                qta: toStringOrNull(item[OPERACAO_FIELD.qta]),
            });
        }
        return entries;
    },
    async fetchEquipes() {
        if (!config_1.default.sharepoint?.equipesUrl)
            throw new Error('POWER_AUTOMATE_EQUIPES_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.equipesUrl);
        return items
            .map((item) => ({ id: Number(item[EQUIPE_FIELD.id]), item }))
            .filter((x) => Number.isInteger(x.id))
            .map(({ id, item }) => ({
            id,
            name: String(item[EQUIPE_FIELD.name] ?? ''),
            activityStatus: toChoiceValue(item[EQUIPE_FIELD.activityStatus]),
            whatsapp: toStringOrNull(item[EQUIPE_FIELD.whatsapp]),
            state: toStringOrNull(item[EQUIPE_FIELD.state]),
            assignedBy: toStringOrNull(item[EQUIPE_FIELD.assignedBy]),
        }));
    },
    async fetchColaboradores() {
        if (!config_1.default.sharepoint?.colaboradoresUrl)
            throw new Error('POWER_AUTOMATE_COLABORADORES_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.colaboradoresUrl);
        return items
            .map((item) => ({ id: Number(item[COLABORADOR_FIELD.id]), item }))
            .filter((x) => Number.isInteger(x.id))
            .map(({ id, item }) => ({
            id,
            name: String(item[COLABORADOR_FIELD.name] ?? ''),
            nickname: toStringOrNull(item[COLABORADOR_FIELD.nickname]),
            role: toChoiceValue(item[COLABORADOR_FIELD.role]),
            activityStatus: toChoiceValue(item[COLABORADOR_FIELD.activityStatus]),
            whatsapp: toStringOrNull(item[COLABORADOR_FIELD.whatsapp]),
            rg: toStringOrNull(item[COLABORADOR_FIELD.rg]),
            cnh: toStringOrNull(item[COLABORADOR_FIELD.cnh]),
            photoUrl: toStringOrNull(item[COLABORADOR_FIELD.photoUrl]),
            token: toStringOrNull(item[COLABORADOR_FIELD.token]),
            state: toStringOrNull(item[COLABORADOR_FIELD.state]),
        }));
    },
    async fetchComposicaoEquipe() {
        if (!config_1.default.sharepoint?.composicaoEquipeUrl)
            throw new Error('POWER_AUTOMATE_COMPOSICAO_EQUIPE_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.composicaoEquipeUrl);
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const equipeId = toNumber(item[COMPOSICAO_EQUIPE_FIELD.equipeId]);
            const colaboradorId = toNumber(item[COMPOSICAO_EQUIPE_FIELD.colaboradorId]);
            if (!Number.isInteger(id) || equipeId == null || colaboradorId == null)
                continue;
            entries.push({
                id,
                equipeId,
                colaboradorId,
                state: toStringOrNull(item[COMPOSICAO_EQUIPE_FIELD.state]),
            });
        }
        return entries;
    },
    // Ciclos novos (Disponibilidade/Triagem), sem flow configurado ainda —
    // lancam erro descritivo se chamados sem config.sharepoint.*Url, mas
    // index.ts so chama isso se a URL existir (mesmo padrao ja usado pros
    // ciclos opcionais existentes).
    async fetchRecentDisponibilidades() {
        if (!config_1.default.sharepoint?.disponibilidadeUrl)
            throw new Error('POWER_AUTOMATE_DISPONIBILIDADE_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.disponibilidadeUrl);
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            if (!Number.isInteger(id))
                continue;
            entries.push({
                id,
                chamadoId: toNumber(item[DISPONIBILIDADE_FIELD.chamadoId]),
                requesterType: toChoiceValue(item[DISPONIBILIDADE_FIELD.requesterType]),
                ambulanceType: toChoiceValue(item[DISPONIBILIDADE_FIELD.ambulanceType]),
                tipoChamadoId: toNumber(item[DISPONIBILIDADE_FIELD.tipoChamadoId]),
                originName: toStringOrNull(item[DISPONIBILIDADE_FIELD.originName]),
                destinationName: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationName]),
                expectedArrivalOriginAt: toDate(item[DISPONIBILIDADE_FIELD.expectedArrivalOriginAt]),
                patientName: toStringOrNull(item[DISPONIBILIDADE_FIELD.patientName]),
                patientWeightKg: toNumber(item[DISPONIBILIDADE_FIELD.patientWeightKg]),
                patientBirthDate: toDate(item[DISPONIBILIDADE_FIELD.patientBirthDate]),
                patientHeightMeters: toNumber(item[DISPONIBILIDADE_FIELD.patientHeightMeters]),
                patientHeightCm: toNumber(item[DISPONIBILIDADE_FIELD.patientHeightCm]),
                patientHeightMetersAndCm: toStringOrNull(item[DISPONIBILIDADE_FIELD.patientHeightMetersAndCm]),
                procedure: toChoiceValue(item[DISPONIBILIDADE_FIELD.procedure]),
                usesDevice: toBool(item[DISPONIBILIDADE_FIELD.usesDevice]),
                deviceType: toChoiceValue(item[DISPONIBILIDADE_FIELD.deviceType]),
                usesEquipment: toBool(item[DISPONIBILIDADE_FIELD.usesEquipment]),
                equipmentTypeAndQty: toStringOrNull(item[DISPONIBILIDADE_FIELD.equipmentTypeAndQty]),
                originCep: toNumber(item[DISPONIBILIDADE_FIELD.originCep]),
                originStreet: toStringOrNull(item[DISPONIBILIDADE_FIELD.originStreet]),
                originNumber: toNumber(item[DISPONIBILIDADE_FIELD.originNumber]),
                originComplement: toStringOrNull(item[DISPONIBILIDADE_FIELD.originComplement]),
                originNeighborhood: toStringOrNull(item[DISPONIBILIDADE_FIELD.originNeighborhood]),
                originState: toStringOrNull(item[DISPONIBILIDADE_FIELD.originState]),
                originCity: toStringOrNull(item[DISPONIBILIDADE_FIELD.originCity]),
                originAddressConcatenated: toStringOrNull(item[DISPONIBILIDADE_FIELD.originAddressConcatenated]),
                destinationCep: toNumber(item[DISPONIBILIDADE_FIELD.destinationCep]),
                destinationStreet: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationStreet]),
                destinationNumber: toNumber(item[DISPONIBILIDADE_FIELD.destinationNumber]),
                destinationComplement: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationComplement]),
                destinationNeighborhood: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationNeighborhood]),
                destinationState: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationState]),
                destinationCity: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationCity]),
                destinationAddressConcatenated: toStringOrNull(item[DISPONIBILIDADE_FIELD.destinationAddressConcatenated]),
                diagnosis: toStringOrNull(item[DISPONIBILIDADE_FIELD.diagnosis]),
                state: toStringOrNull(item[DISPONIBILIDADE_FIELD.state]),
                availabilityGivenAt: toDate(item[DISPONIBILIDADE_FIELD.availabilityGivenAt]),
                respondedAt: toDate(item[DISPONIBILIDADE_FIELD.respondedAt]),
                respondedByUser: toStringOrNull(item[DISPONIBILIDADE_FIELD.respondedByUser]),
                stage2UnavailabilityReason: toChoiceValue(item[DISPONIBILIDADE_FIELD.stage2UnavailabilityReason]),
                stage2InformAvailability: toBool(item[DISPONIBILIDADE_FIELD.stage2InformAvailability]),
                acceptedOrDeclined: toBool(item[DISPONIBILIDADE_FIELD.acceptedOrDeclined]),
                declineReason: toStringOrNull(item[DISPONIBILIDADE_FIELD.declineReason]),
                respondedAt3: toDate(item[DISPONIBILIDADE_FIELD.respondedAt3]),
                acceptedByUser: toStringOrNull(item[DISPONIBILIDADE_FIELD.acceptedByUser]),
                finalizationControl: toStringOrNull(item[DISPONIBILIDADE_FIELD.finalizationControl]),
                finalizedAt: toDate(item[DISPONIBILIDADE_FIELD.finalizedAt]),
                finalizedByUser: toStringOrNull(item[DISPONIBILIDADE_FIELD.finalizedByUser]),
                status: toStringOrNull(item[DISPONIBILIDADE_FIELD.status]),
                controlStatus: toStringOrNull(item[DISPONIBILIDADE_FIELD.controlStatus]),
                requesterStatus: toStringOrNull(item[DISPONIBILIDADE_FIELD.requesterStatus]),
                unavailabilityReason: toChoiceValue(item[DISPONIBILIDADE_FIELD.unavailabilityReason]),
                disponibilidadeControlStatus: toChoiceValue(item[DISPONIBILIDADE_FIELD.disponibilidadeControlStatus]),
            });
        }
        return entries;
    },
    async fetchRecentTriagens() {
        if (!config_1.default.sharepoint?.triagemUrl)
            throw new Error('POWER_AUTOMATE_TRIAGEM_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.triagemUrl);
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const chamadoId = toNumber(item[TRIAGEM_FIELD.chamadoId]);
            if (!Number.isInteger(id) || chamadoId == null)
                continue;
            entries.push({
                id,
                chamadoId,
                diagnosis: toStringOrNull(item[TRIAGEM_FIELD.diagnosis]),
                clinicalHistory: toStringOrNull(item[TRIAGEM_FIELD.clinicalHistory]),
                vitalSigns: toStringOrNull(item[TRIAGEM_FIELD.vitalSigns]),
                resourceType: toChoiceValue(item[TRIAGEM_FIELD.resourceType]),
                resourceNeeded: toChoiceValue(item[TRIAGEM_FIELD.resourceNeeded]),
                companion: toChoiceValue(item[TRIAGEM_FIELD.companion]),
                medicationsInPump: toStringOrNull(item[TRIAGEM_FIELD.medicationsInPump]),
                biaEcmo: toStringOrNull(item[TRIAGEM_FIELD.biaEcmo]),
                precautionTypes: toChoiceValue(item[TRIAGEM_FIELD.precautionTypes]),
                weightAndHeight: toStringOrNull(item[TRIAGEM_FIELD.weightAndHeight]),
                incorrectInformation: toStringOrNull(item[TRIAGEM_FIELD.incorrectInformation]),
                interventions: toStringOrNull(item[TRIAGEM_FIELD.interventions]),
                hadIntervention: toChoiceValue(item[TRIAGEM_FIELD.hadIntervention]),
                neededMedicalContact: toBool(item[TRIAGEM_FIELD.neededMedicalContact]),
                doctorNameAndCrm: toStringOrNull(item[TRIAGEM_FIELD.doctorNameAndCrm]),
                cancellationReason: toChoiceValue(item[TRIAGEM_FIELD.cancellationReason]),
                hadCancellation: toChoiceValue(item[TRIAGEM_FIELD.hadCancellation]),
                requestReason: toChoiceValue(item[TRIAGEM_FIELD.requestReason]),
                originHospitalContact: toStringOrNull(item[TRIAGEM_FIELD.originHospitalContact]),
                destinationHospitalContact: toStringOrNull(item[TRIAGEM_FIELD.destinationHospitalContact]),
                detectedIncorrectInfo: toChoiceValue(item[TRIAGEM_FIELD.detectedIncorrectInfo]),
                nurseAvailability: toChoiceValue(item[TRIAGEM_FIELD.nurseAvailability]),
                nurseAbsenceReason: toChoiceValue(item[TRIAGEM_FIELD.nurseAbsenceReason]),
                requestedAt: toDate(item[TRIAGEM_FIELD.requestedAt]),
                state: toStringOrNull(item[TRIAGEM_FIELD.state]),
                resourceNeededLegacyText: toStringOrNull(item[TRIAGEM_FIELD.resourceNeededLegacyText]),
                precautionTypeLegacyText: toStringOrNull(item[TRIAGEM_FIELD.precautionTypeLegacyText]),
            });
        }
        return entries;
    },
    async fetchDiarioSince(since) {
        if (!config_1.default.sharepoint?.diarioUrl)
            throw new Error('POWER_AUTOMATE_DIARIO_URL ausente');
        const items = await callFlow(config_1.default.sharepoint.diarioUrl, { desde: since.toISOString() });
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const chamadoId = toNumber(item[DIARIO_FIELD.chamadoId]);
            const createdAt = toDate(item[DIARIO_FIELD.createdAt]);
            if (!Number.isInteger(id) || chamadoId == null || !createdAt) {
                console.warn(`[sharepoint] entrada de diario ignorada (dado incompleto): id=${item.ID ?? item.Id}`);
                continue;
            }
            entries.push({
                id,
                chamadoId,
                operacaoId: toNumber(item[DIARIO_FIELD.operacaoId]),
                disponibilidadeId: toNumber(item[DIARIO_FIELD.disponibilidadeId]),
                message: toStringOrNull(item[DIARIO_FIELD.message]),
                currentMoment: toStringOrNull(item[DIARIO_FIELD.currentMoment]),
                tripTypeRaw: toStringOrNull(item[DIARIO_FIELD.tripType]),
                accessType: toStringOrNull(item[DIARIO_FIELD.accessType]),
                readStatusRequester: toNumber(item[DIARIO_FIELD.readStatusRequester]),
                readStatusControl: toNumber(item[DIARIO_FIELD.readStatusControl]),
                readStatusRescue: toNumber(item[DIARIO_FIELD.readStatusRescue]),
                state: toStringOrNull(item[DIARIO_FIELD.state]),
                createdAt,
                createdBy: toStringOrNull(item[DIARIO_FIELD.createdBy]),
            });
        }
        return entries;
    },
};
