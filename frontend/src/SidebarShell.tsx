import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Breakpoint } from './useBreakpoint';

// Casca da sidebar: animacao de entrada por breakpoint, bottom sheet
// arrastavel no mobile, botao de fechar e a barra de abas. Extraida do
// VehicleSidebar sem mudanca de comportamento — o conteudo (que e especifico
// de van ou de aeronave) entra por props.

type SheetTab = {
  id: string;
  // "label" continua existindo pra acessibilidade (aria-label/title) mesmo
  // com o botao mostrando so o icone — texto visivel virou icone (pedido do
  // usuario, 2026-08-24), mas leitor de tela e tooltip ainda precisam do
  // nome.
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

// Redimensionamento da bottom sheet (mobile): arrastar a barra de cima pra
// cima/baixo muda a altura livremente, dentro de [FLOOR_H, MAX_H_VH*vh].
// Abaixo de CLOSE_THRESHOLD (65% do caminho entre a altura default e o piso)
// o conteudo vai ficando "apagado" (opacity) como aviso de que soltar ali
// fecha a sidebar — soltar acima disso so deixa a altura onde estava.
const MOBILE_MAX_HEIGHT_VH = 0.85;
const MOBILE_DEFAULT_HEIGHT_VH = 0.5;
const MOBILE_FLOOR_HEIGHT_PX = 80;
const CLOSE_ZONE_FRACTION = 0.65;
const MIN_CONTENT_OPACITY = 0.35;

function useMobileSheetRange(isMobile: boolean) {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    if (!isMobile) return;
    function onResize() {
      setViewportHeight(window.innerHeight);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobile]);

  const maxHeightPx = viewportHeight * MOBILE_MAX_HEIGHT_VH;
  const defaultHeightPx = viewportHeight * MOBILE_DEFAULT_HEIGHT_VH;
  const closeThresholdPx =
    defaultHeightPx - CLOSE_ZONE_FRACTION * (defaultHeightPx - MOBILE_FLOOR_HEIGHT_PX);

  return { maxHeightPx, defaultHeightPx, closeThresholdPx };
}

const CARD_STYLE: CSSProperties = {
  zIndex: 1200,
  background: 'var(--color-secondary-600)',
  color: 'var(--color-primary-100)',
  borderRadius: 16,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
  boxShadow: '0 4px 16px color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
};

// Desktop/tablet: entra pela esquerda, largura fixa. Mobile: vira bottom
// sheet colada nas 3 bordas (sem respiro lateral/embaixo — cobre a largura
// toda, gruda no fundo da tela), limitada a ~50% da altura — o mapa continua
// visivel acima dela (ver o ajuste de centralizacao em useMapSelection, que
// empurra o item selecionado pra metade de cima nesse caso). So arredonda os
// cantos de cima, ja que os de baixo ficam colados na borda da tela.
function sidebarStyle(breakpoint: Breakpoint): CSSProperties {
  if (breakpoint === 'mobile') {
    return {
      ...CARD_STYLE,
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: '16px 16px 0 0',
      border: 'none',
      // offset negativo (nao 4px positivo) — os outros 3 lados estao colados
      // na borda da tela, entao so a sombra de cima e visivel mesmo; maior
      // e mais forte que o padrao pra compensar a borda que foi removida.
      boxShadow: '0 -6px 24px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
    };
  }
  return {
    ...CARD_STYLE,
    position: 'absolute',
    top: 16,
    left: 16,
    bottom: 16,
    // vw (nao px fixo) pra acompanhar telas maiores — clamp segura um piso
    // parecido com o tamanho antigo (320px) e um teto pra nao ficar exagerada
    // em monitores muito largos.
    width: 'clamp(340px, 24vw, 460px)',
  };
}

function sidebarMotion(breakpoint: Breakpoint) {
  if (breakpoint === 'mobile') {
    return { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } };
  }
  return { initial: { x: '-100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } };
}

function CloseButton({ onClose, style }: { onClose: () => void; style: CSSProperties }) {
  return (
    <button
      onClick={onClose}
      aria-label="Fechar"
      className="sidebar-close-btn"
      style={{
        background: 'transparent',
        color: 'var(--color-primary-100)',
        borderRadius: 6,
        width: 28,
        height: 28,
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        ...style,
      }}
    >
      ✕
    </button>
  );
}

export default function SidebarShell({
  entityKey,
  breakpoint,
  onClose,
  header,
  body,
  tabs,
  fixed = false,
  forceMinHeight = false,
}: {
  // null = fechada. Trocar de item volta pra primeira aba, mas NAO reseta
  // mais a altura da sheet — ver nota em cima do efeito que usa isso la
  // embaixo (pedido do usuario, 2026-08-27: altura escolhida pelo usuario
  // deve persistir entre vans, so muda quando ele mesmo arrasta de novo).
  entityKey: number | null;
  breakpoint: Breakpoint;
  onClose: () => void;
  header: ReactNode;
  // Usado quando nao ha abas (desktop, ou consumidor que nao passa tabs).
  body: ReactNode;
  tabs?: SheetTab[];
  // Modo cinema: no instante em que vira true (nao enquanto fica true),
  // encolhe a sheet pro menor tamanho uma vez. Depois disso o usuario pode
  // arrastar normalmente — nao trava o gesto, so define o ponto de partida.
  forceMinHeight?: boolean;
  // Pagina de rastreamento (link compartilhavel): sidebar precisa ficar
  // aberta o tempo inteiro, sem jeito de fechar — nem botao no desktop, nem
  // arrastar pra baixo no mobile (pedido explicito do usuario, 2026-08-25;
  // antes so o botao de fechar do desktop era bloqueado, o mobile ainda
  // fechava por drag). No mapa operacional fixed fica false (default), entao
  // nada muda la: botao de fechar no desktop e drag-to-close no mobile
  // continuam identicos a antes.
  fixed?: boolean;
}) {
  const motionProps = sidebarMotion(breakpoint);
  // Desktop passou a usar abas tambem (pedido do usuario, 2026-08-24: 2 abas
  // em desktop/tablet, 3 no mobile) — a exclusao antiga de breakpoint===
  // 'desktop' foi removida. Quem nao passa "tabs" (aeronave) continua caindo
  // no layout simples (body direto) em qualquer tela.
  const showTabs = tabs != null && tabs.length > 0;
  const isMobile = breakpoint === 'mobile';
  const dragControls = useDragControls();
  const [activeTabId, setActiveTabId] = useState<string>(tabs?.[0]?.id ?? '');

  const { maxHeightPx, defaultHeightPx, closeThresholdPx } = useMobileSheetRange(isMobile);
  // sheetHeightPx e o que renderiza de fato; userHeightPx e o ultimo tamanho
  // que o USUARIO escolheu arrastando (nao muda com forceMinHeight) — e pra
  // onde volta quando o modo cinema desliga.
  const [sheetHeightPx, setSheetHeightPx] = useState(defaultHeightPx);
  const userHeightPxRef = useRef(defaultHeightPx);
  const dragStartHeightRef = useRef(defaultHeightPx);

  // A altura default depende do viewport — resincroniza se o valor calculado
  // mudar e o usuario ainda nao tiver arrastado.
  useEffect(() => {
    userHeightPxRef.current = defaultHeightPx;
    setSheetHeightPx(defaultHeightPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHeightPx]);

  // Modo cinema: so encolhe pro menor tamanho no INSTANTE em que liga (nao
  // trava — usuario pode arrastar livremente depois disso, e esse tamanho
  // novo persiste entre as trocas automaticas de van, igual ja acontece
  // fora do modo cinema). Corrigido 2026-08-27: a primeira versao travava o
  // arraste o tempo todo, que nao era o pedido.
  const prevForceMinHeightRef = useRef(forceMinHeight);
  useEffect(() => {
    if (forceMinHeight && !prevForceMinHeightRef.current) {
      setSheetHeightPx(MOBILE_FLOOR_HEIGHT_PX);
      userHeightPxRef.current = MOBILE_FLOOR_HEIGHT_PX;
    }
    prevForceMinHeightRef.current = forceMinHeight;
  }, [forceMinHeight]);

  // Trocar de item nao remonta mais o painel (ver a key estavel la embaixo);
  // volta pra primeira aba, mas a altura da sheet fica como estava — o
  // usuario reclamou que resetar a cada van trocada (inclusive no modo
  // cinema, a cada 8s) atrapalhava (2026-08-27). So a aba precisa do reset
  // manual aqui.
  useEffect(() => {
    setActiveTabId(tabs?.[0]?.id ?? '');
    // So entityKey: reagir a "tabs" refaria isso a cada render, ja que o
    // array e recriado pelo componente pai toda vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  // Flick rapido pra baixo (velocidade alta) fecha mesmo sem cruzar a zona de
  // fechar por altura.
  function handleDragStart() {
    dragStartHeightRef.current = sheetHeightPx;
  }

  function handleDrag(_: unknown, info: { offset: { y: number } }) {
    const nextHeight = dragStartHeightRef.current - info.offset.y;
    const clamped = Math.min(maxHeightPx, Math.max(MOBILE_FLOOR_HEIGHT_PX, nextHeight));
    setSheetHeightPx(clamped);
    // Guarda como a altura "intencional" do usuario — e o que persiste
    // entre troca de van, inclusive durante o modo cinema.
    userHeightPxRef.current = clamped;
  }

  function handleDragEnd(_: unknown, info: { velocity: { y: number } }) {
    const wouldClose = sheetHeightPx <= closeThresholdPx || info.velocity.y > 800;
    // Sidebar fixa: nunca fecha. Fica onde o usuario soltou (ja clampado no
    // piso por handleDrag) — pedido explicito do usuario (2026-08-25): a
    // primeira versao disso voltava pra altura padrao sozinha, e ele
    // corrigiu que o certo e so ficar curta mesmo, sem "pular" de volta.
    if (wouldClose && !fixed) {
      onClose();
    }
  }

  // dragListener={false} + dragControls: o arraste so comeca a partir do
  // grip (onPointerDown la embaixo), nao da folha inteira — senao ele brigava
  // com o scroll do conteudo (overflow-y: auto), impedindo rolar pra ver o
  // resto dos campos.
  function startDrag(event: ReactPointerEvent) {
    dragControls.start(event);
  }

  // Quanto mais perto do "vai fechar", mais apagado o conteudo fica — some
  // totalmente so quando efetivamente solta abaixo do limite (handleDragEnd).
  const contentOpacity = isMobile
    ? sheetHeightPx >= closeThresholdPx
      ? 1
      : MIN_CONTENT_OPACITY +
        ((sheetHeightPx - MOBILE_FLOOR_HEIGHT_PX) / (closeThresholdPx - MOBILE_FLOOR_HEIGHT_PX)) *
          (1 - MIN_CONTENT_OPACITY)
    : 1;

  const activeTab = tabs?.find((t) => t.id === activeTabId) ?? tabs?.[0];

  return (
    <AnimatePresence>
      {entityKey != null && (
        <motion.aside
          // Key ESTAVEL, nao entityKey. Com a key mudando a cada troca de
          // item, o AnimatePresence tratava a troca como "sai um, entra
          // outro" e mantinha os dois no DOM sobrepostos na mesma posicao —
          // o painel antigo aparecia por cima e a interface parecia travada
          // no item anterior (bug reportado pelo usuario em 2026-08-22).
          // Com key fixa, a animacao cobre so abrir/fechar e a troca de item
          // e uma atualizacao de conteudo, instantanea — que tambem e melhor
          // de usar: clicar em outro aviao nao refaz a animacao de entrada.
          //
          // MAS a key precisa mudar quando o MODO de layout muda (mobile
          // <-> desktop/tablet), nao so quando a entidade muda. Motivo:
          // mobile anima por eixo Y (bottom sheet, sobe de baixo) e desktop/
          // tablet por eixo X (painel lateral, entra da esquerda). Se a
          // sidebar ja estiver aberta e o breakpoint mudar AO VIVO (resize
          // real do navegador, nao um reload), o Motion nao remonta — so
          // atualiza o "animate" alvo — e tenta interpolar de um eixo pro
          // outro em cima do mesmo componente, deixando a transformacao
          // numa posicao inconsistente (medido: left:-324px, fora da tela —
          // bug reportado pelo usuario em 2026-08-24, com print mostrando a
          // sidebar quebrada exatamente nessa transicao). "sheet"/"panel" e
          // estavel por MODO: trocar de van/aviao dentro do mesmo modo nao
          // remonta (mantem a correcao de 22/08); mudar de modo remonta
          // limpo, reaplicando o "initial" certo pro novo eixo.
          key={breakpoint === 'mobile' ? 'sheet' : 'panel'}
          // "sidebar-scroll" estiliza a barra de rolagem (ver index.css) —
          // se aplica aqui pro caso sem abas (aeronave, overflowY na propria
          // aside) e de novo no painel de conteudo da aba abaixo.
          className="sidebar-scroll"
          initial={motionProps.initial}
          animate={motionProps.animate}
          exit={motionProps.exit}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            ...sidebarStyle(breakpoint),
            ...(isMobile ? { height: sheetHeightPx } : null),
            display: showTabs ? 'flex' : 'block',
            flexDirection: 'column',
            overflow: showTabs ? 'hidden' : undefined,
            padding: showTabs ? 0 : '20px',
            overflowY: showTabs ? undefined : 'auto',
          }}
          drag={isMobile ? 'y' : false}
          dragListener={false}
          dragControls={dragControls}
          // Constrangido a (0,0): o gesto nao translada a folha (isso quem faz
          // e a mudanca de `height` acima, via handleDrag) — dragConstraints
          // zerado so existe pra habilitar o gesto e nos dar offset.y em
          // tempo real sem nenhum deslocamento visual duplicado.
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0}
          onDragStart={isMobile ? handleDragStart : undefined}
          onDrag={isMobile ? handleDrag : undefined}
          onDragEnd={isMobile ? handleDragEnd : undefined}
        >
          {isMobile ? (
            <div
              className="sidebar-drag-bar"
              aria-hidden="true"
              onPointerDown={startDrag}
              style={{ touchAction: 'none' }}
            >
              <div className="sidebar-drag-handle">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            !showTabs && <CloseButton onClose={onClose} style={{ position: 'absolute', top: 14, right: 14 }} />
          )}

          {showTabs ? (
            <>
              <div style={{ padding: '16px 20px 0', flexShrink: 0, position: 'relative' }}>
                {!isMobile && !fixed && (
                  <CloseButton onClose={onClose} style={{ position: 'absolute', top: 0, right: 20 }} />
                )}
                {header}
              </div>

              <div
                className="sidebar-scroll"
                style={{ padding: '0 20px 16px', overflowY: 'auto', flex: 1, opacity: contentOpacity }}
              >
                {activeTab?.content}
              </div>

              <div className="sidebar-tabs">
                {tabs?.map((tab) => (
                  <button
                    key={tab.id}
                    className={`sidebar-tab${activeTab?.id === tab.id ? ' is-active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                    aria-label={tab.label}
                    aria-selected={activeTab?.id === tab.id}
                    title={tab.label}
                  >
                    {tab.icon}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {header}
              {body}
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
