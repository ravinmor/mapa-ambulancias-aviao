# Auditoria — sistema real de resgate (SharePoint `AmilResgatePROD2`)

Levantamento de 2026-09-21 via REST API do SharePoint (`_api/web/lists`),
autenticado na sessão do usuário (Chrome, login já ativo). Contexto: ver
memória `project_migracao_sistema_resgate_sharepoint.md` e a seção "Mudança
de escopo do banco `resgate`" em
`TAREFAS_Reestruturacao_Aircraft_Tracker_Banco.md`. Objetivo: ter a base
completa pra desenhar o `resgate` como destino real de uma migração futura,
não só como espelho pro mapa.

**Método**: `GET _api/web/lists/getbytitle('<Lista>')/fields?$filter=Hidden
eq false and FromBaseType eq false` — retorna só colunas **customizadas**
(exclui as ~24 colunas de sistema do SharePoint por lista: `Title`,
`Author`, `Created`, `_ColorTag` etc.). Nomes internos com `_x00XX_` são
caracteres acentuados codificados em hex pelo SharePoint (ex:
`Descri_x00e7__x00e3_o` = "Descrição"); mantive o nome interno (é o que uma
migração real usaria) com a leitura ao lado quando não óbvia.

**43 listas de dado auditadas** (exclui bibliotecas de documento/página,
essas não entram no schema). Todas as 43 têm campos documentados abaixo —
nenhuma ficou de fora.

---

## Parte 1 — Cadastros/mestres (prefixo `d_`)

### `d_Cadastro_Veiculos` (26 itens) — **hoje = `Vehicle`**
`Nome_veiculo`:Text · `Placa_Veiculo`:Text · `Status_Atividade`:Choice ·
`KM_Inicial_do_Veiculo`:Number · `Status_Operacao`:Choice ·
`Status_Atribuicao_Tablet`:Choice · `Tablet_Cadastrado`:**Lookup→
d_Cadastro_de_Tablet.Nome_Tablet** · `Tablet_Cadastrado:ID`:**Lookup→
d_Cadastro_de_Tablet.ID** · `Usuario_Tablet`:User · `Email_Tablet`:Text ·
`Latitude_atual`:Text · `Longitude_atual`:Text ·
`Data_e_hora_dados_localizacao`:DateTime · `CLIENTEESTADO`:Text ·
`atribuir_equipe_status`:Text · `Tablet_Cadastrado:Email`:**Lookup→
d_Cadastro_de_Tablet.Email_tablet** · `ID_Tablet_Cadastrado`:Number ·
`Tipo_de_Veiculo`:Text · `Edicao`:Text · `Modificacao_Status`:DateTime

### `d_Cadastro_de_Tablet` (20 itens)
`Usuario_Tablet`:User · `Status`:Choice · `Nome_Tablet`:Text ·
`Email_tablet`:Text (req) · `Latitude_atual`:Text · `Longitude_atual`:Text ·
`Data_e_hora_dados_localizacao`:DateTime · `CLIENTEESTADO`:Text ·
`Nome_Equipe`:Text · `Atribuido_Veiculo`:Boolean

### `d_Cadastro_de_Equipes` (22 itens)
`Nome_Equipe`:Text · `Status_de_Atividade`:Choice · `Whatsapp`:Text ·
`CLIENTEESTADO`:Text · `Atribuiu`:Text

### `d_Cadastro_Colaboradores` (270 itens)
`Nome_Colaborador`:Text · `Cargo`:Choice · `Status_de_atividade`:Choice ·
`foto_colaborador`:Thumbnail · `Whatsapp`:Number · `Apelido`:Text ·
`Token`:Text · `CLIENTEESTADO`:Text · `NomeEquipe`:Text ·
`IDEquipe`:Number · `RG`:Text · `CNH`:Text

### `d_Compor_equipe` (34 itens) — composição de equipe (relação equipe↔colaborador)
`rel_ID_Equipe`:Number (req) · `Nome_Equipe`:Text ·
`rel_ID_Colaborador`:Text · `rel_Nome_Colaborador`:Text ·
`rel_Cargo_Colaborador`:Text · `CLIENTEESTADO`:Text
> **Nota**: os `rel_*` NÃO são Lookup de verdade — são Number/Text
> mantidos por convenção (FK "solta", sem integridade referencial do
> SharePoint).

### `d_Compor_equipe_versionamento` (6.783 itens) — auditoria de `d_Compor_equipe`
Mesmos campos de `d_Compor_equipe` + `Acao_Inclusao_Exclusao`:Choice

### `d_Cadastro_de_Enderecos` (549 itens) — **RESOLVIDO 2026-09-21**
`field_1`=Cep_text · `field_2`=Cep_primeiros_5_digitos ·
`field_3`=Cep_ultimos_3_digitos · `field_4`=CEP · `field_5`=Logradouro2 ·
`field_6`=Numero · `field_7`=Complemento · `field_8`=Cidade ·
`field_9`=Estado · `Bairro`:Text · `CLIENTEESTADO`:Text. É um catálogo de
endereço (provável autocomplete/validação) — **não tem Lookup de** e pra
`f_Regulacao_Chamados`/`f_Disponiiblidade_do_Amil_Resgate` (que guardam
endereço em campo `Note` livre, não referenciado) — parece auxiliar,
não uma FK real do núcleo.

### `d_Cadastro_Turno` (22 itens)
`ID_EQUIPE`:Text · `EMAIL`:Text · `TIPO`:Text · `ESTADO`:Text ·
`NOME`:Text · `INICIO_TURNO`:Text · `FINAL_TURNO`:Text · `HORARIO`:Text ·
`TURNO`:Text · `EQUIPE`:Text

### `d_Cadastro_Tipos_de_Chamados` (3 itens) — tipo de chamado (referenciado por Lookup em 2 listas)
`Descricao_Chamado`:Text (req) · `Status_Atividade`:Choice (req) ·
`Qtde_de_registros`:Choice · `CLIENTEESTADO`:Text

### `d_Tipo_de_Status_do_Chamado` (14 itens)
`Descricao_Status`:Note · `Obs_Status`:Text · `Cancelamento_Usuario`:Text

### `d_Motivos_de_Cancelamento_do_chamado` (5 itens)
`Motivo_do_Cancelamento`:Text · `Status_atividade`:Choice

### `d_Histórico_Status_de_Chamado` (26.031 itens) — histórico de mudança de status por chamado
`desc_Status`:Note (req) · `ID_Chamado`:Number (req) · `ID_Operacao`:Number
· `CLIENTEESTADO`:Text

### `d_Versionamento_campos_do_Chamado` (54.627 itens) — **auditoria campo a campo de TODO chamado**
`Nome_Campo_Editado`:Text · `Novo_Valor_Editado`:Note · `ID_Chamado`:Number
(req) · `tipo_de_input`:Choice

### `d_RLS_Modulos_App_Controle` (78 itens) — **permissões (row-level security) do app**
`Modulo_Acesso`:Choice · `Usuario`:User · `WhatsApp`:Number ·
`CLIENTECIDADE`:Text · `UNIDADE`:Text

### `d_Responsaveis_por_check_list` (5 itens)
`Tipo_de_checklist`:Choice · `CLIENTEESTADO`:Text · `RESPONSAVEL`:User

### `d_Cadastro_Tipo_de_Servico_Equipe` (2 itens)
`Tipo_de_servico`:Text (req) · `Status_de_Atividade`:Choice (req)

### Checklist — cadastro (2 domínios paralelos: Enfermagem / Veículos)
- `d_cadastro_Categorias_CheckList_Enfermagem` (107): `Tipo_de_servico`:Choice
  · `Categoria`:Text · `CLIENTEESTADO`:Text · `Status_atividade`:Choice
- `d_cadastro_Categorias_CheckList_Veiculos` (42): mesmos campos + `req`
  em `Tipo_de_servico`/`Categoria`
- `d_cadastro_Itens_CheckList_Enfermagem` (677): `Tipo_de_servico`:Choice ·
  `CATEGORIA`:Text · `Descrição_do_item`:Text · `Tipo_de_medida_unitária`:Choice
  · `Qtde_ideal`:Number · `Qtde_crítica`:Number ·
  `Precisa_de_evidência_quando_...`:Boolean (req, x2 — conforme/não conforme)
  · `Crítico?`:Boolean · `Status_Atividade`:Choice · `CLIENTEESTADO`:Text ·
  `Opção_Não_se_aplica`:Choice
- `d_cadastro_Itens_CheckList_Veiculos` (506): mesmo padrão, `Descrição_do_item`
  é **Note** (não Text) aqui

### Módulo aéreo — cadastro (dentro do MESMO site SharePoint)
- `d_Cadastro_Aeronaves` (4): `TipoAeronave`:Text · `NomeAeronave`:Text ·
  `RegistroeAeronave`:Text · `Status`:Text · `Email`:Text ·
  `StatusAtividade`:Text · `Ativo`:Boolean
- `d_Usuarios_Aereo` (28): `Email`:Text · `Senha`:Text (⚠️ **senha em texto
  puro numa lista SharePoint** — achado de segurança, não é do escopo desta
  auditoria mas vale reportar) · `Perfil`:Text · `Ativo`:Boolean ·
  `PrimeiroAcesso`:Boolean · `UltimoAcesso`:DateTime

---

## Parte 2 — Operacional (prefixo `f_`)

### `f_Operacao_Controle_Dados_do_Chamado` (26.042 itens) — **hoje = `Mission`**
Campo central do fluxo operacional — sequência de timestamps/e-mail por
etapa (`Amb_Ops_*`/`Amb_Dt_*`/`Amb_Email_*` para: início deslocamento,
chegada origem, saída origem→destino, chegada destino, finalização — 5
etapas × 3 campos cada). Também: `Status_de_aceite`:Choice ·
`ID_Chamado`:Number · `ID_Equipe_atribuida`:Number · `ID_Veiculo`:Number ·
`Status_atual_da_operacao`:Text · `Status_Operacao`:Choice ·
`ID_Solicitacao_Disponibilidade`:Number · `Amb_1..6_Latitude_e_Longitude`:Text
(6 ambulâncias possíveis por chamado?) · `Amb_1..6_tempo_min_entre_etapa`:Number
· `Tipo_de_viagem`:Choice · `Dt_Cancelamento_operacao`:DateTime ·
`Motivo_cancelamento`:Choice · `Area_que_cancelou`:Choice ·
`Ficha_de_transporte_frente/verso`:Thumbnail · `Duracao_do_Atendimento_atual`:**Calculated**
· `Quais_Horas_Atendendo`/`QUAIS_HRS`:**Calculated** · `previsao_origem`/`previsao_destino`:DateTime
· `QTA`:Text · `Atribuido`:Boolean · `ID_Aereo`:Number ·
`Ambulancia_Aereo`:Text (**ponte pro módulo aéreo!**) · `CLIENTEESTADO`:Text

### `f_Regulacao_Chamados` (23.739 itens) — **hoje = `Regulation`**
`MO`:Number (matrícula/prontuário?) · `Nome_Paciente`:Text ·
`Data_Nascimento`:DateTime · `HD`:Text (hipótese diagnóstica) ·
`rel_Tipo_Chamado`:**Lookup→d_Cadastro_Tipos_de_Chamados** ·
`Endereco_Origem`/`Endereco_Destino`:Note · `Status_do_chamado`:Text ·
`Tipo_de_Paciente`:Choice · `Sexo`:Choice · `Tipo_de_Veiculo`:Choice ·
`Procedimento`:Choice · `Plano_Paciente`:Choice ·
`Setor_da_Origem`/`Setor_da_Destino`:Text · `Status_atual_para_edicao`:Choice
· `rel_ID_Solicitacao_Disponibilida`:Text (**ponte pra
`f_Disponiiblidade_do_Amil_Resgate`**) · `ID_Triagem`:Number (**ponte pra
`f_Triagem`**) · `Obeso?`:Boolean · `TriagemRealizada`:Boolean ·
`Intubado`:Boolean · `ID_Aereo`:Number · `Aereo`:Text ·
`Ambulancia_Aereo`:Text · `CLIENTEESTADO`:Text

### `f_Triagem` (12.021 itens) — dados clínicos detalhados da triagem
`ID_Chamado`:Number · `Diagnóstico`:Note · `TipodeRecurso`:Choice ·
`Acompanhante`:Choice · `MotivodaSolicitação`:Choice ·
`HistóriaClínica`:Note · `SinaisVitais(PA-FC...)`:Note ·
`RecursoNecessário`:Choice · `Medicações_em_Bomba_de_Infusão`:Note ·
`BIA/ECMO`:Note · `TiposdePrecaução`:Choice · `PesoeAltura`:Note ·
`Informações_incorretas`:MultiChoice · `Intervenções`:MultiChoice ·
`NomeeCRMdoMédico`:Text · `CLIENTEESTADO`:Text

### `f_Disponiiblidade_do_Amil_Resgate` (3.526 itens) — **workflow de disponibilidade, 4 estágios codificados como prefixo numérico**
Estágio 1 (solicitação): `_1_Nome_Origem/Destino`:Text ·
`_1_Data_e_hora_da_chegada`:DateTime · `_1_Nome_Paciente`:Text ·
`_1_Peso_Paciente`:Number · `_1_tipo_de_chamado`:**Lookup→
d_Cadastro_Tipos_de_Chamados** · endereço completo origem/destino
(logradouro/número/complemento/bairro/estado/cidade/CEP) ·
Estágio 2 (disponibilidade dada): `_2_Data_e_hora_da_disponibi`:DateTime ·
`_2_Data_que_foi_respondido`:DateTime ·
Estágio 3 (aceite/recusa): `_3_Aceite_ou_recusa_do_soli`:Choice ·
`_3_Data_da_Resposta`:DateTime · `_3_Motivo_caso_nao_tenha_ac`:Text ·
Estágio 4 (finalização): `_4_Controle_finalizacao`:Text ·
`_4_Data_da_finalizacao`:DateTime · também `ID_Chamado_aberto`:Number ·
`Status_da_Solicitacao`:Text · `HD`:Text ·
`Status_de_disponibilidade_contro`:Choice ·
`Motivo_da_Falta_de_disponibilida`:Choice · `CLIENTEESTADO`:Text

### `f_negativas` (10.775 itens) — recusas/negativas de atendimento
`Servicos`:Text · `Observacao`:Note · `EnderecoOrigem`/`Destino`:Text ·
`Tiposervico`:Choice · `Procedimento`:Choice · `NomePaciente`:Text ·
`Adulto/Crianca`:Choice · `Regiao`/`RegiaoDestino`:Choice ·
`NomeOrigem`/`NomeDestino`:Text · `HoraAgendadaOrigem`/`Destino`:Text ·
`MotivoNegativa`:Choice · `Tiporemocao`:Text · `DatadoTransporte`:DateTime
· `Prestador`:Text · `DtHoraSolicitacao`/`Agendamento`:DateTime ·
`CLIENTEESTADO`:Text (**não tem `ID_Chamado`** — parece ser recusa
ANTES de virar chamado oficial)

### `f_Diario_da_Missao` (207 itens) — mensagens/log da missão
`ID_Operacao`:Number · `ID_Chamado`:Number · `ID_Disponibilidade`:Number ·
`Mensagem`:Note · `Momentoatual`:Text · `Tipo_de_viagem`:Text ·
`Status_de_leitura_Solicitante/Controle/Resgate`:Text (3 flags de leitura
— parece um chat/mural com 3 audiências) · `CLIENTEESTADO`:Text

### `f_log_status_veiculo` (5.067 itens)
`CLIENTE_ESTADO`:Text · `ID_VEICULO`:Number · `Status`:Text

### `f_Manutencao_Frota` (55 itens) — manutenção de veículo
`NroVTR`:Text · `Placa`:Text · `AberturaChamado`:Text ·
`EntradaOficina`/`SaidaOficina`:DateTime · `Manutencao`:Text ·
`OutrosManutencao`:Text · `TipoManutencao`:Text · `Motivo`:Note ·
`Observacao`:Text · `Valor`:Text · `Oficina`:Text ·
`AcionouSinistro`:Text · `Tempo`:Text · `KMAtual`:Text ·
`NotaFiscal`:Text · `Diagnostico`:Note · `ClienteEstado`:Text ·
`IDVtr`:Text · `Status`:Text · `NumeroAtendimento`:Text

### `f_Atribuir_Veiculo_a_Equipe_2` (33 itens) + `_Versionamento` (0)
`Veiculo`:Text (req) · `Veiculo:ID`:Number (req) ·
`Veiculo:Placa_Veiculo`:Text · `Tipo_de_Veiculo`:Choice · `Equipe`:Text ·
`Equipe:ID`:Number · `Status_de_Atribuicao`:Choice · `Status_Operacao`:Choice
· `Tablet_associado_no_momento`:Text · `Email_Tablet`:Text ·
`CLIENTEESTADO`:Text

### Rastreamento de posição — **DUAS listas, as DUAS são usadas (papéis diferentes) — RESOLVIDO 2026-09-21**
Resolvido lendo o próprio `sync-job/src/sources/sharepoint.ts` (comentários
já validados contra o JSON real dos flows em 2026-08-24/2026-09-14 —
não precisou abrir o Power Automate, a resposta já estava documentada
no código):
- `f_Rastreamento_Ambulancia` (312.849 itens) = fonte de
  `POWER_AUTOMATE_TRACKING_URL` (ping incremental normal, por veículo).
  **Não tem campo `Acao`** — só snapshot de posição/status.
- `f_Historico_localizacao_da_operacao` (273.488 itens) = fonte de
  `POWER_AUTOMATE_HISTORY_BACKFILL_URL` (backfill por operação, usado só
  pra preencher `PositionHistory.action` retroativamente). **Tem colisão de
  nome interno confirmada**: a coluna exibida "ID_Veiculo" devolve seu
  valor sob a chave JSON `"Latitude"` (nome interno antigo, renomeado
  depois de criada), e a latitude de verdade sai em `"Latitude0"` — cuidado
  se for ler essa lista direto pelo nome de coluna exibido.

### Chamado × Operação — DECISÃO DE NEGÓCIO fechada com o usuário (2026-09-21)
Na cabeça de quem opera: **um chamado pode ter 2 operações — Ida e
Volta**. Decisão de design pro `resgate`: modelar como **relação 1:N**
(`Chamado` 1 → N `Operacao`), não hardcoded em exatamente 2 — cobre o caso
comum (Ida/Volta) sem impedir uma 3ª operação futura (ex: reenvio por falha
da 1ª ambulância). A confusão herdada do sistema legado (`ID_Chamado`
usado com o SIGNIFICADO de `ID_Operacao` em algumas listas, ver abaixo)
**não é carregada pro `resgate`** — lá, `chamado_id` e `operacao_id` são
FKs distintas e consistentes em toda tabela.

**A confirmar**: o campo `Tipo_de_viagem` que já existe no `Mission`
Prisma atual (mapeado de `f_Operacao_Controle_Dados_do_Chamado.Tipo_de_viagem`)
é exatamente essa distinção Ida/Volta? Ou é outro conceito (ex: tipo de
serviço/procedimento)?

### `ID_Chamado` vs `ID_Operacao` — CONFIRMADO como inconsistência real do sistema legado, não erro de leitura
`MISSION_FIELD.callId` em `sharepoint.ts` mapeia pro campo interno
`ID_Chamado` de `f_Operacao_Controle_Dados_do_Chamado`, mas o comentário no
código diz explicitamente: **"casa com `PositionHistory.operationId`, não
com `callId`"** — ou seja, o que uma lista chama de "ID_Chamado" é, na
prática, o mesmo conceito que outra lista chama de "ID_Operacao". Não é
ambiguidade da auditoria: é confusão real herdada do sistema (usuário
confirmou 2026-09-21 que o dev anterior deixou a base em estado ruim,
teve que ser praticamente refeito, e a hierarquia chamado/operação não é
clara nem pra quem usa o sistema hoje). **Decisão de design**: ao desenhar
o `resgate`, não replicar essa confusão — definir um significado único e
consistente pra "chamado"/"operação", documentado explicitamente.

### Checklist — execução (2 domínios paralelos, 4 níveis cada: Categoria→Item→CheckList→CheckList_detalhe)
- `f_CheckList_Enfermagem` (8.122) / `f_CheckList_Veiculos` (9.667) — cabeçalho
  da execução: `token_colaborador`:Text · `NomeColaboradorqueregistrou`:Text
  · `CargoColaborador`:Text · `Temitemcriticonaoconforme`:Boolean ·
  `Enviadoparaosresponsaveis`:Boolean · `Tipodeservicodaambulancia`:Text ·
  `ID_Equipe`/`ID_Veiculo`:Number · `NomeEquipe`/`PlacaVeiculo`:Text ·
  `Qtde_NC`/`Qtde_C`/`Qtde_Total`/`Qtde_NSA`:Number · `ItensConcatenado`:Note
  · `dataehorafinalizacaodochecklist`/`data_hora_inicio_checklist`:DateTime
  · `duracaoemminutosdochecklist`:Text · `StatusPreenchimento`:Text ·
  `versao`:Text · `CLIENTEESTADO`:Text
- `f_CheckList_Enfermagem_detalhe` (18.372) / `f_CheckList_Veiculos_detalhe`
  (8.766) — linha de item: `ID_CheckList`:Number · `ID_Categoria_item`:Number
  · `ID_Item`:Number · `StatusdeConformidade`:Choice (req) ·
  `Evidencia`:Thumbnail · `Observacao`:Note · `Qtde_informada`:Number ·
  `Descricao_Categoria`/`Descricao_item`:Text · `Obs_Lideranca`:Note ·
  `CLIENTEESTADO`:Text

### `f_Intercorrencias` (112.280 itens) — não-conformidades **compartilhada entre os 2 domínios de checklist**
`ID_Checklist`:Text · `Item`:Text · `Categoria`:Text · `ID_Item`:Text ·
`Quantidade`:Text · `Comentario`:Note · `Status`:Text ·
`Tipo_Checklist`:Text (discrimina Enfermagem vs Veículos) ·
`Critico`:Boolean · `numero_lacre`:Text
> **Não é `MissionEvent`** (hipótese inicial estava errada) — é achado de
> checklist (ex: item vencido, equipamento com defeito), não evento de
> chamado/missão. `MissionEvent` do schema atual pode não ter fonte
> SharePoint 1:1 — precisa reavaliar.

### Módulo aéreo — operacional
- `f_Log_Aereo` (72): `ID_Solicitacao`:Text · `DataHora`:DateTime ·
  `Status`:Text · `Comentario`:Note · `Responsavel`:Text · `Email`:Text ·
  `Latitude`/`Longitude`:Text
- `f_Operacoes_Aereas` (0 itens) — **NÃO é morto/abandonado** (correção
  2026-09-21, confirmado com o usuário): essa lista **acabou de ser
  criada** e é onde o app interno da empresa vai salvar os dados de
  **agendamento de voo** — 0 itens porque é novo, não porque foi
  descontinuado. **Conecta direto com a tarefa "integração agendamento de
  voos"** (ver memória `project_integracao_agendamento_voos.md` e
  `TAREFAS_Reestruturacao_Aircraft_Tracker_Banco.md` seção "Depois disso"):
  esse é o schema real que o `sync-job`/futuro serviço vai precisar ler
  quando essa tarefa for retomada. Campos já mapeados: paciente (nome/CPF/
  MO/nascimento/sexo/altura/peso/telefone), `IDAeronave` (liga a
  `d_Cadastro_Aeronaves`), endereços origem/destino, `VtrOrigem/Destino`
  (Tipo/Condutor/Placa — veículo terrestre que faz a ponta até o
  aeroporto), médico, contato familiar, `Inicio`/`Fim`, `NumeroPedido`,
  `DesfechoMissao`. **Não entra no escopo do núcleo `resgate` agora** (é
  trabalho da tarefa de agendamento de voos, sequenciada pra depois) — mas
  fica documentado aqui pra quando chegar a vez.
- `f_Log_Intercorrencias_Aereo` (0 itens): `ID_Solicitacao`:Number ·
  `Intercorrencia`:Note
- `f_log_amil_resgate_com_ou_sem_atendimento` (0 itens, **zero campos
  customizados** — lista vazia/não configurada)

---

## Escopo do `resgate` — decisão fechada (2026-09-21)

**Núcleo agora**: Chamado, Operação, Veículo, Equipe, Colaborador,
Regulação, Triagem, Disponibilidade — o fluxo fim-a-fim de um atendimento.
**Fora do desenho de tabelas por agora** (documentado aqui, mas não vira
schema nesta rodada): checklist (Enfermagem/Veículos, 9 listas),
manutenção de frota, RLS/permissões, módulo aéreo (`f_Operacoes_Aereas` —
esse é da tarefa de agendamento de voos, ver acima, não do núcleo).

## Histórico e auditoria — decisão fechada (2026-09-21)

- **Histórico de status: SIM, completo.** Toda mudança de status de
  Chamado/Operação vira uma linha numa tabela de histórico (equivalente
  a `d_Histórico_Status_de_Chamado`, não só o status atual).
- **Auditoria de edição de campo: SIM, mas só nos campos CRÍTICOS** (não
  em todo campo de toda tabela, ao contrário de
  `d_Versionamento_campos_do_Chamado` que audita literalmente tudo).
  **Definido 2026-09-21** (usuário não tinha opinião forte, aprovou a
  proposta por exclusão — prioridade real dele é NÃO PERDER informação,
  não a granularidade da auditoria): histórico de edição (valor
  anterior/novo) em Chamado (endereço origem/destino, diagnóstico, tipo de
  paciente, motivo de cancelamento), Operação (equipe, veículo, status) e
  Disponibilidade (aceite/recusa + motivo). Resto das tabelas só guarda o
  valor atual, sem trilha de edição.
  > **Importante, não confundir as duas coisas**: isso é só sobre quais
  > campos ganham uma tabela de histórico EXTRA. Não tem relação com quais
  > colunas existem no schema — **TODO campo de TODA lista auditada vira
  > coluna no `resgate`, sem exceção** (garantia explícita do usuário:
  > "o que não pode faltar é informação que estava na tabela antiga" —
  > nome, data, dado médico, previsão, tipo, status, contato, tudo).
  > O ganho da infra nova é ter relacionamento de verdade (FK/join), não
  > cortar campo.

## Normalização — decisão de princípio (2026-09-21)

A duplicação de dado entre listas do SharePoint (ex: `PlacaVeiculo` repetida
em `f_CheckList_Veiculos`, `f_Atribuir_Veiculo_a_Equipe_2` etc.) é
workaround de plataforma — **SharePoint não tem join**, então cada lista
carrega cópia do que precisa pra ser consultada sozinha. Confirmado com o
usuário: **isso não é uma necessidade real, é limitação da origem** — o
`resgate` em Postgres pode (e deve, por padrão) normalizar de verdade via
FK/join, sem herdar a duplicação. Pontos quentes de leitura (ex: o mapa
consultando posição+veículo+equipe junto) resolvem-se com view/query
otimizada quando necessário, não com coluna duplicada por padrão.

## Entidades do núcleo — decisões fechadas (2026-09-21)

- **`f_Regulacao_Chamados` = a tabela-mãe do Chamado**, confirmado pelo
  usuário. O ID do item da lista É o `ID_Chamado` referenciado em todo o
  resto (`f_Operacao_Controle_Dados_do_Chamado.ID_Chamado`, `f_Triagem.ID_Chamado`,
  `d_Histórico_Status_de_Chamado.ID_Chamado`, etc.). Dado de paciente/
  endereço não se repete entre operações — fica 1x aqui.
- **Atribuição de equipe/veículo é por OPERAÇÃO, não por chamado** —
  confirmado. Ida e Volta podem ter equipe/ambulância diferentes. Reforça
  que `ID_Equipe_atribuida`/`ID_Veiculo` pertencem à tabela `Operacao`, não
  à tabela `Chamado`.
- **Triagem é 1:1 com Chamado** — confirmado, sem retriagem por enquanto.
- **Disponibilidade → Chamado: RESOLVIDO empiricamente** (usuário não
  sabia de cabeça — "Não sei" — então comparei dado real em vez de
  assumir). Peguei o item 3571 de `f_Disponiiblidade_do_Amil_Resgate`
  (`ID_Chamado_aberto`=3590) e comparei com o item 3590 de
  `f_Regulacao_Chamados`: **paciente, origem e destino idênticos**
  ("JOSE NILTON SENA DA CRUZ", "SANTA HELENA NEXT SBC" → "SANTA HELENA
  ORTOPEDIA"). Confirma: Disponibilidade é a SOLICITAÇÃO inicial (estágio
  1 = pedido, com dado de paciente/endereço próprio); quando aceita, os
  MESMOS dados viram um registro novo em Regulação (= o Chamado oficial),
  e `ID_Chamado_aberto` guarda o link pra esse registro criado.
- **1 Chamado : N Operações confirmado com dado real, N não é sempre 2** —
  testei 60 operações recentes: a maioria dos chamados tem 1 operação só
  (não todo atendimento tem volta), 3 exemplos no teste tinham exatamente
  2 (`Tipo_de_viagem`: "IDA" e "Volta" — **atenção**: capitalização
  inconsistente no dado real, "IDA" maiúsculo vs "Volta" capitalizado —
  normalizar pra enum consistente no `resgate`, não herdar a inconsistência).

## Relacionamentos identificados

**Lookups reais do SharePoint** (únicos com integridade referencial
garantida pela plataforma):
- `d_Cadastro_Veiculos` → `d_Cadastro_de_Tablet` (3 lookups, mesma
  relação vista de formas diferentes: nome/ID/email)
- `f_Regulacao_Chamados` → `d_Cadastro_Tipos_de_Chamados`
- `f_Disponiiblidade_do_Amil_Resgate` → `d_Cadastro_Tipos_de_Chamados`

**Tudo o resto é FK "solta"** (Number/Text mantido por convenção, sem
enforcement) — o padrão dominante do sistema inteiro:
- **`ID_Chamado`** — chave central, aparece em: `f_Operacao_Controle_Dados_do_Chamado`,
  `f_Regulacao_Chamados` (via nome, não ID direto — confirmar), `f_Triagem`,
  `f_Disponiiblidade_do_Amil_Resgate` (`ID_Chamado_aberto`), `f_Diario_da_Missao`,
  `d_Histórico_Status_de_Chamado`, `d_Versionamento_campos_do_Chamado`,
  `f_Historico_localizacao_da_operacao`, `f_Rastreamento_Ambulancia`
- **`ID_Operacao`** — sub-chave (uma "operação" dentro de um chamado?),
  aparece em `f_Historico_localizacao_da_operacao`, `f_Rastreamento_Ambulancia`,
  `f_Diario_da_Missao`, `d_Histórico_Status_de_Chamado` — **significado
  exato ID_Chamado vs ID_Operacao não está claro ainda, perguntar ao
  usuário**
- **`ID_Veiculo`** — `d_Cadastro_Veiculos` ↔ `f_Operacao_Controle_Dados_do_Chamado`,
  `f_Rastreamento_Ambulancia`, `f_CheckList_Veiculos`, `f_CheckList_Enfermagem`,
  `f_log_status_veiculo`, `f_Atribuir_Veiculo_a_Equipe_2`
- **`ID_Equipe`** — `d_Cadastro_de_Equipes` ↔ `d_Compor_equipe`,
  `f_Operacao_Controle_Dados_do_Chamado` (`ID_Equipe_atribuida`),
  `f_Historico_localizacao_da_operacao`, checklists
- **`ID_Colaborador`** — `d_Cadastro_Colaboradores` ↔ `d_Compor_equipe`
- **`ID_Tablet`** — `d_Cadastro_de_Tablet` ↔ `f_Rastreamento_Ambulancia`,
  `d_Cadastro_Veiculos` (via Lookup real)
- **`ID_Aereo`/`Aereo`/`Ambulancia_Aereo`** — ponte entre o fluxo terrestre
  (`f_Operacao_Controle_Dados_do_Chamado`, `f_Regulacao_Chamados`) e o
  módulo aéreo — mecanismo exato não confirmado
- **`ID_Checklist`/`ID_Item`/`ID_Categoria_item`** — cadeia Categoria→Item→
  CheckList→CheckList_detalhe→Intercorrencias, dentro de cada domínio
  (Enfermagem/Veículos)
- **`CLIENTEESTADO`** — aparece em praticamente TODA lista — **RESOLVIDO**:
  confirmado por `MISSION_FIELD.state: 'CLIENTEESTADO'` em `sharepoint.ts`,
  é literalmente "estado onde o cliente/atendimento está" (SP/RJ hoje),
  mesmo campo que hoje vira `Vehicle.state`/`Mission.state` no Prisma. Não
  é multi-tenant — é dado de negócio (geografia do atendimento).

## Achados que exigem decisão/confirmação antes de desenhar schema

1. ~~`f_Historico_localizacao_da_operacao` vs `f_Rastreamento_Ambulancia`~~
   — **RESOLVIDO**, as duas são usadas, papéis diferentes (ver seção acima).
2. `ID_Chamado` vs `ID_Operacao` — **confirmado como inconsistência real do
   sistema legado** (ver seção acima), não vai se resolver "descobrindo o
   dado certo" — é decisão de design nova pro `resgate`.
3. ~~`MissionEvent` especulativo~~ — **CORRIGIDO 2026-09-21**: eu tinha
   julgado errado antes (só olhei o `.env`, não o comentário do próprio
   schema). `mission_event.prisma` documenta a origem claramente:
   alimentado por **`f_Diario_da_Missao`** (confirmei os nomes de campo —
   batem quase 1:1: `Momentoatual`→`statusMessage`, `Mensagem`→`message`,
   `tipo_acesso`→`accessType`, os 3 `Status_de_leitura_*`→os 3
   `readStatus*`). **Propósito real**: é a fonte pretendida de uma linha
   do tempo de eventos da missão (`MissionTimeline.tsx` no frontend) —
   **hoje o componente existe mas mostra dado MOCKADO**, esperando esse
   pipeline ser ligado de verdade. `POWER_AUTOMATE_MISSION_EVENTS_URL`
   simplesmente nunca foi configurado nesta sessão/ambiente — não é
   feature morta, é feature real com o "fio" (env var) solto. **Usuário
   confirmou 2026-09-21 que não fazia ideia do que era** — normal, é
   detalhe de sessão anterior (2026-08-22, "First Commit"), não decisão de
   negócio dele. Entra no núcleo do `resgate` como `Diario_da_Missao`
   (nome mais claro que "MissionEvent").
4. `d_Cadastro_de_Enderecos` só tem `field_1`..`field_9` sem nome real —
   preciso abrir a VIEW da lista (não só o schema) pra descobrir o que cada
   campo é.
5. Auditoria nativa do SharePoint (`d_Versionamento_campos_do_Chamado`:
   54.627 itens, `d_Compor_equipe_versionamento`: 6.783) — replicar esse
   padrão no Postgres ou usar mecanismo nativo dele (triggers/tabela de
   auditoria genérica)?
6. `d_RLS_Modulos_App_Controle` (permissões) — entender a granularidade
   real antes de desenhar autorização no lado Postgres.
7. ⚠️ `d_Usuarios_Aereo.Senha`:Text — senha em texto puro numa lista
   SharePoint. Fora do escopo desta auditoria de schema, mas achado de
   segurança real que vale reportar à empresa.
8. Módulo aéreo (`f_Operacoes_Aereas` com 0 itens, schema rico mas nunca
   usado) — confirmar se é fluxo morto/abandonado antes de considerar
   migrar.

## Próximo passo

Auditoria de **schema/colunas está completa** (43/43 listas), e as 3
ambiguidades técnicas (posição, hierarquia chamado/operação, MissionEvent)
já foram **resolvidas lendo o código do `sync-job`** (comentários já
validados contra o JSON real dos flows em sessões anteriores — não foi
preciso abrir o Power Automate). Falta, antes de desenhar o banco: (a)
decisão de design pra "chamado"/"operação" (item 2 acima — é escolha nova,
não achado a confirmar); (b) decidir quais dos ~15 domínios auditados
entram no escopo do `resgate` agora vs. ficam para depois; (c) entender
melhor o negócio por trás da hierarquia chamado→operação→etapas direto com
o usuário, já que o sistema legado em si está confuso nisso.
