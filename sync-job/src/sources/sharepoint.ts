import config from '../config';
import { DataSource, FleetEntry, HistoryEntry, MissionEntry, MissionEventEntry, RegulationEntry } from '../types';

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
} as const;

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
} as const;

// f_Rastreamento_Ambulancia — usada por fetchHistoryForVehicle (trackingUrl).
// Ping frequente de posicao, sem "Acao" (nao registra transicao de etapa,
// so snapshot de posicao/status).
// Ver uso em fetchHistoryBackfillForOperation e em
// getVehicleHistoryWatermark (index.ts) — exportado pra ficar num so lugar.
export const BACKFILL_ID_OFFSET = 1_000_000_000;

const HISTORY_FIELD = {
  vehicleId: 'ID_Veiculo',
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
} as const;

// f_Historico_Localizacao_da_Operacao — usada por fetchHistoryBackfillForOperation
// (historyBackfillUrl). LISTA DIFERENTE de f_Rastreamento_Ambulancia (apesar
// do nome parecido e do comentario antigo neste arquivo dizer "mesma lista"
// — verificado errado, corrigido 2026-09-14 comparando o JSON real dos dois
// flows: um devolve "Lists/f_Rastreamento_Ambulancia/..." em "{Path}", o
// outro "Lists/f_Historico_localizacao_da_operacao/...").
//
// Colisao de nome interno confirmada no dado real: a coluna EXIBIDA como
// "ID_Veiculo" devolve seu valor sob a chave JSON "Latitude" (renomeada
// depois de criada, nome interno antigo ficou), e a coluna de latitude DE
// VERDADE foi parar em "Latitude0" (sufixo que o SharePoint gera sozinho
// quando o nome interno "Latitude" ja estava ocupado). Confirmado
// comparando: o campo "Latitude" vem CONSTANTE (mesmo veiculo a missao
// inteira, ex: sempre 13.0), enquanto "Latitude0" varia a cada linha
// (posicao real mudando). Essa lista tambem nao tem "Status_Veiculo" —
// vehicleStatus fica sempre null vindo daqui (tudo bem, e opcional).
const HISTORY_BACKFILL_FIELD = {
  vehicleId: 'Latitude',
  latitude: 'Latitude0',
  longitude: 'Longitude',
  positionAt: 'Data_Status', // "Data_Localizacao" nao existe nesta lista
  callId: 'ID_Chamado',
  operationId: 'ID_Operacao',
  appVersion: 'VersaoApp',
  device: 'Dispositivo',
  // Transicao daquele ping especifico (ex: "Deslocamento para Origem",
  // "Chegada na Origem", "Concluir Missao") — confirmado com o usuario,
  // 2026-09-14, direto na lista (nome de coluna nao renomeado). Usada pra
  // derivar os horarios de etapa que a Mission nao guarda, ver comentario em
  // position_history.prisma. So existe nesta lista, nao em
  // f_Rastreamento_Ambulancia.
  action: 'Acao',
} as const;

// f_Operacao_Controle_Dados_do_Chamado — a missao/chamado.
//
// CONFIRMADOS contra o JSON real do flow (2026-08-24, chamada direta ao
// endpoint). Nao inferir estes nomes pela tela: as colunas foram renomeadas
// depois de criadas, entao o nome exibido nao tem relacao com o interno —
// 14 de 19 palpites feitos pela tela estavam errados. Ex: "Dt atribuicao" e
// "Data_da_atribuicao_ao_chamado"; "ID Equipe" e "ID_Equipe_atribuida".
//
// Campos de escolha (Status_*, Amb_*, Tipo_de_viagem, Motivo_cancelamento)
// vem como objeto { Value } — ver toChoiceValue().
const MISSION_FIELD = {
  callId: 'ID_Chamado', // casa com PositionHistory.operationId, nao com callId — ver mission.prisma
  vehicleId: 'ID_Veiculo',
  teamId: 'ID_Equipe_atribuida',
  state: 'CLIENTEESTADO',
  tripType: 'Tipo_de_viagem',
  operationStatus: 'Status_Operacao',
  currentStatusText: 'Status_atual_da_operacao',
  shortStatusText: 'Status_resumido_operacao',
  acceptanceStatus: 'Amb_Confirmacao_de_ciencia_do_ch',
  departedToOriginStatus: 'Inicio_do_deslocamento_para_orig',
  arrivedAtOriginStatus: 'Amb_Ops_Chegada_na_Origem',
  departedToDestStatus: 'Amb_Ops_Saida_da_Origem_para_Des',
  arrivedAtDestStatus: 'Amb_Ops_Chegada_no_Destino',
  finishedStatus: 'Amb_Ops_Finalizacao_do_chamado',
  assignedAt: 'Data_da_atribuicao_ao_chamado',
  acknowledgedAt: 'Data_e_Hora_da_ciencia',
  lastActionAt: 'Dt_ult_acao_operacao',
  cancelledAt: 'Dt_Cancelamento_operacao',
  cancellationReason: 'Motivo_cancelamento',
  // Nome interno IGUAL ao exibido (nao renomeado, confirmado 2026-09-16) —
  // ver comentario grande em mission.prisma. Vem como texto plano, nao
  // objeto de escolha, ao contrario dos outros campos "Status_*"/"Amb_*".
  qta: 'QTA',
  etaOrigin: 'previsao_origem',
  etaDestination: 'previsao_destino',
} as const;

// f_Regulação_chamados — endereco/local + paciente. Nomes CONFIRMADOS contra
// o JSON real do flow (2026-08-24). 4 campos que aparecem na tela ("Motivo_
// do_Chamado", "Descricao_Tipo_de_Paciente_Outros", "Dados_Acompanhante",
// "Medico_no_Destino") nao vieram na resposta real — suspeita de "Limitar
// Colunas por Exibicao" no Obter itens, a confirmar com o usuario. Ate la
// ficam mapeados pra uma chave que nunca existe no JSON, entao toStringOrNull
// devolve null (comportamento seguro, nao quebra nada) — trocar assim que o
// flow passar a devolver esses campos.
const REGULATION_FIELD = {
  originName: 'Nome_do_Local_Origem',
  destinationName: 'Nome_do_Local_Destino',
  originAddress: 'Endereco_Origem',
  destinationAddress: 'Endereco_Destino',
  originSector: 'Setor_da_Origem',
  destinationSector: 'Setor_da_Destino', // NAO "Setor_do_Destino" como a tela sugere
  patientName: 'Nome_Paciente',
  patientAge: 'Idade',
  patientSex: 'Sexo',
  birthDate: 'Data_Nascimento',
  weightKg: 'Peso',
  heightCm: 'Altura',
  diagnosis: 'HD',
  callReason: 'Motivo_do_Chamado', // AUSENTE da resposta real — ver nota acima
  patientType: 'Tipo_de_Paciente',
  patientTypeOther: 'Descricao_Tipo_de_Paciente_Outros', // AUSENTE
  companion: 'Dados_Acompanhante', // AUSENTE
  isIntubated: 'Intubado',
  isObese: 'Obeso_x003f_', // "Obeso?" — o "?" vira "_x003f_" no nome interno
  triageCompleted: 'TriagemRealizada',
  healthPlan: 'Plano_Paciente',
  procedure: 'Procedimento',
  equipment: 'Equipamento',
  deviceUsage: 'Utilizacao_de_dispositivo',
  originDoctor: 'MediconoOrigem', // sem underscore nenhum, diferente do padrao usual
  destinationDoctor: 'Medico_no_Destino', // AUSENTE — nao existe nem variante "MediconoDestino"
  notes: 'Observacao',
} as const;

interface ListItemFields {
  [key: string]: unknown;
  ID?: number | string;
  Id?: number | string;
}

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

async function callFlow(url: string, params?: Record<string, string>): Promise<ListItemFields[]> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params ?? {})) {
    target.searchParams.set(key, value);
  }

  // DEBUG TEMPORARIO — comparar com a URL que funcionou no curl manual.
  // Remover depois de diagnosticar o erro "int() invalido" no flow de historico.
  if (params) {
    console.log('[sharepoint] URL final enviada ao flow:', target.toString());
  }

  const response = await fetch(target.toString(), { method: 'POST', signal: AbortSignal.timeout(FLOW_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Flow do Power Automate retornou ${response.status} em ${target.pathname}: ${await response.text()}`);
  }

  const body = (await response.json()) as ListItemFields[] | { value: ListItemFields[] };
  // A acao "Resposta" foi instruida a devolver body(...)?['value'] direto
  // (ja um array, confirmado no teste real) — o fallback pra { value: [...] }
  // cobre o caso de alguem reconfigurar o flow pra devolver o corpo inteiro
  // do "Obter itens".
  return Array.isArray(body) ? body : body.value;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

// Campos de "escolha"/lookup do SharePoint vem, via conector do Power
// Automate, como objeto { Id, Value } — nao string direta. Aceita tambem
// string pura (fallback caso o conector devolva achatado em algum campo).
function toChoiceValue(value: unknown): string | null {
  if (value && typeof value === 'object' && 'Value' in value) {
    return toStringOrNull((value as { Value: unknown }).Value);
  }
  return toStringOrNull(value);
}

// Campos "Yes/No" do SharePoint chegam via conector como boolean nativo na
// maioria dos casos, mas alguns fluxos ja devolveram string "true"/"false" —
// aceita os dois formatos em vez de assumir um so.
function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

// Usado por fetchHistoryForVehicle e fetchHistoryBackfillForOperation — cada
// um passa o mapa de campos da SUA lista (HISTORY_FIELD ou
// HISTORY_BACKFILL_FIELD, ver comentario acima de cada um — sao listas
// diferentes, nao dá pra compartilhar um so mapa).
function mapHistoryItems(
  items: ListItemFields[],
  field: typeof HISTORY_FIELD | typeof HISTORY_BACKFILL_FIELD,
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const item of items) {
    const id = Number(item.ID ?? item.Id);
    const vehicleId = String(item[field.vehicleId] ?? '');
    const latitude = toNumber(item[field.latitude]);
    const longitude = toNumber(item[field.longitude]);
    const positionAt = toDate(item[field.positionAt]);

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
      vehicleStatus: 'vehicleStatus' in field ? toStringOrNull(item[field.vehicleStatus]) : null,
      callId: toStringOrNull(item[field.callId]),
      operationId: toStringOrNull(item[field.operationId]),
      appVersion: toStringOrNull(item[field.appVersion]),
      device: toStringOrNull(item[field.device]),
      action: 'action' in field ? toStringOrNull(item[field.action]) : null,
    });
  }
  return entries;
}

export const sharepointSource: DataSource = {
  async fetchFleet(): Promise<FleetEntry[]> {
    if (!config.sharepoint) {
      throw new Error('Configuracao do SharePoint ausente');
    }
    const items = await callFlow(config.sharepoint.fleetUrl);

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

  // Uma chamada POR VEICULO: manda ?veiculo=<ID>&desdeId=<N>, e o flow monta
  // a Consulta de Filtro com "ID_Veiculo eq <id> and ID gt <N>", ordenando
  // por ID DECRESCENTE com Top 500.
  //
  // A ordenacao decrescente cobre os dois casos com uma configuracao so:
  // - Van ja sincronizada: "ID gt <ultimo>" casa com poucos itens novos
  //   (~1 ping a cada 30s), entao vem tudo.
  // - Van que nunca sincronizamos (desdeId = 0): casa com o historico
  //   inteiro dela, e o Top 500 devolve os 500 MAIS NOVOS — ou seja, as
  //   ultimas ~4 horas de trajeto, que e justamente a missao em curso.
  //   Com ordem crescente viriam os 500 mais ANTIGOS (de anos atras), inutil.
  //
  // Ver types.ts pro motivo de o filtro ser por ID e nao por data.
  async fetchHistoryForVehicle(vehicleId: string, sinceItemId: number): Promise<HistoryEntry[]> {
    if (!config.sharepoint?.trackingUrl) {
      throw new Error('POWER_AUTOMATE_TRACKING_URL ausente');
    }
    const items = await callFlow(config.sharepoint.trackingUrl, {
      veiculo: vehicleId,
      desdeId: String(sinceItemId),
    });
    return mapHistoryItems(items, HISTORY_FIELD);
  },

  // Lista SEPARADA de fetchHistoryForVehicle (ver comentario grande em
  // HISTORY_BACKFILL_FIELD acima — nao e "mesma lista" como se pensava
  // antes) — filtrada por OPERACAO (ID_Operacao), nao por veiculo+desdeId
  // (decisao do usuario, 2026-09-14): devolve so as poucas linhas daquela
  // missao especifica. So existe pra alimentar runHistoryBackfillCycle.
  async fetchHistoryBackfillForOperation(operationId: string): Promise<HistoryEntry[]> {
    if (!config.sharepoint?.historyBackfillUrl) {
      throw new Error('POWER_AUTOMATE_HISTORY_BACKFILL_URL ausente');
    }
    const items = await callFlow(config.sharepoint.historyBackfillUrl, {
      operacao: operationId,
    });
    // Offset grande no "id" (PK de position_history): sem isso, um item
    // desta lista pode colidir com o ID de um item de f_Rastreamento_
    // Ambulancia (contador independente, outra lista) — o upsert por "id"
    // entao atualiza silenciosamente uma linha de RASTREAMENTO nao
    // relacionada (vehicleId/operationId diferentes) com o "action" deste
    // backfill, em vez de criar a linha certa. Bug real, confirmado
    // 2026-09-15: horarios de etapas ainda nao alcancadas apareciam
    // preenchidos, com hora batendo com um ping de rastreio de outro
    // momento/veiculo, nao com o "Data_Status" real do SharePoint.
    // BACKFILL_ID_OFFSET (bem acima de qualquer ID real do SharePoint nas
    // duas listas) — index.ts's getVehicleHistoryWatermark PRECISA excluir
    // IDs acima desse valor, senao o cursor incremental do rastreamento
    // normal pula pra mais de 1 bilhao e para de achar linha nova pra
    // sempre (bug real ja visto: "desdeId=1000329991" nos logs).
    return mapHistoryItems(items, HISTORY_BACKFILL_FIELD).map((entry) => ({
      ...entry,
      id: entry.id + BACKFILL_ID_OFFSET,
    }));
  },

  // Sem filtro nenhum: o flow devolve os N chamados mais recentes (ordem
  // "ID desc", Top N configurado la) e aqui todos viram upsert. Ver o
  // comentario de fetchRecentMissions em types.ts pro motivo de nao haver
  // cursor incremental.
  async fetchRecentMissions(): Promise<MissionEntry[]> {
    if (!config.sharepoint?.missionsUrl) {
      throw new Error('POWER_AUTOMATE_MISSIONS_URL ausente');
    }
    const items = await callFlow(config.sharepoint.missionsUrl);

    const entries: MissionEntry[] = [];
    for (const item of items) {
      const id = Number(item.ID ?? item.Id);
      const callId = toStringOrNull(item[MISSION_FIELD.callId]);

      // Sem "ID Chamado" nao ha como ligar a missao ao trajeto — a linha nao
      // serve pra nada aqui.
      if (!Number.isInteger(id) || !callId) {
        console.warn(`[sharepoint] missao ignorada (sem ID/ID_Chamado): id=${item.ID ?? item.Id}`);
        continue;
      }

      entries.push({
        id,
        callId,
        vehicleId: toNumber(item[MISSION_FIELD.vehicleId]),
        teamId: toNumber(item[MISSION_FIELD.teamId]),
        state: toStringOrNull(item[MISSION_FIELD.state]),
        tripType: toChoiceValue(item[MISSION_FIELD.tripType]),
        operationStatus: toChoiceValue(item[MISSION_FIELD.operationStatus]),
        currentStatusText: toStringOrNull(item[MISSION_FIELD.currentStatusText]),
        shortStatusText: toStringOrNull(item[MISSION_FIELD.shortStatusText]),
        acceptanceStatus: toChoiceValue(item[MISSION_FIELD.acceptanceStatus]),
        departedToOriginStatus: toChoiceValue(item[MISSION_FIELD.departedToOriginStatus]),
        arrivedAtOriginStatus: toChoiceValue(item[MISSION_FIELD.arrivedAtOriginStatus]),
        departedToDestStatus: toChoiceValue(item[MISSION_FIELD.departedToDestStatus]),
        arrivedAtDestStatus: toChoiceValue(item[MISSION_FIELD.arrivedAtDestStatus]),
        finishedStatus: toChoiceValue(item[MISSION_FIELD.finishedStatus]),
        assignedAt: toDate(item[MISSION_FIELD.assignedAt]),
        acknowledgedAt: toDate(item[MISSION_FIELD.acknowledgedAt]),
        lastActionAt: toDate(item[MISSION_FIELD.lastActionAt]),
        cancelledAt: toDate(item[MISSION_FIELD.cancelledAt]),
        cancellationReason: toChoiceValue(item[MISSION_FIELD.cancellationReason]),
        qta: toStringOrNull(item[MISSION_FIELD.qta]),
        etaOrigin: toDate(item[MISSION_FIELD.etaOrigin]),
        etaDestination: toDate(item[MISSION_FIELD.etaDestination]),
      });
    }
    return entries;
  },

  // Mesmo padrao de fetchRecentMissions: sem filtro, so os N mais recentes
  // por "ID desc" configurado no flow — ver comentario em types.ts.
  async fetchRecentRegulations(): Promise<RegulationEntry[]> {
    if (!config.sharepoint?.regulationsUrl) {
      throw new Error('POWER_AUTOMATE_REGULATIONS_URL ausente');
    }
    const items = await callFlow(config.sharepoint.regulationsUrl);

    const entries: RegulationEntry[] = [];
    for (const item of items) {
      const id = Number(item.ID ?? item.Id);
      if (!Number.isInteger(id)) {
        console.warn(`[sharepoint] regulacao ignorada (sem ID): id=${item.ID ?? item.Id}`);
        continue;
      }

      entries.push({
        id,
        originName: toStringOrNull(item[REGULATION_FIELD.originName]),
        destinationName: toStringOrNull(item[REGULATION_FIELD.destinationName]),
        originAddress: toStringOrNull(item[REGULATION_FIELD.originAddress]),
        destinationAddress: toStringOrNull(item[REGULATION_FIELD.destinationAddress]),
        originSector: toStringOrNull(item[REGULATION_FIELD.originSector]),
        destinationSector: toStringOrNull(item[REGULATION_FIELD.destinationSector]),
        patientName: toStringOrNull(item[REGULATION_FIELD.patientName]),
        patientAge: toStringOrNull(item[REGULATION_FIELD.patientAge]),
        patientSex: toChoiceValue(item[REGULATION_FIELD.patientSex]),
        birthDate: toStringOrNull(item[REGULATION_FIELD.birthDate]),
        weightKg: toNumber(item[REGULATION_FIELD.weightKg]),
        heightCm: toStringOrNull(item[REGULATION_FIELD.heightCm]),
        diagnosis: toStringOrNull(item[REGULATION_FIELD.diagnosis]),
        callReason: toStringOrNull(item[REGULATION_FIELD.callReason]),
        patientType: toChoiceValue(item[REGULATION_FIELD.patientType]),
        patientTypeOther: toStringOrNull(item[REGULATION_FIELD.patientTypeOther]),
        companion: toStringOrNull(item[REGULATION_FIELD.companion]),
        isIntubated: toBool(item[REGULATION_FIELD.isIntubated]),
        isObese: toBool(item[REGULATION_FIELD.isObese]),
        triageCompleted: toBool(item[REGULATION_FIELD.triageCompleted]),
        healthPlan: toChoiceValue(item[REGULATION_FIELD.healthPlan]),
        procedure: toChoiceValue(item[REGULATION_FIELD.procedure]),
        equipment: toChoiceValue(item[REGULATION_FIELD.equipment]),
        deviceUsage: toChoiceValue(item[REGULATION_FIELD.deviceUsage]),
        originDoctor: toStringOrNull(item[REGULATION_FIELD.originDoctor]),
        destinationDoctor: toStringOrNull(item[REGULATION_FIELD.destinationDoctor]),
        notes: toStringOrNull(item[REGULATION_FIELD.notes]),
      });
    }
    return entries;
  },

  // Mesmo padrao incremental de fetchHistorySince, so que o cursor e
  // "Created" (nao ha outro timestamp na lista) — ver MISSION_EVENT_FIELD.
  async fetchMissionEventsSince(since: Date): Promise<MissionEventEntry[]> {
    if (!config.sharepoint?.missionEventsUrl) {
      throw new Error('POWER_AUTOMATE_MISSION_EVENTS_URL ausente');
    }
    const items = await callFlow(config.sharepoint.missionEventsUrl, { desde: since.toISOString() });

    const entries: MissionEventEntry[] = [];
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
