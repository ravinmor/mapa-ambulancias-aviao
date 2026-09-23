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
