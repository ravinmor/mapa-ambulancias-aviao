import { useEffect, useState } from 'react';

// So 2 niveis — 'tablet' existiu como terceiro valor, mas nunca foi
// distinguido de 'desktop' em nenhum lugar do codigo (toda checagem no
// projeto e "!== 'mobile'", nunca "=== 'desktop'" isolado); removido em
// 2026-08-24 por ser valor morto. Mobile = bottom sheet, sem barra
// flutuante, "Trajeto" vira aba. Desktop = painel lateral + barra
// flutuante da linha do tempo.
export type Breakpoint = 'mobile' | 'desktop';

function getBreakpoint(): Breakpoint {
  // documentElement.clientWidth, nao window.innerWidth: os dois costumam
  // bater, mas innerWidth inclui a largura da scrollbar vertical (desvio
  // pequeno em desktop) e, medido em 2026-08-24, veio com valor incorreto
  // (quase o dobro do real) num painel de automacao em modo mobile — sinal
  // de escala por device-pixel-ratio que clientWidth nao sofre. clientWidth
  // e a leitura mais robusta pra breakpoint de layout.
  const width = document.documentElement.clientWidth;
  // 1272 (nao os 768 "padrao" de mobile) — abaixo disso a barra flutuante da
  // linha do tempo fica apertada demais entre a sidebar e o controle de
  // zoom e sobrepoe os botoes +/-. O limite antigo (768 mobile / 1220
  // tablet-desktop) deixava a faixa 768-1219 ("tablet") tentando mostrar a
  // barra flutuante sem espaco suficiente — o mesmo problema que 1220 ja
  // tinha sido criado pra evitar, so que na faixa inteira, nao so na borda.
  // Ajustado pelo usuario, 2026-08-24, apos ver a sobreposicao ao vivo.
  return width < 1272 ? 'mobile' : 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    // Reconfirma no mount (nao so em resize) — a largura lida no useState
    // inicial pode nao refletir o layout final se o primeiro render
    // acontecer antes da pagina estar totalmente pronta/composta.
    setBreakpoint(getBreakpoint());

    function onResize() {
      setBreakpoint(getBreakpoint());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return breakpoint;
}
