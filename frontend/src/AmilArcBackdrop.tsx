// Camada de fundo do arco da linha do tempo — COMPONENTE SEPARADO de
// proposito (pedido do usuario, 2026-09-02): a bounding box do
// AmilTimelineArc (.amil-arc-viewport, com overflow:hidden + mask-image
// pro fade lateral do proprio arco) estava cortando/quebrando o fade deste
// circulo tambem, ja que os dois viviam dentro do mesmo SVG. Sendo um
// componente a parte — renderizado como IRMAO do arco (nao filho, nao
// dentro do mesmo SVG/viewport) dentro de .amil-arc-dock, ver AmilJetPage.tsx
// — ele nunca sofre esse recorte. O unico fade que ele tem e o do seu
// proprio radial-gradient (ver .amil-arc-backdrop-standalone em index.css),
// e ele pode passar livremente pra fora da area do arco sem ser cortado.
export default function AmilArcBackdrop() {
  return <div className="amil-arc-backdrop-standalone" aria-hidden="true" />;
}
