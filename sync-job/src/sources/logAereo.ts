// Fluxo Power Automate MapaAmbulancias_ObterLogAereo (lista f_Log_Aereo,
// site AmilResgateProd) — DIFERENTE do PA-RESGATE-GerenciaSolicitacoes
// (solicitacoesAeronaves.ts). Registra os botoes que o PILOTO vai clicando
// em tempo real durante o voo: "Aceitar missao", "Saida da Base aerea",
// "Chegada na origem", "Saida da origem", "Chegada no destino final",
// "Concluida" (2026-09-25, confirmado contra export real da lista — 282
// linhas no momento do teste, incluindo uma missao real percorrendo a
// sequencia inteira, ID_Solicitacao 55). Fluxo de proposito UNICO (mesmo
// padrao dos MapaAmbulancias_Obter* ja existentes) — sem subAction, so
// devolve a lista inteira, sem filtro nem ordenacao (MANUAL_FILTROS.md:
// "o fluxo nao filtra nem ordena", quem faz isso e' o sync-job).
//
// Vinculo com a missao: ID_Solicitacao (mesmo ID de Solicitacao.id em
// solicitacoesAeronaves.ts) — MESMO padrao de vinculo por ID usado no resto
// do dominio, sem FK de verdade entre os 2 fluxos/listas.

const FETCH_TIMEOUT_MS = 20000;

export interface LogAereoEntry {
  id: number;
  idSolicitacao: number | null;
  status: string | null;
  dataHora: Date | null;
}

function toDate(value: unknown): Date | null {
  return typeof value === 'string' && value ? new Date(value) : null;
}

function mapLogAereo(raw: Record<string, unknown>): LogAereoEntry {
  const idSolicitacaoRaw = raw.ID_Solicitacao;
  const idSolicitacao =
    typeof idSolicitacaoRaw === 'number'
      ? idSolicitacaoRaw
      : typeof idSolicitacaoRaw === 'string' && idSolicitacaoRaw.trim() !== ''
        ? Number(idSolicitacaoRaw)
        : null;
  return {
    id: Number(raw.ID),
    idSolicitacao: idSolicitacao != null && Number.isFinite(idSolicitacao) ? idSolicitacao : null,
    status: typeof raw.Status === 'string' ? raw.Status : null,
    dataHora: toDate(raw.DataHora),
  };
}

export async function fetchLogAereo(url: string): Promise<LogAereoEntry[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Flow MapaAmbulancias_ObterLogAereo retornou ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const items = Array.isArray(body) ? body : ((body as { value?: unknown[] })?.value ?? []);
  return (items as Record<string, unknown>[]).map(mapLogAereo);
}
