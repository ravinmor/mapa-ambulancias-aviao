// Fonte do mapa de fundo (o "chao" atras dos marcadores) — centralizado aqui
// de proposito, num unico lugar, pra trocar de provedor ser 1 linha em vez de
// cacar `<TileLayer>` espalhado em Map.tsx e TrackingPage.tsx.
//
// Contexto (2026-08-26): o CARTO (basemaps.cartocdn.com, estilo "dark_all"
// que usavamos) passou a exigir chave de API — confirmado com requisicao
// direta, sem sessao nenhuma do navegador envolvida, retornando a mesma
// marca d'agua "API KEY REQUIRED" mesmo pra um pedido novo. Nao e limite de
// sessao/tempo aberto, e politica do servico. Trocado por padrao pro Esri
// (server.arcgisonline.com), que nao exige cadastro nem chave hoje.
//
// PRA VOLTAR PRO CARTO (se o Esri der problema, ou se o CARTO liberar de
// novo / uma chave for obtida): so mudar a linha abaixo pra 'carto'.
export const BASEMAP_PROVIDER: 'esri' | 'carto' = 'esri';

export interface BasemapLayer {
  // key estavel por layer — o Leaflet precisa de key React normal quando
  // mapeamos essa lista em <TileLayer>, ver Map.tsx/TrackingPage.tsx.
  id: string;
  url: string;
}

// CARTO manda base+rotulos numa unica imagem por tile. O Esri, nao — sao 2
// servicos separados (Base = so o "chao" cinza, Reference = so os rotulos,
// com fundo transparente) que se sobrepoem pra dar o mesmo resultado visual.
// Por isso cada provedor devolve uma LISTA de camadas, nao uma unica.
const BASEMAPS: Record<'esri' | 'carto', BasemapLayer[]> = {
  esri: [
    { id: 'esri-base', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}' },
    { id: 'esri-labels', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}' },
  ],
  carto: [
    { id: 'carto-dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
  ],
};

export const basemapLayers: BasemapLayer[] = BASEMAPS[BASEMAP_PROVIDER];

// CARTO ja vinha preto por natureza do proprio tileset, sem filtro. O Esri
// vem cinza medio — precisa de contrast()+brightness() pra chegar perto do
// mesmo preto (ver .map-tiles-darken em index.css pros numeros e a medicao
// que embasou eles). Classe extra so pro Esri: se BASEMAP_PROVIDER voltar
// pra 'carto', o filtro some sozinho junto — o revert de 1 linha continua
// valendo pros dois (tiles E filtro), sem precisar mexer em mais nada.
export const basemapTileClassName = BASEMAP_PROVIDER === 'esri' ? 'map-tiles map-tiles-darken' : 'map-tiles';
