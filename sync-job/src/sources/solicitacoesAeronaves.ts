// Fluxo Power Automate PA-RESGATE-GerenciaSolicitacoes (app de resgate da
// Amil, "aplicativo nosso" — DIFERENTE dos flows MapaAmbulancias_* usados no
// resto do sync-job/sharepoint.ts, que sao do rastreio de vans). Mesmo
// padrao de gatilho HTTP com assinatura embutida (?sig=...) como segredo,
// mas protocolo de chamada diferente: POST com corpo
// {"subAction": "...", "payload": {...}} em vez de query params na URL — ver
// MANUAL_FILTROS.md / solicitacoes.py (2026-09-22), a ferramenta de
// diagnostico que documentou esse fluxo primeiro.
//
// 2 sub-acoes de leitura usadas aqui: "obterAeronaves" (d_Cadastro_Aeronaves)
// e "obter" (lista de solicitacoes, usada pela deteccao de agendamento v3 —
// ver aircraftScheduling.ts). O mesmo fluxo tambem expoe "obterUma" e acoes
// de ESCRITA (criar/editar/atribuir/devolverPendencia/removerAeronave/
// cancelarMissao) — nao usadas por este sync-job, que so le.

const FLOW_TIMEOUT_MS = 20000;

async function callSolicitacoesFlow(url: string, subAction: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subAction, payload }),
    signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Flow PA-RESGATE-GerenciaSolicitacoes (${subAction}) retornou ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

// Campos confirmados contra o JSON real do fluxo (2026-09-22, chamada de
// teste direta contra o ambiente de homologacao) — resto dos campos do
// SharePoint (Author/Editor/{Thumbnail}/etc.) ignorado de proposito, so
// metadado interno do conector, sem uso aqui.
export interface AeronaveCadastro {
  id: number;
  nome: string | null;
  tipo: string | null;
  // "RegistroeAeronave" no SharePoint — em homologacao vem com placeholder
  // numerico ("123456"), nao a matricula real ("PT-WLO") ainda.
  registro: string | null;
  status: string | null; // "Livre" | "Em uso" (unicos 2 valores confirmados)
  ativo: boolean | null;
  modified: Date | null;
  // Coluna NOVA no SharePoint (2026-09-24, pedido do usuario — ver
  // aircraftScheduling.ts) — ICAO24 da aeronave, preenchido so' quando ela
  // tem rastreio real (hoje so' a PT-WLO/e48019). Sem valor pra maioria das
  // aeronaves ainda — normal, aircraftScheduling.ts cai pra chave sintetica
  // nesse caso. NUNCA escrito por nos, so' lido — quem preenche e' o time
  // de negocio direto no SharePoint.
  icao24: string | null;
}

function toDate(value: unknown): Date | null {
  return typeof value === 'string' && value ? new Date(value) : null;
}

function mapAeronave(raw: Record<string, unknown>): AeronaveCadastro {
  return {
    id: Number(raw.ID),
    nome: typeof raw.NomeAeronave === 'string' ? raw.NomeAeronave : null,
    tipo: typeof raw.TipoAeronave === 'string' ? raw.TipoAeronave : null,
    registro: typeof raw.RegistroeAeronave === 'string' ? raw.RegistroeAeronave : null,
    status: typeof raw.Status === 'string' ? raw.Status : null,
    ativo: typeof raw.Ativo === 'boolean' ? raw.Ativo : null,
    modified: toDate(raw.Modified),
    icao24:
      typeof raw.ICAO24 === 'string' && raw.ICAO24.trim() !== '' ? raw.ICAO24.trim().toLowerCase() : null,
  };
}

export async function fetchAeronaves(url: string): Promise<AeronaveCadastro[]> {
  const body = await callSolicitacoesFlow(url, 'obterAeronaves');
  const items = Array.isArray(body) ? body : ((body as { value?: unknown[] })?.value ?? []);
  return (items as Record<string, unknown>[]).map(mapAeronave);
}

// Solicitacao de missao (sub-acao "obter", lista completa — o fluxo nao
// filtra nem ordena, ver MANUAL_FILTROS.md secao 1). So os campos usados
// pela deteccao de agendamento v3 (aircraftScheduling.ts): IDAeronave
// (vinculo com d_Cadastro_Aeronaves.ID, confirmado contra dado real em
// 2026-09-22 — solicitacao #33, IDAeronave="2") e Status da PROPRIA
// solicitacao ("Aguardando atribuicao"/"Aguardando aceite"/"Pendencia"/
// "Cancelada", ver MANUAL_FILTROS.md secao 4 — NAO e' "Livre"/"Em uso", isso
// e' da aeronave).
export interface Solicitacao {
  id: number;
  status: string | null;
  aeronaveId: number | null;
  pacienteNome: string | null;
  created: Date | null;
}

// Formato real do SharePoint pra esses 2 campos: "DD/MM/AAAA HH:mm" (visto
// ao vivo em obterUma, 2026-09-24) — NAO e ISO 8601, `new Date(string)` do
// JS nao entende esse formato (interpretaria errado ou daria Invalid Date).
function parseDataBr(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dia, mes, ano, hora, minuto] = match;
  // Sem fuso no dado de origem — tratado como horario local do servidor
  // (mesmo criterio informal ja usado pro resto do sync-job, que roda
  // sempre no Brasil).
  const date = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Detalhe de UMA solicitacao (sub-acao "obterUma") — traz campos que a
// listagem em lote ("obter") NAO devolve, entre eles `DataChegadaOrigem`
// ("Previsao de Inicio", confirmado 2026-09-24 lendo o template de e-mail
// do fluxo PA-Resgate-NotificaNovaMissaoAerea — e o horario previsto da
// missao, preenchido desde a CRIACAO da solicitacao, antes da aeronave ser
// atribuida) e `DataChegadaDestino` (mesmo campo, so que do destino — usado
// pro alerta "aproximando do destino", pedido do usuario 2026-09-25,
// confirmado na tela "Trajeto" do app de resgate: "DATA/HORA ORIGEM" e
// "DATA/HORA DESTINO" gravados juntos na criacao da missao). So chamar pra
// solicitacoes ja vinculadas a uma aeronave (aircraftScheduling.ts) — nao
// para as 46+ da listagem inteira.
export interface SolicitacaoDetalhe {
  id: number;
  dataChegadaOrigem: Date | null;
  dataChegadaDestino: Date | null;
}

function mapSolicitacaoDetalhe(raw: Record<string, unknown>): SolicitacaoDetalhe {
  return {
    id: Number(raw.ID),
    dataChegadaOrigem: parseDataBr(raw.DataChegadaOrigem),
    dataChegadaDestino: parseDataBr(raw.DataChegadaDestino),
  };
}

export async function fetchSolicitacaoDetalhe(url: string, id: number): Promise<SolicitacaoDetalhe | null> {
  const body = await callSolicitacoesFlow(url, 'obterUma', { ID: id });
  const items = Array.isArray(body) ? body : ((body as { value?: unknown[] })?.value ?? []);
  const first = (items as Record<string, unknown>[])[0];
  return first ? mapSolicitacaoDetalhe(first) : null;
}

function mapSolicitacao(raw: Record<string, unknown>): Solicitacao {
  const aeronaveIdRaw = raw.IDAeronave;
  const aeronaveId =
    typeof aeronaveIdRaw === 'number'
      ? aeronaveIdRaw
      : typeof aeronaveIdRaw === 'string' && aeronaveIdRaw.trim() !== ''
        ? Number(aeronaveIdRaw)
        : null;
  return {
    id: Number(raw.ID),
    status: typeof raw.Status === 'string' ? raw.Status : null,
    aeronaveId: aeronaveId != null && Number.isFinite(aeronaveId) ? aeronaveId : null,
    pacienteNome: typeof raw.NomePaciente === 'string' ? raw.NomePaciente : null,
    created: toDate(raw.Created),
  };
}

export async function fetchSolicitacoes(url: string): Promise<Solicitacao[]> {
  const body = await callSolicitacoesFlow(url, 'obter');
  const items = Array.isArray(body) ? body : ((body as { value?: unknown[] })?.value ?? []);
  return (items as Record<string, unknown>[]).map(mapSolicitacao);
}
