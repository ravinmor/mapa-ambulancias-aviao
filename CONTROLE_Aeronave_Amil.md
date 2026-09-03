# Controle — Aeronave Monitorada (Amil)

Checklist de controle pra tudo relacionado ao rastreio da aeronave específica
da Amil: o rastreador em si (`/aviacao-executiva` neste projeto) e a
apresentação dele no Command Center (LED wall, `command-center-cloudflare`).

**Como usar este arquivo:** cada task tem um ID (ex: `R-07`, `P-A2`). Ao
concluir uma, marcar `[x]` e mover pra baixo do "Concluído" da seção
correspondente, sem apagar o ID. Não remover tasks bloqueadas — deixar
marcadas como bloqueadas até a decisão chegar.

Última atualização: 2026-09-03.

---

## Seção 1 — Rastreador (`/aviacao-executiva`)

### Concluído
- [x] `R-01` Pipeline paralelo por ICAO24 fixo (`sync-job/src/trackedAircraft.ts`), independente do genérico do OpenSky
- [x] `R-02` Pipeline genérico (SP/RJ, vagas) mantido no código, só desligado
- [x] `R-03` Endpoint `GET /api/tracked-aircraft`
- [x] `R-04` Rota `/aviacao-executiva` com mapa de design próprio
- [x] `R-05` Marcador da aeronave (ícone, rotação pelo `trueTrack`)
- [x] `R-06` Cálculo de fase do voo (7 estágios fixos: Solo → Decolagem → Subida → Cruzeiro → Descida → Aproximação → Pouso)
- [x] `R-07` Arco de linha do tempo estilo SpaceX (fade nas bordas, estágio atual centralizado, sem contador T+/-)
- [x] `R-08` Build validado rodando com dado real (avião de teste em cruzeiro)
- [x] `R-09` Badge "ao vivo" — trocado pelo mesmo estilo/componente já usado no mapa das ambulâncias (`.status-badge` + `.live-dot`), com o texto simplificado pra só "ao vivo"
- [x] `R-10` Arco da linha do tempo — curvatura corrigida (era parábola achatando perto do vértice; virou círculo de verdade, mesmo centro+raio sempre, curvatura visível não importa qual estágio está ativo)
- [x] `R-11` Avião não estava se movendo — causa real: página não usava `useDeadReckoning` (o mapa genérico já tinha isso). Generalizei o hook e apliquei — confirmado ao vivo, marcador se move sozinho entre buscas reais, sem chamada nova
- [x] `R-23` Suporte a múltiplas aeronaves — `TrackedAircraftConfig.icao24List` (lista, não mais 1 ICAO24 fixo), `sync-job` roda 1 ciclo por aeronave com intervalo adaptativo próprio (parada: 15min / voando: 5min) e busca por caixa pequena ao redor da última posição conhecida (1 crédito, com resgate global se não achar). Testado com 4 aeronaves de placeholder simultâneas
- [x] `R-12` Trajeto (rastro) da aeronave no mapa — schema/migration `TrackedAircraftPositionHistory` espelhado (sync-job + api), `GET /api/tracked-aircraft/:id/history` (mesmo padrão de corte por gap do genérico, janela maior: 48h/45min), `AircraftTrail.tsx` reaproveitado com o mesmo gradiente de cor por altitude, ponto final sempre a posição ao vivo (dead reckoning) pra não atrasar em relação ao marcador. Ícone e pulsar do marcador também passaram a usar a mesma cor por altitude (antes só o rastro)

- [x] `R-14` Mira no mapa: linha horizontal + vertical cruzando na posição em tela da aeronave selecionada (acompanha dead reckoning + pan/zoom via `latLngToContainerPoint`), com latitude/longitude pequenininhas do lado de cada linha (`AircraftCrosshair` em `AmilJetPage.tsx`). Só aparece com uma aeronave selecionada

### Falta — ajustes já pedidos
- [ ] `R-13` **[parcial]** No arco: traço removido (pedido do usuário, 2026-09-02: "só remova o traço"); falta a 2a parte, colocar o ícone do avião logo abaixo do estágio atual

### Falta — enriquecimento de dados (pedido 2026-09-02)
- [x] `R-15` Sistema de monitoramento de squawk — `squawk` buscado no OpenSky (`trackedAircraftSource.ts`), coluna nova (migration + schema espelhado sync-job/api), exposto na API e no tipo do frontend. Alerta visual nos 3 códigos de emergência: marcador vira vermelho (`--color-alert-400`) com pulso rápido (0,6s) que vence até o estado offline — visível no mapa sem precisar selecionar — e banner vermelho na topbar com código + significado quando a selecionada está em emergência
- [x] `T-02` (parcial, só squawk) Mecanismo de injeção de teste — `sync-job/scripts/set-squawk.mjs`, escreve direto no Postgres via Prisma (usuário escolheu "script/CLI separado" em resposta à `Q-6`, 2026-09-02). `isAboutToDepart` (a outra metade do T-02) ainda não existe — depende da Seção 2 (Command Center)
- [ ] `R-16` Fonte da posição (ADS-B / MLAT / etc.) com tooltip explicando o que significa ao passar o mouse
- [ ] `R-17` Metadado da aeronave (fabricante/modelo/operador) via endpoint público de metadados do OpenSky (`/api/metadata/aircraft/icao/{icao24}`) — **gratuito, confirmado**
- [ ] `R-18` Origem/destino do voo — **não vem do ADS-B**; precisa de fonte externa ou cadastro manual (ver pergunta aberta `Q-1`)
- [ ] `R-19` Cidade/região sobrevoada — geocodificação reversa do lat/lon (ex: Nominatim/OSM, gratuito com limite de uso — confirmar se o limite serve pro nosso volume de chamadas)
- [ ] `R-20` Clima na rota/destino (METAR/TAF do aeroporto mais próximo) — depende de `R-18` existir primeiro (precisa saber o destino pra buscar o clima de lá)
- [ ] `R-21` **[plano definido, 2026-09-03 — NÃO aplicado ainda]** Horário de início/fim do voo atual (ou do último voo, enquanto parado) — 2 colunas novas em `TrackedAircraft` (`flightStartedAt`/`flightEndedAt`, migration espelhada sync-job/api), preenchidas em `checkOne()` (sync-job/src/trackedAircraft.ts) detectando a transição de estágio: `SOLO→qualquer outro` grava `flightStartedAt=agora` e limpa `flightEndedAt`; `→POUSO` (vindo de fora do POUSO) grava `flightEndedAt=agora`. Sem histórico nem scan — só compara `previousStage` vs `stage` a cada ciclo real, do jeito que `deriveStage()` já faz. Tempo de voo decorrido = calculado no frontend a partir de `flightStartedAt` (substitui a ideia original de "achar no histórico")
- [ ] `R-22` Mini-gráfico de altitude ao longo do tempo (depende de `R-12`, o histórico de posição/altitude)
- [ ] `R-24` **[plano definido, 2026-09-03 — NÃO aplicado ainda]** Bússola (HSI simplificado) — pedido do usuário, referência: painel de replay de voo estilo ADSBExchange/Cesium. Anel de graus (N/S/L/O) gira conforme o `trueTrack`, ícone do avião fixo no centro apontando pra cima (decisão confirmada: "o anel gira", não o ícone). Só mostra pra aeronave selecionada (mesma lógica de R-14)
- [ ] `R-25` **[plano definido, 2026-09-03 — NÃO aplicado ainda]** Altímetro em fita vertical rolante (decisão confirmada, mesma referência de R-24) — escala de altitude deslizando, valor atual sempre centralizado, tendência subindo/descendo visível. Só pra aeronave selecionada
- [ ] `R-26` Linha de design geral da página seguindo referência "Aerovista" (fornecida pelo usuário, 2026-09-03): tema azul-marinho escuro, cards com cantos arredondados grandes, tags de status coloridas pequenas, gráfico de linha fino sem grade pesada — aplicar de forma consistente conforme os itens acima (R-21/R-24/R-25) forem implementados, não como task isolada

---

## Seção 2 — Apresentação no Command Center (LED)

Contexto: o mapa já aparece hoje na Face 3 do painel de LED, embutido via
iframe (`LedFaceThreeContent.tsx`, `command-center-cloudflare`), como 2
mapas lado a lado (São Paulo / Panorâmico). Esta seção adiciona um aviso de
decolagem iminente + uma visão em tela cheia da aeronave + uma faixa de
status no estilo ticker de bolsa de valores, no topo de todo o painel.

### Fase A — Sinal de "prestes a voar" (backend, mapa-ambulancias-aviao)
- [ ] `P-A1` **[BLOQUEADO — ver `Q-2`]** Definir a heurística/critério de "prestes a voar" — ADS-B sozinho só indica decolagem iminente com segundos de antecedência (velocidade de solo subindo além de taxi); previsão com mais antecedência precisa de outra fonte (plano de voo cadastrado manualmente, por exemplo)
- [ ] `P-A2` Novo campo/endpoint expondo esse estado (ex: `isAboutToDepart` em `GET /api/tracked-aircraft`, ou endpoint próprio)
- [ ] `P-A3` Persistir se o alerta já foi disparado pra essa decolagem (evitar repetir o aviso a cada poll enquanto a condição continuar verdadeira)

### Fase B — Command Center recebe o sinal
- [ ] `P-B1` Rota de proxy no `worker/index.ts` pra consumir a API do mapa-ambulancias-aviao sem problema de CORS/mixed content
- [ ] `P-B2` Polling no componente pai das faces (não dentro do iframe da Face 3) pra checar esse status periodicamente

### Fase C — Aviso centralizado na Face 3
- [ ] `P-C1` Componente de aviso centralizado na Face 3 — **[aguardando `Q-3`]** animação a ser elaborada pelo usuário depois; por ora, placeholder simples
- [ ] `P-C2` Timer de 1 minuto de exibição
- [ ] `P-C3` Clique no aviso → abre a Fase D (mapa em tela cheia)
- [ ] `P-C4` Sem clique em 60s → aviso some e dispara a Fase E (faixa) automaticamente, com o texto "uma aeronave está decolando"
- [ ] `P-C5` Squawk de emergência (`R-15`: 7500/7600/7700) → abre a tela de mapa em tela cheia (Fase D) **sozinha**, sem esperar clique — pula direto a etapa do aviso centralizado/timer de 1min

### Fase D — Mapa em tela cheia na Face 3
- [ ] `P-D1` **[aguardando `Q-4`]** Transição "sci-fi" a ser elaborada pelo usuário depois; por ora, placeholder simples (ex: fade/slide)
- [ ] `P-D2` Mapa cobrindo toda a área da Face 3 (respeitando o tamanho da face, não a tela do LED inteira), substituindo os 2 mapas + resto do conteúdo da face
- [ ] `P-D3` Botão/gesto pra voltar à tela padrão de 2 mapas, disponível a qualquer momento (sem limite de tempo)
- [ ] `P-D4` Nesse modo, a faixa (Fase E) fica coberta **só na área da Face 3** — continua visível nas outras faces do painel
- [ ] `P-D5` Ao voltar pra tela padrão da Face 3, a faixa reaparece ali também

### Fase E — Faixa vermelha (ticker) no topo do painel inteiro
- [ ] `P-E1` Componente de ticker em nível de **painel inteiro** (acima/fora das faces individuais) — não é um elemento só da Face 3
- [ ] `P-E2` Estilo ticker de bolsa de valores: rolagem contínua horizontal, fundo vermelho, fonte pixelada
- [ ] `P-E3` Conteúdo inicial: aviso de decolagem; depois, atualiza pra status contínuo do voo até o pouso/fim
- [ ] `P-E4` Gatilho de aparição: ao clicar no aviso (`P-C3`) **ou** automaticamente após 1 min sem clique (`P-C4`) — os dois caminhos levam à faixa aparecendo
- [ ] `P-E5` Regra de sobreposição com `P-D4`/`P-D5` já cobre a interação com o mapa em tela cheia

---

## Seção 3 — Mecanismo de testes

Ferramentas pra validar o pipeline inteiro (rastreador + apresentação no LED)
sem depender de esperar uma decolagem de verdade ou uma emergência de
verdade acontecer.

- [ ] `T-01` **[aguardando `Q-5`]** Ferramenta pra localizar uma aeronave real prestes a decolar — consultar o OpenSky filtrando por área de aeroporto + `on_ground=true` + velocidade de solo subindo, listar candidatas, e permitir apontar `TRACKED_AIRCRAFT_ICAO24` pra uma delas. Serve pra validar end-to-end: `P-A1`/`P-A2` (sinal de "prestes a voar"), o aviso na Face 3, a faixa no LED, e a progressão real dos estágios (`R-06`) do início ao fim de um voo de verdade
- [ ] `T-02` **[aguardando `Q-6`]** Mecanismo de injeção de estado de teste — forçar um squawk específico (7500/7600/7700) ou o sinal `isAboutToDepart` sem que isso esteja acontecendo de verdade, pra validar os alertas visuais (`R-15` e a Fase C/E da Seção 2) sob demanda, sem esperar acontecer

---

## Perguntas em aberto (bloqueiam alguma task acima)

- **`Q-1`** (bloqueia `R-18`, `R-20`): origem/destino do voo vem de onde? Cadastro manual (como as missões das ambulâncias, via SharePoint/admin) ou uma API paga de plano de voo?
- **`Q-2`** (bloqueia `P-A1`): o que define "prestes a voar" de fato — telemetria (aceleração no solo) só avisa com segundos de antecedência; se o aviso precisa aparecer com mais folga, alguém vai precisar registrar manualmente um horário previsto de decolagem em algum lugar?
- **`Q-3`** (bloqueia o visual de `P-C1`): animação do aviso central — usuário vai elaborar depois
- **`Q-4`** (bloqueia o visual de `P-D1`): animação "sci-fi" da transição pro mapa em tela cheia — usuário vai elaborar depois
- **`Q-5`** (bloqueia `T-01`): a busca por aeronave prestes a decolar deve ficar restrita a algum aeroporto/base específico da Amil, ou vale qualquer aeroporto (facilita achar candidata, mas voo genérico não tem nada a ver com a Amil)?
- **`Q-6`** — **[respondida, 2026-09-02]**: script/CLI separado (`sync-job/scripts/set-squawk.mjs`). Ainda bloqueia a metade do `T-02` referente a `isAboutToDepart` (esse mecanismo cobriu só squawk).
