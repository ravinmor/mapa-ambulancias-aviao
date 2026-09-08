# Decisões técnicas — Rastreamento de aeronaves (`/aviacao-executiva`)

Registro das escolhas de design tomadas no pipeline de aeronaves monitoradas
(`sync-job/src/trackedAircraft.ts`, `frontend/src/useDeadReckoning.ts` e
arquivos relacionados), com o motivo e o trade-off aceito em cada uma —
não é um changelog, é o "por quê" por trás do código, pra não precisar
redescobrir o raciocínio toda vez que uma dessas escolhas parecer estranha
à primeira vista.

Cada entrada seguinte o formato: **Decisão** → **Contexto** → **Trade-off aceito**.

---

## 1. Estágio "Aproximação" por proximidade, não por altitude

**Decisão:** o estágio `APROXIMACAO` (que dispara o recheck rápido e a
inferência de pouso por silêncio) é definido pela distância até as
coordenadas do destino (`destinationLatitude/Longitude`, resolvidas via
adsbdb), não mais pela altitude da aeronave.

**Contexto:** a versão original usava `altitude <= 600m`. Isso não
distinguia "baixo mas longe do destino" (sobrevoo de outra região a baixa
altitude) de "baixo e realmente perto de pousar", e não dava pra escalonar
o recheck por distância real — só por um único limiar de altitude.

**Trade-off aceito:** a nova lógica depende inteiramente de o adsbdb ter
resolvido a rota (origem/destino) daquele voo. Isso quebra silenciosamente
para:
- Voos não catalogados no adsbdb (cobertura parcial, comum pra aeronaves
  menores ou rotas incomuns).
- **Voos multi-trecho / codeshare**, onde o adsbdb só retorna o destino
  FINAL filed, não a parada intermediária real. Exemplo real visto em
  produção: `ACA90` estava a 830m de altitude, claramente pousando em
  Guarulhos (GRU) — mas seu destino resolvido pelo adsbdb era `SAEZ`
  (Ezeiza, Buenos Aires, ~1650km dali), provavelmente um voo com escala
  técnica em GRU sob o mesmo número de voo. Resultado: nunca entrou em
  `APROXIMACAO`, nunca ganhou o recheck rápido, e a inferência de pouso por
  silêncio nunca disparou — ficou preso em `DESCIDA`/offline indefinidamente.

  A versão antiga (baseada em altitude) não tinha esse ponto cego — pouso é
  pouso, independente de qual destino o adsbdb acha que é. Aceito
  conscientemente em troca de poder escalonar o recheck por distância real
  (ver decisão 2) — não implementado um fallback híbrido (voltar pra
  altitude quando destino é desconhecido) ainda; ver "Possíveis melhorias
  futuras" no fim deste documento.

---

## 1.1. Correção: rota resolvida ANTES do `deriveStage`, não depois

**Bug real encontrado ao vivo (2026-09-08):** duas aeronaves recém-adicionadas
(`TAM3053`, `GLO1009`) nunca classificaram corretamente como `APROXIMACAO`
na primeira leitura, mesmo já estando a poucos km do pouso. `TAM3053` foi
o caso grave — pulou direto de `DESCIDA` pra `POUSO`, sem nunca passar por
`APROXIMACAO` nem ganhar o recheck rápido.

**Causa raiz:** a busca de rota no adsbdb (que resolve
`destinationLatitude/Longitude`) rodava DEPOIS do `deriveStage`/upsert
principal no código. Numa aeronave nova (`existing === null`, primeira vez
sendo vista), o destino ainda era desconhecido no momento da classificação
— só ficava disponível no ciclo SEGUINTE. Combinado com a decisão 1 (só
proximidade define `APROXIMACAO`), essa 1ª leitura sempre caía no
fallback antigo de altitude/taxa vertical, mesmo já estando perto.

**Correção:** a busca de rota foi movida pra ANTES do `deriveStage` — o
destino resolvido nesta mesma leitura já alimenta a própria classificação
do ciclo atual, eliminando o atraso de 1 ciclo. Não resolve a decisão 1
(destino desconhecido/errado continua sem solução — ver "possíveis
melhorias futuras"), mas elimina esse atraso mecânico específico que
afetava toda aeronave nova, mesmo com destino corretamente resolvível.

---

## 2. Recheck em 3 tiers por distância (45s / 30s / 2s)

**Decisão:** dentro do estágio `APROXIMACAO`, o intervalo de rebusca no
OpenSky escalona por distância até o destino: **45s** até 40km, **30s**
até 25km, **2s** até 10km.

**Contexto:** evoluiu em 3 rodadas ao longo da sessão — começou como um
único valor fixo (15min pra qualquer aeronave "voando"), depois um segundo
tier de 45s pra "perto do destino" (raio único de 25km), depois esse raio
subiu pra 25km→45s / 5km→2s, e por fim os 3 tiers atuais (40/25/10km).
Cada aumento veio de um bug real visto ao vivo: aeronave saindo do raio
antes de confirmar o pouso, extrapolação "voando" reto por cima do
aeroporto nos minutos de folga entre uma checagem real e outra.

**Trade-off aceito:** mais chamadas à API do OpenSky quanto mais perto do
destino (até 1 chamada a cada 2s por aeronave dentro de 10km) — aceitável
porque é só durante a janela final de poucos minutos de cada voo, não o
tempo todo, e a cota da OpenSky é dimensionada com folga (ver comentários
em `config.ts`/`docker-compose.yml`).

---

## 3. Confirmação de pouso: threshold de estagnação também escalonado por tier

**Decisão:** quando o OpenSky continua "respondendo" mas devolve sempre o
MESMO fix antigo (sinal parado, não silêncio total), o tempo de espera
antes de inferir "pousou" também escalona: **~6s** dentro de 10km, **60s**
dentro de 25km, **90s** dentro de 40km — em vez de um valor fixo único.

**Contexto:** antes de escalonar, era sempre 90s (2x o tier mais lento),
mesmo pra aeronaves já a poucos km da pista sendo rechecadas a cada 2s —
desperdiçava o próprio propósito do tier rápido, que existe exatamente pra
confirmar o pouso quase em tempo real.

**Trade-off aceito:** nenhum trade-off real aqui — é estritamente melhor
que o valor fixo anterior (confirma mais rápido perto da pista, mantém a
mesma cautela longe dela). A única razão de não ser ainda mais agressivo
perto da pista (ex: 1 ciclo só, ~2s) é evitar falso positivo por um único
ciclo de rede lento/instável.

---

## 4. Nunca deletar uma aeronave monitorada, só marcar offline

**Decisão:** `TrackedAircraft` nunca é removida do banco por sumir do ar —
fica com `isOnline: false` e a última posição conhecida preservada.

**Contexto:** pedido explícito do usuário desde o desenho inicial do
pipeline (2026-09-01) — a lista de aeronaves monitoradas é fixa e pequena
(ICAO24s configurados manualmente em `docker-compose.yml`), não uma frota
dinâmica onde "sumiu = não existe mais".

**Trade-off aceito:** linhas "mortas" (aeronaves já trocadas por outras no
`TRACKED_AIRCRAFT_ICAO24S`) ficam acumulando no banco até serem limpas
manualmente (`DELETE FROM tracked_aircraft WHERE icao24 IN (...)`) — não
há limpeza automática. Aceito porque a lista é pequena (tipicamente 4
aeronaves) e trocada manualmente mesmo.

---

## 5. Dead reckoning no frontend em vez de aumentar a frequência real

**Decisão:** a posição exibida no mapa se move a cada 1 segundo via
extrapolação client-side (última posição + velocidade + rumo), não por
buscar dado real nessa frequência.

**Contexto:** o usuário pediu atualização de 1 em 1 segundo, mas o acesso
anônimo ao OpenSky tem cota de 400 chamadas/dia — buscar a cada segundo
seria 86.400 chamadas/dia, 216x o orçamento. Dead reckoning é a técnica
padrão de rastreadores de voo comerciais pra esse exato problema.

**Trade-off aceito:** entre uma medição real e outra, a posição exibida é
CALCULADA, não medida — pode divergir da posição real (curvas, vetoração
de tráfego aéreo, desaceleração) até a próxima correção real. É exatamente
essa divergência que motivou as decisões 6 e 7 abaixo (congelar/ajustar a
extrapolação em vez de deixá-la "inventar" indefinidamente).

---

## 6. Extrapolação congela SÓ no estágio `APROXIMACAO`, não em `DESCIDA`

**Decisão:** o dead reckoning do frontend só para de extrapolar movimento
quando `stage === 'APROXIMACAO'` **E** a distância até o destino é ≤10km
(`APPROACH_MANEUVER_FREEZE_RADIUS_KM`, mesmo raio do tier de recheck de 2s
do backend). Durante `DESCIDA`, e durante a faixa externa de `APROXIMACAO`
(10-40km), continua se movendo normalmente a cada segundo.

**Contexto:** testado e revertido uma vez — `DESCIDA` também foi incluída
no freeze em 2026-09-04 (pra resolver aeronave "passando direto do
aeroporto"), mas o usuário pediu de volta o movimento contínuo durante a
descida em 2026-09-06 ("está a um tempão parado"). O caso de sinal
sumindo durante descida passou a ser coberto pela decisão 7 (mais
cirúrgica: só trava quando o dado realmente parou de chegar, não a fase
inteira).

**Correção 2026-09-08 (bug real, GLO1107):** o freeze original travava a
fase `APROXIMACAO` INTEIRA, sem olhar pra distância — fazia sentido
enquanto essa fase só disparava a ≤600m de altitude (decisão 1, versão
antiga), uma janela de segundos onde congelar era imperceptível. Depois da
decisão 1 trocar pra proximidade (≤40km), a mesma fase passou a durar
5-8+ minutos, e o freeze cego fazia o marcador ficar parado por até 45s
entre cada checagem real do tier mais lento — usuário reportou "está
próxima de Guarulhos mas não se move, demorando pra se mexer". Restrito o
freeze aos 10km mais próximos (mesmo raio do tier de recheck de 2s);
fora disso, `APROXIMACAO` agora se comporta EXATAMENTE como `DESCIDA` já
se comportava.

**Trade-off aceito:** durante `DESCIDA` E a faixa externa de `APROXIMACAO`
(10-40km) — curvas de vetoração reais, não sinal perdido — a extrapolação
em linha reta pode divergir visualmente da rota real da aeronave por
alguns segundos entre correções reais. Aceito porque o backend rebusca a
cada 2-45s nessa faixa (decisão 2), então o erro se autocorrige rápido; é
o MESMO trade-off já aceito pra `DESCIDA`, só estendido pra faixa externa
de `APROXIMACAO` — não é um risco novo, é o mesmo risco já validado
aplicado a mais uma faixa.

---

## 7. "Snap" pro destino em vez de congelar na última posição real

**Decisão:** quando um fix real fica parado (sem atualizar) por tempo
demais E a aeronave está perto do destino conhecido, o marcador pula
DIRETO pras coordenadas do aeroporto — não fica congelado na última
posição real (que pode estar a vários km de distância).

**Contexto:** pedido explícito do usuário (2026-09-08) — sinal sumindo
perto do destino quase sempre significa "já pousou"; o aeroporto é um
palpite melhor que o último ponto antes do sinal sumir.

**Trade-off aceito:** se a aeronave NÃO tiver realmente pousado (ex: só um
gap real e temporário de cobertura ADS-B a alguns km do aeroporto, ainda
em voo), o marcador vai mostrar ela "no aeroporto" incorretamente até a
próxima correção real. Aceito porque o caso oposto (aeronave já pousada
mostrando "voando reto por cima da pista") era o bug mais visível e mais
reportado.

**Pegadinha de implementação corrigida:** esse snap precisa rodar ANTES do
early-return de `onGround` na função de extrapolação — senão, no exato
momento em que o backend confirma o pouso (`onGround: true`), o frontend
"pulava de volta" pra última posição real (que o backend não atualiza
nesse branch), desfazendo o snap visual que já estava correto.

**Correção 2026-09-08 (bug real, TAM3367 — "atualizou e voltou alguns km,
e agora está congelado"):** o gatilho do snap era SÓ `elapsedSec > 90s`
(constante fixa). Quando o backend passou a confirmar pouso por
estagnação em até ~6s perto da pista (decisão 3, tiers adaptativos), abriu
um buraco real: o backend já tinha marcado `onGround: true`, mas o
frontend só ia considerar o snap depois de completar os 90s fixos daqui —
que nunca foram atualizados junto com a decisão 3. Nesse buraco (até ~84s
de diferença), o early-return de `onGround` (ver acima) já freava TUDO —
nem extrapolação, nem snap — deixando o marcador preso na última posição
real. Corrigido: o gatilho agora é `onGround === true OU elapsedSec >
90s` — `onGround` vindo do backend é um sinal de pouso MAIS forte que
mera estagnação (o backend só seta isso depois de já confirmar por
proximidade), então não faz sentido esperar mais 90s por cima dele. Boa
lição: alterar a velocidade de confirmação de um lado (backend) sem
revisar o timer correspondente do outro lado (frontend) abre exatamente
esse tipo de buraco — os dois precisam ser reconferidos juntos.

Ver
comentário em `useDeadReckoning.ts` na função `extrapolate()`.

---

## 8. Confirmação de pouso por DOIS gatilhos diferentes

**Decisão:** o backend infere "pousou" de duas formas independentes:
(a) a aeronave some inteiramente das respostas do OpenSky (`state === null`)
perto do destino em `APROXIMACAO`; (b) a aeronave continua "aparecendo" nas
respostas, mas sempre com o MESMO fix antigo (`time_position` não avança) —
o próprio cache do OpenSky, não sinal novo de verdade.

**Contexto:** o gatilho (a) sozinho não cobria o caso visto ao vivo
(2026-09-08, AZU4206 pousando em Viracopos) onde o OpenSky continuava
"respondendo" com sucesso a cada ciclo, só que sempre com os mesmos dados —
`isOnline` ficava `true` pra sempre e o pouso nunca era confirmado.

**Trade-off aceito:** mais complexidade (duas checagens de estagnação em
vez de uma), mas nenhum trade-off funcional real — os dois gatilhos cobrem
cenários mutuamente exclusivos (resposta vazia vs. resposta repetida) e
juntos fecham o buraco que existia com só um dos dois.

---

## 9. `stage`/`onGround` atualizados junto com `flightEndedAt` na inferência por silêncio

**Decisão:** quando o pouso é inferido por silêncio/estagnação (decisão 8),
o backend agora escreve `stage: 'POUSO'` e `onGround: true` no mesmo
update que grava `flightEndedAt` — não só o timestamp.

**Contexto:** bug reportado ao vivo (2026-09-08, TAM3229) — o sistema já
"sabia" internamente que a aeronave tinha pousado (via `flightEndedAt`,
usado pro alerta do Command Center), mas a timeline visual (`stage`, o que
o frontend mostra) ficava presa no último estágio aéreo real pra sempre,
já que `deriveStage` só roda quando chega uma leitura NOVA — que nunca
chega, por isso a aeronave está offline.

**Trade-off aceito:** nenhum — pura correção de inconsistência, sem
contrapartida negativa.

---

## 10. Infraestrutura: fallback pra Docker Engine em WSL2 Ubuntu

**Decisão (fora do código, operacional):** quando o Docker Desktop quebra
nesta máquina (recorrente, ver memória `project_docker_desktop_ambiente_quebrado`),
o fallback é rodar os containers via Docker Engine instalado direto numa
distro WSL2 Ubuntu, não tentar reparar o Docker Desktop repetidamente.

**Contexto:** Docker Desktop nesta máquina falha de forma intermitente e
não confiável (erro AF_UNIX em "starting services"), às vezes no meio de
uma sessão que estava funcionando havia horas. Tentar matar processos/
reinstalar repetidamente não resolve de forma confiável.

**Trade-off aceito:** esse fallback roda numa engine Docker SEPARADA (banco
de dados próprio, sem os dados que já existiam no volume do Docker
Desktop) — troca de ambiente reinicia o estado (aeronaves rastreadas do
zero, sem histórico anterior). Aceito porque os dados de aeronaves são
re-sincronizados automaticamente do OpenSky em minutos; não é um sistema
com dado histórico crítico de longo prazo.

---

## Possíveis melhorias futuras (não implementadas)

- **Fallback híbrido pro estágio `APROXIMACAO`** (decisão 1): quando o
  destino é desconhecido (adsbdb sem rota) OU quando a distância até o
  destino resolvido é suspeita demais (ex: >500km com altitude baixíssima,
  sinal de rota multi-trecho mal resolvida), voltar a usar o critério de
  altitude como sinal secundário — recuperaria a cobertura pra voos
  codeshare/multi-trecho sem abrir mão do ganho de precisão da proximidade
  pros casos normais.
- **Alinhar as constantes do freeze/snap do frontend** (`APPROACH_STALE_FREEZE_SEC`
  = 90s fixo, `APPROACH_STALE_FREEZE_RADIUS_KM` = 8km) aos tiers agora
  escalonados do backend (decisão 3) — hoje são independentes; o backend
  pode confirmar pouso em ~6s perto da pista enquanto o frontend só
  snapeia pro destino depois de 90s parado, o que é inofensivo hoje (a
  última posição real já está perto o bastante nesse raio) mas é uma
  inconsistência que pode importar se os raios mudarem de novo.
