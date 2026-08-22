import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function getBreakpoint(): Breakpoint {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  // 1220 (nao os 1024 "padrao") — abaixo disso a barra flutuante da linha do
  // tempo (space livre entre a sidebar e o controle de zoom) fica
  // apertada demais e sobrepoe o zoom. Achado testando, nao e um breakpoint
  // de convencao generica.
  if (width < 1220) return 'tablet';
  return 'desktop';
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
