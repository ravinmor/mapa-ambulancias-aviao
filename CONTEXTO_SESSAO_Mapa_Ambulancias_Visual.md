# Contexto de sessão — Mapa de Ambulâncias, trabalho visual/frontend

Sessão anterior ficou sem tokens no meio do trabalho de responsividade da
sidebar. Este arquivo existe pra próxima sessão continuar sem perder contexto.

## Onde fica o projeto

`D:\Claude\Command-SI\mapa-ambulancias-aviao\` — projeto completo (frontend,
api, sync-job, docker-compose). Ver `DECISOES_Infra_MapaAmbulancias.md` na
raiz do repo pra decisões de arquitetura mais antigas (schema, integração
SharePoint etc.) — este arquivo aqui é só sobre o trabalho visual recente.

## Como rodar (ambiente desta máquina)

- **Backend** (postgres/api/sync-job) roda via Docker Engine dentro da distro
  WSL2 "Ubuntu" — Docker Desktop nessa máquina quebra intermitentemente (ver
  memória `project_docker_desktop_ambiente_quebrado`). Comandos:
  ```bash
  wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/Claude/Command-SI/mapa-ambulancias-aviao && docker compose up -d"
  wsl -d Ubuntu -u root -- bash -c "cd /mnt/d/Claude/Command-SI/mapa-ambulancias-aviao && docker compose ps"
  ```
  Se o Docker Desktop tiver sido usado nesse meio tempo, `wsl -l -v` pra
  conferir se a distro Ubuntu ainda existe — pode ter sido removida numa
  reinstalação. Se sumiu, recriar: `wsl --install -d Ubuntu --no-launch` **direto
  no D:** via `wsl --import` (nunca deixar instalar no C: sem perguntar —
  usuário já ficou irritado com isso antes).

- **Frontend** roda em **modo dev** (não Docker) enquanto se itera visual —
  muito mais rápido (hot reload):
  ```bash
  cd D:\Claude\Command-SI\mapa-ambulancias-aviao\frontend
  npm run dev
  ```
  A porta muda a cada restart (5173, 5174, 5175...) porque processos antigos
  ficam ocupando as anteriores — **sempre checar o output real do comando**
  pra saber a porta atual, não assumir. `vite.config.ts` já tem proxy pro
  backend em `localhost:3001`.

- **Gotcha recorrente (Vite cache):** depois de renomear/adicionar export de
  um arquivo, o Vite às vezes mantém cache de dependência otimizada apontando
  pro nome antigo → erro `"X is not defined"` no console do browser mesmo com
  o código fonte certo. Fix: matar o processo do dev server, `rm -rf
  node_modules/.vite`, `npm run dev` de novo (gera porta nova).

- **Gotcha de teste (browser tool deste ambiente):** abas do browser tool
  ficam com `document.hidden === true` mesmo em foco, o que **pausa toda
  animação baseada em `requestAnimationFrame`** (CSS animation, Motion,
  `map.flyTo` do Leaflet). Pra verificar layout depois de uma animação,
  forçar o estado final manualmente via JS (`el.style.transform='none';
  el.style.opacity='1'`) antes de medir posições — não dá pra ver a animação
  rodando de verdade nesse ambiente. Gestos sintéticos (`dispatchEvent` de
  drag/hover) também não ativam corretamente porque faltam `isTrusted` —
  validar a **configuração** (props do Motion tipo `drag`, `dragListener`,
  classes CSS aplicadas, `touch-action` resultante) em vez de tentar simular
  o gesto inteiro. Depois de qualquer mudança: `npx tsc --noEmit` +checar
  log do dev server por erro + testar via browser tool com essas ressalvas.
  **Sempre pedir confirmação visual real ao usuário** quando a mudança for
  sobre "like/feel" de animação/gesto — a verificação automatizada só prova
  que a configuração está certa, não como fica na prática.

## Stack de estilo (já fechado, não mexer sem necessidade)

- **Tailwind v4**, paleta inteira em `frontend/src/theme.css` dentro de
  `@theme static { ... }` (o `static` é necessário — sem ele o Tailwind só
  gera CSS pras variáveis realmente referenciadas em algum lugar do código,
  e a ideia é ter a paleta toda disponível). Cores: `primary`, `secondary`,
  `accent`, `gray`, `success`, `warning`, `alert`, `categories` (com chaves
  nomeadas tipo `categories-rescue`, não numéricas).
- **Tipografia**: Nunito (`font-heading`, classes `text-h1`...`text-h6`) +
  Poppins (`font-body`, classes `text-body-{xl,lg,md,sm}-{peso}` — uma classe
  por combinação exata de tamanho+peso, não composição).
- **Nunca hardcodar cor ou fonte** — sempre `var(--color-...)` ou as classes
  Tailwind acima.
- **Motion** (`motion/react`, antigo Framer Motion) pra toda animação.

## Arquivos principais do frontend

- `src/Map.tsx` — mapa Leaflet, marcadores pulsando neon, controles de zoom
  reposicionados, `useBreakpoint()`, lógica de centralizar/zoom ao clicar
  numa van (`flyTo`, com ajuste especial no mobile via `project`/`unproject`
  pra não esconder atrás da bottom sheet).
- `src/VehicleSidebar.tsx` — **arquivo que está sendo trabalhado agora**, ver
  seção "Tarefa pedida, não implementada" abaixo.
- `src/MissionTimeline.tsx` — linha do tempo da missão (dado **mockado**,
  não existe "chamado"/missão real no schema ainda). Exporta
  `MissionTimelineContent` (reutilizável, prop `orientation: 'horizontal' |
  'vertical'`) e o wrapper flutuante default-export (só usado no desktop).
- `src/useBreakpoint.ts` — hook de breakpoint. **Limites não são os padrão**:
  mobile <768px, tablet 768-1219px, desktop ≥1220px (1220 foi achado
  empiricamente — abaixo disso a timeline flutuante batia no controle de
  zoom). Tem um `useEffect` que revalida no mount (não só em `resize`) —
  necessário porque a leitura inicial de `window.innerWidth` pode estar
  errada se o primeiro render acontecer antes da página compor totalmente.
- `src/index.css` — todo o CSS customizado (fora das classes utilitárias do
  Tailwind).

## Layout responsivo — como está fechado

- **Desktop** (≥1220px): sidebar entra pela esquerda (320px fixos, margem
  16px), linha do tempo **flutua** separada, centralizada no espaço que
  sobra à direita da sidebar (não na tela toda — `left: calc(16+320+16)px`
  no `.mission-timeline-wrap`).
- **Tablet** (768-1219px): sidebar igual ao desktop (mesma direção/tamanho),
  mas a linha do tempo **não flutua** — fica **embutida dentro da sidebar**,
  em abas (ver próxima seção).
- **Mobile** (<768px): sidebar vira **bottom sheet** — cobre toda a largura,
  colada nas 3 bordas (esquerda/direita/baixo, sem margem, sem borda —
  só sombra pra cima, mais forte que o padrão pra compensar a borda
  ausente), `max-height: 50vh`. Grip de 6 pontinhos no topo (não X) — arrastar
  pra baixo fecha (`dragListener={false}` + `useDragControls()`, drag só
  começa a partir do grip via `onPointerDown`, senão brigava com o scroll do
  conteúdo). Ao fechar (por arraste ou seleção de outra van), desseleciona a
  van e limpa o trajeto (`onClose` chama `setSelectedVehicleId(null)` +
  `setTrail(null)` no `Map.tsx`).

## Abas (tablet + mobile)

Sidebar tem 2 abas fixas embaixo: **"Informações"** (campos da van, `dl`) e
**"Trajeto"** (`MissionTimelineContent` orientação vertical). Só a área de
conteúdo rola (`flex: 1; overflow-y: auto`), as abas ficam sempre visíveis
embaixo (`flex-shrink: 0`). Estado `activeTab` fica no componente pai
(`VehicleSidebar`), não reseta ao trocar de van (é `useState` fora do
`key={vehicle.id}` do `motion.aside`).

## TAREFA PEDIDA, NÃO IMPLEMENTADA — começar por aqui

O usuário pediu (última mensagem da sessão anterior, exatamente como
formulado): a mesma barra/gesto de arrastar pra baixo (que hoje só fecha a
sidebar no mobile) também deve **redimensionar a altura da sidebar**:

1. Arrastar deve **expandir ou encolher** a altura da bottom sheet
   livremente (não só fechar) — o usuário quer poder ver mais ou menos da
   sidebar arrastando.
2. Existe um **limite mínimo de altura**. Se o usuário arrastar além desse
   limite (encolher demais), o **conteúdo fica visualmente "apagado"/disabled**
   (ex: opacity reduzida) — um indicador visual de "se soltar aqui, vai
   fechar".
3. Se soltar o dedo **nessa zona abaixo do limite**, a sidebar **fecha**
   (mesmo comportamento de hoje: `onClose()`, desseleciona a van, limpa
   trajeto).
4. Mas se o usuário, ainda arrastando (sem soltar), **voltar pra cima** (
   subir de novo pra acima do limite mínimo), o conteúdo **volta ao normal**
   (opacity normal) — ou seja, o estado "vai fechar" é reversível durante o
   próprio gesto, só se concretiza quando solta o dedo estando nessa zona.

**Como pensar a implementação:**
- Hoje `VehicleSidebar.tsx` usa `drag="y"` do Motion com `dragConstraints={{
  top: 0, bottom: 400 }}` e `onDragEnd` que só decide fechar ou não no final
  do gesto (por distância/velocidade). Precisa virar algo que reage **durante**
  o arraste, não só no fim — Motion tem `onDrag` (chamado continuamente
  durante o gesto, recebe `info.offset.y` em tempo real) e também
  `motionValue`/`useMotionValue` + `useTransform` pra derivar opacity a partir
  da posição de arraste de forma performática (sem re-render do React a cada
  pixel).
- A "altura da sidebar mudando ao arrastar" é conceitualmente diferente de
  "a sidebar inteira deslizando pra fora" (que é o que `drag="y"` +
  `transform: translateY` faz hoje) — redimensionar de verdade precisa mexer
  em `height`/`max-height` do elemento conforme arrasta, não só translação.
  Vale pensar se dá pra fazer só com `translateY` (a sidebar "sobe" mostrando
  mais conteúdo, mantendo `height` fixo mas maior que o `max-height` atual,
  e o que orient hoje era `max-height: 50vh` vira o range entre "fechado" e
  "altura máxima") ou se precisa mesmo animar `height`.
- Definir um valor razoável pro "limite mínimo" (ex: se arrastou mais de
  60-70% do caminho até fechar) e o range de opacity (ex: de 1.0 a ~0.4)
  interpolado suavemente nessa zona.
- **Perguntar ao usuário antes de implementar** qual altura máxima faz
  sentido (hoje é 50vh fixo — vai continuar sendo o teto, ou pode expandir
  mais que isso?) e o valor exato do "limite mínimo" antes de travar uma
  escolha, seguindo o padrão desta conversa (o usuário gosta de ser
  consultado em decisões de UX antes de eu implementar).

## Checklist geral do projeto (consolidado em 2026-08-20)

### Concluído

- [x] Adicionar Tailwind CSS ao projeto
- [x] Configurar a paleta de cores da aplicação como variáveis
- [x] Círculo da van com efeito de pulso neon
- [x] Nome da van só aparece ao passar o mouse (hover), estilizado —
      **so em tablet/desktop**, desativado no mobile (touch): o tooltip
      hover-only do Leaflet ficava travado/quebrado depois do toque, sem
      outro toque pra fechar (ver `Map.tsx`, `breakpoint !== 'mobile'`)
- [x] Adicionar biblioteca de animação/transição (Motion)
- [x] Aba lateral com as informações da ambulância selecionada
- [x] Sistema de fontes (Nunito/Poppins) registrado no Tailwind e aplicado
      nos textos
- [x] Remover a etiqueta "Leaflet | © OpenStreetMap contributors © CARTO"
- [x] Estilizar o "ao vivo" em tons de vermelho e pulsando
- [x] Controles de zoom reposicionados e estilizados
- [x] Centralizar e dar zoom de destaque ao clicar na ambulância
- [x] Clicar de novo no círculo já selecionado fecha a sidebar e some o
      trajeto
- [x] Linha do tempo centralizada na parte inferior (dado mockado por
      enquanto) — animação de baixo pra cima, preenchimento neon alinhado
      nos pontos, dot atual pulsando
- [x] Adaptar layout para tablets e celulares (responsivo) — sidebar vira
      bottom sheet no mobile, abas (Informações/Trajeto) em tablet/mobile,
      linha do tempo flutuante só no desktop
- [x] Bottom sheet (mobile) redimensionável arrastando o grip — altura muda
      livre entre um piso e um teto, com zona de "vai fechar" (conteúdo
      apaga) perto do fundo e fecha se soltar ali; área de toque do arraste
      cobre a barra inteira, não só os 6 pontinhos
- [x] Botão "Próxima ambulância" na sidebar (mobile/tablet/desktop) — cicla
      pelas vans e centraliza/dá zoom nela a cada troca; separado
      visualmente do badge de status (que não é clicável) e posicionado do
      lado oposto
- [x] Fundo do mapa em `gray-900` (antes ficava branco durante o `flyTo`
      pra uma van nova, enquanto os tiles recarregavam)
- [x] Largura da sidebar aumentada e migrada pra `vw`
      (`clamp(340px, 24vw, 440px)`)

### Falta — Visual/Frontend

- [ ] Confirmar ao vivo o "feel" do gesto de redimensionar a bottom sheet
      (não simulável de forma confiável no browser tool deste ambiente)
- [ ] Trajeto (Polyline) hoje corta por cima de prédios — precisa seguir
      ruas de verdade (snap to road)

### Falta — Integração/Backend

- [ ] Sistema que puxa o histórico do SharePoint e grava no Postgres
      (schema já pronto, `sync-job/src/sources/sharepoint.ts` tem esqueleto
      mas nomes de campo reais não confirmados)
- [ ] Verificação contínua do SharePoint pra posição em tempo real (fonte
      real atualiza a cada 30s)
- [ ] Mudar intervalo do SSE com o Postgres pra 30s

## Coisas pra não esquecer

- Usuário quer ser **perguntado antes de decisões de UX não óbvias** — não
  assumir valores/comportamentos sem confirmar quando há ambiguidade real.
- Sempre verificar com `npx tsc --noEmit` + checar log do dev server + testar
  no browser tool antes de reportar algo como pronto — mas ser honesto sobre
  as limitações de teste de animação/gesto deste ambiente (ver seção acima).
- Toda vez que uma tarefa visual é concluída, o usuário costuma pedir a
  "lista atualizada" — manter um checklist mental do que foi feito/falta
  (a última lista completa está espalhada pelo histórico da conversa
  anterior; não existe um arquivo único com ela — se for útil, vale criar um
  checklist persistente num arquivo pra não depender de reconstruir do zero).
