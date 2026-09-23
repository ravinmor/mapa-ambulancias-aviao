"use strict";
// Fluxo Power Automate PA-RESGATE-GerenciaSolicitacoes (app de resgate da
// Amil, "aplicativo nosso" — DIFERENTE dos flows MapaAmbulancias_* usados no
// resto do sync-job/sharepoint.ts, que sao do rastreio de vans). Mesmo
// padrao de gatilho HTTP com assinatura embutida (?sig=...) como segredo,
// mas protocolo de chamada diferente: POST com corpo
// {"subAction": "...", "payload": {...}} em vez de query params na URL — ver
// MANUAL_FILTROS.md / solicitacoes.py (2026-09-22), a ferramenta de
// diagnostico que documentou esse fluxo primeiro.
//
// So a sub-acao "obterAeronaves" e usada aqui (leitura pura, lista
// d_Cadastro_Aeronaves). O mesmo fluxo tambem expoe "obter"/"obterUma" (lista
// de solicitacoes) e acoes de ESCRITA (criar/editar/atribuir/
// devolverPendencia/removerAeronave/cancelarMissao) — nao usadas por este
// sync-job, que so le.
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAeronaves = fetchAeronaves;
const FLOW_TIMEOUT_MS = 20000;
async function callSolicitacoesFlow(url, subAction, payload = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subAction, payload }),
        signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`Flow PA-RESGATE-GerenciaSolicitacoes (${subAction}) retornou ${response.status}: ${await response.text()}`);
    }
    return response.json();
}
function toDate(value) {
    return typeof value === 'string' && value ? new Date(value) : null;
}
function mapAeronave(raw) {
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
async function fetchAeronaves(url) {
    const body = await callSolicitacoesFlow(url, 'obterAeronaves');
    const items = Array.isArray(body) ? body : (body?.value ?? []);
    return items.map(mapAeronave);
}
