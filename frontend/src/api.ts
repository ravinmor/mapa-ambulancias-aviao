// Extraido do Map.tsx sem mudanca de comportamento — a pagina de
// rastreamento (TrackingPage) precisa da mesma logica de URL da API e nao
// faria sentido duplicar a leitura de VITE_API_BASE_URL em dois lugares.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
