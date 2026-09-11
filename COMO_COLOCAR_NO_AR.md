# Como colocar o Mapa de Ambulâncias e o Command Center no ar

Este guia tem 7 passos. Cada passo abre uma janela de terminal separada, e essa
janela precisa ficar aberta — é ela que mantém aquele serviço rodando. Não
feche nenhuma até terminar de usar o sistema.

## Como abrir uma janela de terminal (Git Bash)

Toda vez que o passo pedir "abrir um Git Bash", faça assim:

1. Clique com o botão direito em qualquer lugar vazio da área de trabalho ou
   dentro de uma pasta no Explorador de Arquivos
2. Escolha "Git Bash Here" no menu

(Se não aparecer essa opção, abra o menu Iniciar, digite "Git Bash" e clique
nele.)

## Como abrir o Prompt de Comando (cmd)

Aperte a tecla Windows, digite "cmd", e clique em "Prompt de Comando".

## Passo 1 — Ligar o banco de dados

Abra um Git Bash e cole:

```bash
"/c/postgresql/bin/pg_ctl.exe" -D "C:\projects\mapa-ambulancias-aviao\pgdata" -l "C:\projects\mapa-ambulancias-aviao\pgdata\log.txt" start
```

Esse aqui não precisa ficar aberto — o banco continua rodando em segundo
plano mesmo se você fechar a janela.

## Passo 2 — Mapa de ambulâncias (parte 1 de 3: api)

Abra um Git Bash e cole:

```bash
cd /c/projects/mapa-ambulancias-aviao/api && ./start.bat
```

Deixe essa janela aberta.

## Passo 3 — Mapa de ambulâncias (parte 2 de 3: sync-job)

Esse é diferente dos outros: use o Prompt de Comando (cmd), não o Git Bash.

Abra um cmd e cole:

```bat
cd C:\projects\mapa-ambulancias-aviao\sync-job
powershell -ExecutionPolicy Bypass -File C:\projects\mapa-ambulancias-aviao\sync-job\start.ps1
```

Deixe aberta.

## Passo 4 — Mapa de ambulâncias (parte 3 de 3: frontend)

Abra um Git Bash e cole:

```bash
cd /c/projects/mapa-ambulancias-aviao/frontend && ./start.bat
```

Deixe aberta.

## Passo 5 — Site "Conheça o Command Center"

Abra um Git Bash e cole:

```bash
cd /c/projects/conhecacommandcenter
npx serve -l 8123
```

Deixe aberta.

## Passo 6 — Command Center: parte de trás (o "motor")

Essa é a única parte que às vezes precisa de um passo a mais: fazer login.

Você só precisa fazer login se:

- For a primeira vez usando essa máquina, ou
- Aparecer um erro de "não autorizado"/"login" ao rodar o comando do fim
  deste passo

### Como fazer login (só quando necessário)

Abra um Git Bash e cole, uma linha de cada vez:

```bash
cd /c/projects/Command_Center_Total_Care
```

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

```bash
npx wrangler login
```

Isso vai abrir uma página no seu navegador. Nessa página:

1. Faça login (ou confirme que já está logado) com a conta
   `Davisousa97@gmail.com` — não use conta pessoal, tem que ser exatamente
   essa
2. Clique em "Allow" (ou "Autorizar") quando pedir permissão
3. Pode fechar a aba do navegador depois que ela disser que deu certo —
   volte pro terminal

Depois de logado (ou se já estava logado antes), rode sempre isto, no mesmo
Git Bash:

```bash
cd /c/projects/Command_Center_Total_Care
```

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

```bash
npx wrangler dev --remote
```

Deixe essa janela aberta.

## Passo 7 — Command Center: parte da frente (a tela)

Abra um Git Bash e cole:

```bash
cd /c/projects/Command_Center_Total_Care
npx vite --host 0.0.0.0
```

Deixe aberta.

## Pronto — como testar

Abra o navegador e acesse:

- Mapa sozinho: http://10.12.9.42:3010
- Command Center (painel completo): http://10.12.9.42:5173/?led-preview=1
- Login da Conta no Site Command: ravin.moreno@amil.com.br — Senha: Teste@123

Se alguma página não carregar, confira se a janela de terminal correspondente
ainda está aberta e sem mensagem em vermelho.
