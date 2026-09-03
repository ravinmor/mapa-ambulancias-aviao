// Autenticacao OAuth2 (client credentials) do OpenSky Network — OPCIONAL.
// Sem OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET no ambiente, cai no acesso
// anonimo de sempre (400 creditos/dia). Com as duas preenchidas (conta
// registrada em opensky-network.org + client criado no dashboard da conta),
// o OpenSky libera 4.000 creditos/dia — 10x — sem mudar nada no resto do
// pipeline, so os headers de cada chamada (pedido do usuario, 2026-09-03).
//
// Usuario/senha (Basic Auth) foi APOSENTADO pelo OpenSky em marco/2026 — so
// resta o fluxo OAuth2 client-credentials mesmo.
//
// Compartilhado entre sources/opensky.ts (pipeline generico) e
// sources/trackedAircraftSource.ts (aeronaves especificas) DE PROPOSITO, ao
// contrario do resto da logica de busca (que e deliberadamente duplicada
// entre os dois, ver comentario no topo de trackedAircraftSource.ts) — o
// token e o cache dele sao a MESMA coisa nos dois casos, duplicar aqui so
// geraria 2 caches (e 2x as chamadas de renovacao) sem necessidade.

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const TOKEN_TIMEOUT_MS = 10000;
// Renova um pouco ANTES do token vencer de verdade — sem essa margem, uma
// chamada podia comecar com um token que expira nos milissegundos seguintes.
const REFRESH_MARGIN_MS = 30_000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export function hasOpenSkyCredentials(): boolean {
  return Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
}

async function requestToken(): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.OPENSKY_CLIENT_ID as string,
    client_secret: process.env.OPENSKY_CLIENT_SECRET as string,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenSky OAuth2 retornou ${response.status} ao pedir token: ${await response.text()}`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };
  return { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - REFRESH_MARGIN_MS };
}

// Devolve os headers de auth pra uma chamada ao OpenSky — {} (acesso
// anonimo) se as credenciais nao estiverem configuradas, ou
// {Authorization: "Bearer ..."} com o token valido (buscando um novo so
// quando o cache expirou).
export async function getOpenSkyAuthHeaders(): Promise<Record<string, string>> {
  if (!hasOpenSkyCredentials()) return {};

  if (!cachedToken || cachedToken.expiresAt <= Date.now()) {
    cachedToken = await requestToken();
  }
  return { Authorization: `Bearer ${cachedToken.value}` };
}
