// Icones das abas da sidebar — desenhados a mao, sem biblioteca de icone
// (mesmo padrao do FilterIcon em VehicleFilters.tsx). currentColor herda a
// cor do botao (.sidebar-tab), entao o estado ativo/inativo funciona sozinho
// via CSS, sem prop de cor.

export function InfoTabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.6" r="1" fill="currentColor" />
      <path d="M10 9.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Rota/trajeto: dois pontos (origem/destino) ligados por uma curva unica e
// solida — mais limpo que a versao anterior, que tinha pino+pino+tracejado
// competindo em 20px (feedback do usuario, 2026-08-24).
export function RouteTabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 15.5Q10 2 15.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.5" cy="15.5" r="2" fill="currentColor" />
      <circle cx="15.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Copiar link (dois quadrados sobrepostos) — botao "Compartilhar rota" da
// sidebar de veiculo. Mesmo padrao dos icones acima: desenhado a mao,
// currentColor, sem biblioteca.
export function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="7.5" y="2.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 7.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 18.5h8a1.5 1.5 0 0 0 1.5-1.5v-.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function PatientTabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
