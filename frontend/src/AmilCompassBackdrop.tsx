import smoothFadedCircle from './assets/smooth-faded-circle.png';

// Circulo com fade radial atras da bussola (pedido do usuario, 2026-09-04:
// "adicione um círculo com fade radial atrás da bússola"). NOVO componente
// (o usuario pediu "crie um novo" em vez de reaproveitar o AmilArcBackdrop
// existente, que hoje esta desalinhado) — IRMAO do AmilTimelineArc dentro
// de .amil-arc-dock (nao filho, mesmo motivo do AmilArcBackdrop: o
// viewport/mask do SVG da bussola cortaria o fade se estivesse dentro).
//
// CSS radial-gradient nao ficou bom o suficiente (pedido do usuario,
// 2026-09-04: "não está dando certo fazer isso com css") — trocado pela
// imagem PNG pronta smooth-faded-circle.png (resources/images/ do
// projeto), que ja vem com a queda suave/feathered de verdade (alpha
// gerado por software de imagem, nao aproximado por stops de gradiente).
export default function AmilCompassBackdrop() {
  return (
    <div
      className="amil-compass-backdrop"
      style={{ backgroundImage: `url(${smoothFadedCircle})` }}
      aria-hidden="true"
    />
  );
}
