"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharepointSource = void 0;
const config_1 = __importDefault(require("../config"));
// Fonte real: nao fala com o Graph API direto (exigiria um app registrado no
// Entra ID, que o usuario nao tem acesso pra provisionar). Em vez disso,
// consome 2 flows do Power Automate que fazem de proxy pro SharePoint —
// cada flow roda sob a conexao SharePoint ja autorizada de quem o criou, e
// expoe uma URL com assinatura embutida (?sig=...) como unico "segredo".
// Ver secao "Integracao real com o SharePoint" em
// DECISOES_Infra_MapaAmbulancias.md pro desenho completo e pra instrucao de
// como montar os 2 flows.
//
// Nomes de campo abaixo CONFIRMADOS contra o JSON real dos flows
// MapaAmbulancias_ObterFrota/ObterHistorico (2026-08-20, chamadas de teste
// diretas). O gatilho HTTP do Power Automate so aceita POST (nao GET como
// as instrucoes originais assumiam) — ver callFlow().
//
// Pegadinhas reais descobertas no dado de producao:
// 1. Campos de "escolha" do SharePoint na lista de cadastro (Status_
//    Operacao, Status_Atividade, Status_Atribuicao_Tablet) vem como OBJETO
//    aninhado { Id, Value: "texto" }, nao como string direta — ver
//    toChoiceValue(). Os mesmos nomes de campo na lista de rastreio (ex:
//    Status_Veiculo, Status_Operacao) vem como string PLANA — inconsistente
//    entre as 2 listas, cuidado ao copiar padrao de uma pra outra.
// 2. O vinculo real entre as 2 listas NAO e o que estava documentado antes
//    como "confirmado pelo usuario" (ID_Veiculo <-> ID_Tablet_Cadastrado).
//    Testando com dado real: f_Rastreamento_Ambulancia.ID_Veiculo bate 100%
//    com d_Cadastro_Veiculos.ID (o proprio ID do item no SharePoint, NAO
//    ID_Tablet_Cadastrado) — e f_Rastreamento_Ambulancia.ID_Tablet e quem
//    bate com ID_Tablet_Cadastrado. Por isso vehicleId usa "ID" abaixo, nao
//    ID_Tablet_Cadastrado — e de quebra resolve o problema de ~35% das
//    vans (varias "RJ") nao terem ID_Tablet_Cadastrado preenchido: "ID" do
//    SharePoint sempre existe.
const FLEET_FIELD = {
    vehicleId: 'ID', // ID do item no SharePoint — NAO ID_Tablet_Cadastrado, ver nota acima
    name: 'Nome_veiculo',
    licensePlate: 'Placa_Veiculo',
    vehicleType: 'Tipo_de_Veiculo',
    state: 'CLIENTEESTADO', // sem espaco, sem underscore — confirmado
    status: 'Status_Operacao', // objeto { Value } — ver toChoiceValue()
    activityStatus: 'Status_Atividade', // objeto { Value } — ver toChoiceValue()
    assignmentStatus: 'Status_Atribuicao_Tablet', // objeto { Value } — ver toChoiceValue()
    tabletEmail: 'Email_Tablet',
    statusChangedAt: 'Modificacao_Status',
    latitude: 'Latitude_atual',
    longitude: 'Longitude_atual',
    positionAt: 'Data_e_hora_dados_localizacao', // confirmado — timestamp real do fix de GPS, melhor que "Modified"
};
// Confirmado pelo usuario (2026-08-20, screenshot da lista f_Diario_da_Missao)
// — unico campo ainda truncado e "ID_Disponibilid..." (grafia completa a
// confirmar). "Momento_atual" e o texto exibido na timeline (confirmado
// explicitamente); "Mensagem" e um campo a parte, hoje so com dado de teste
// na origem, proposito real ainda incerto.
const MISSION_EVENT_FIELD = {
    callId: 'ID_Chamado',
    operationId: 'ID_Operacao',
    availabilityId: 'ID_Disponibilidade', // truncada como "ID_Disponibilid..." no screenshot — grafia exata a confirmar
    tripType: 'Tipo_de_viagem',
    statusMessage: 'Momento_atual',
    message: 'Mensagem',
    accessType: 'tipo_acesso',
    state: 'CLIENTE ESTADO',
    readStatusRequester: 'Status_de_leitora_Solicitante',
    readStatusControl: 'Status_de_leitora_Controle',
    readStatusRescue: 'Status_de_leitora_Resgate',
    // "Created"/"Created By" sao metadado padrao do SharePoint (sempre
    // existem) — usados aqui de proposito, nao so como fallback: nao ha outro
    // timestamp na lista, e "Created By" mostra quem postou a mensagem
    // (relevante pra timeline, diferente do caso de vehicle/rastreio onde
    // esses campos foram excluidos por serem so auditoria).
    createdAt: 'Created',
    createdBy: 'Created By',
};
const HISTORY_FIELD = {
    vehicleId: 'ID_Veiculo', // bate com FLEET_FIELD.vehicleId ("ID" do item no cadastro) — testado com dado real, ver nota acima
    latitude: 'Latitude',
    longitude: 'Longitude',
    positionAt: 'Data_Localizacao',
    vehicleStatus: 'Status_Veiculo', // string plana nesta lista (nao objeto — diferente da lista de cadastro)
    callId: 'ID_Chamado',
    operationId: 'ID_Operacao',
    appVersion: 'VersaoApp',
    device: 'Dispositivo',
    // Campo "ID_Tablet" (nao "ID_Veiculo") e quem bate com d_Cadastro_
    // Veiculos.ID_Tablet_Cadastrado — nao usado aqui porque o link do schema
    // e por vehicleId (= "ID" do cadastro), nao pelo tablet. "Status_Operacao"
    // tambem existe nesta lista (duplicando Status_Veiculo no teste real) —
    // ainda nao usado, significado exato entre os dois nao confirmado.
};
// Confirmado testando (2026-08-20): o gatilho HTTP do Power Automate criado
// pelo designer so aceita POST — GET devolve TriggerRequestMethodNotValid,
// mesmo com o dropdown "Metodo" configurado como GET nas instrucoes
// originais. Query string continua funcionando normal com POST.
// Sem timeout, uma execucao enfileirada/throttled do lado do Power Automate
// (ver DECISOES_Infra_MapaAmbulancias.md) deixa o fetch pendurado pra
// sempre — como cada loop (startLoop em index.ts) so agenda o proximo tick
// DEPOIS do atual terminar, isso trava o loop inteiro permanentemente, nao
// so aquele ciclo (bug real visto em producao: historico rodou 1 vez com
// sucesso e nunca mais, mesmo minutos depois). Abortar depois de um tempo
// razoavel deixa o proximo tick agendado tentar de novo.
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
    // A acao "Resposta" foi instruida a devolver body(...)?['value'] direto
    // (ja um array, confirmado no teste real) — o fallback pra { value: [...] }
    // cobre o caso de alguem reconfigurar o flow pra devolver o corpo inteiro
    // do "Obter itens".
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
// Campos de "escolha"/lookup do SharePoint vem, via conector do Power
// Automate, como objeto { Id, Value } — nao string direta. Aceita tambem
// string pura (fallback caso o conector devolva achatado em algum campo).
function toChoiceValue(value) {
    if (value && typeof value === 'object' && 'Value' in value) {
        return toStringOrNull(value.Value);
    }
    return toStringOrNull(value);
}
exports.sharepointSource = {
    async fetchFleet() {
        if (!config_1.default.sharepoint) {
            throw new Error('Configuracao do SharePoint ausente');
        }
        const items = await callFlow(config_1.default.sharepoint.fleetUrl);
        return items.map((item) => {
            return {
                vehicleId: String(item[FLEET_FIELD.vehicleId] ?? ''),
                name: String(item[FLEET_FIELD.name] ?? ''),
                licensePlate: toStringOrNull(item[FLEET_FIELD.licensePlate]),
                vehicleType: toStringOrNull(item[FLEET_FIELD.vehicleType]),
                state: toStringOrNull(item[FLEET_FIELD.state]),
                status: toChoiceValue(item[FLEET_FIELD.status]),
                activityStatus: toChoiceValue(item[FLEET_FIELD.activityStatus]),
                assignmentStatus: toChoiceValue(item[FLEET_FIELD.assignmentStatus]),
                tabletEmail: toStringOrNull(item[FLEET_FIELD.tabletEmail]),
                statusChangedAt: toDate(item[FLEET_FIELD.statusChangedAt]),
                latitude: toNumber(item[FLEET_FIELD.latitude]),
                longitude: toNumber(item[FLEET_FIELD.longitude]),
                positionAt: toDate(item[FLEET_FIELD.positionAt]),
            };
        });
    },
    // "since" e repassado como query string ?desde=<ISO> pro flow, que usa isso
    // na Consulta de Filtro do "Obter itens" — o flow so devolve o que e novo,
    // nao a lista inteira. Nao importa quanto tempo se passou entre um ciclo e
    // outro (gap de sync-job fora do ar, por ex.): o proximo ciclo sempre pede
    // "tudo desde o ultimo que eu ja tenho", entao nada se perde (lista de
    // origem e append-only, sem expurgo).
    async fetchHistorySince(since) {
        if (!config_1.default.sharepoint?.trackingUrl) {
            throw new Error('POWER_AUTOMATE_TRACKING_URL ausente');
        }
        const items = await callFlow(config_1.default.sharepoint.trackingUrl, { desde: since.toISOString() });
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const vehicleId = String(item[HISTORY_FIELD.vehicleId] ?? '');
            const latitude = toNumber(item[HISTORY_FIELD.latitude]);
            const longitude = toNumber(item[HISTORY_FIELD.longitude]);
            const positionAt = toDate(item[HISTORY_FIELD.positionAt]);
            if (!Number.isInteger(id) || !vehicleId || latitude == null || longitude == null || !positionAt) {
                console.warn(`[sharepoint] item de historico ignorado (dado incompleto): id=${item.ID ?? item.Id}, vehicleId=${vehicleId}`);
                continue;
            }
            entries.push({
                id,
                vehicleId,
                latitude,
                longitude,
                positionAt,
                vehicleStatus: toStringOrNull(item[HISTORY_FIELD.vehicleStatus]),
                callId: toStringOrNull(item[HISTORY_FIELD.callId]),
                operationId: toStringOrNull(item[HISTORY_FIELD.operationId]),
                appVersion: toStringOrNull(item[HISTORY_FIELD.appVersion]),
                device: toStringOrNull(item[HISTORY_FIELD.device]),
            });
        }
        return entries;
    },
    // Mesmo padrao incremental de fetchHistorySince, so que o cursor e
    // "Created" (nao ha outro timestamp na lista) — ver MISSION_EVENT_FIELD.
    async fetchMissionEventsSince(since) {
        if (!config_1.default.sharepoint?.missionEventsUrl) {
            throw new Error('POWER_AUTOMATE_MISSION_EVENTS_URL ausente');
        }
        const items = await callFlow(config_1.default.sharepoint.missionEventsUrl, { desde: since.toISOString() });
        const entries = [];
        for (const item of items) {
            const id = Number(item.ID ?? item.Id);
            const statusMessage = toStringOrNull(item[MISSION_EVENT_FIELD.statusMessage]);
            const createdAt = toDate(item[MISSION_EVENT_FIELD.createdAt]);
            if (!Number.isInteger(id) || !statusMessage || !createdAt) {
                console.warn(`[sharepoint] evento de missao ignorado (dado incompleto): id=${item.ID ?? item.Id}`);
                continue;
            }
            entries.push({
                id,
                callId: toStringOrNull(item[MISSION_EVENT_FIELD.callId]),
                operationId: toStringOrNull(item[MISSION_EVENT_FIELD.operationId]),
                availabilityId: toStringOrNull(item[MISSION_EVENT_FIELD.availabilityId]),
                tripType: toStringOrNull(item[MISSION_EVENT_FIELD.tripType]),
                statusMessage,
                message: toStringOrNull(item[MISSION_EVENT_FIELD.message]),
                accessType: toStringOrNull(item[MISSION_EVENT_FIELD.accessType]),
                state: toStringOrNull(item[MISSION_EVENT_FIELD.state]),
                readStatusRequester: toNumber(item[MISSION_EVENT_FIELD.readStatusRequester]),
                readStatusControl: toNumber(item[MISSION_EVENT_FIELD.readStatusControl]),
                readStatusRescue: toNumber(item[MISSION_EVENT_FIELD.readStatusRescue]),
                createdAt,
                createdBy: toStringOrNull(item[MISSION_EVENT_FIELD.createdBy]),
            });
        }
        return entries;
    },
};
