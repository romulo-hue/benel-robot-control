# Benel Robo em Nuvem

## O que foi preparado

Arquivos novos para rodar sem depender do PowerShell do seu computador:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_config.mjs`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel_robot_scheduler.mjs`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel_robot_control_server.mjs`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\Dockerfile`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\render.yaml`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\package.json`

## Como funciona no Render

1. O `benel_robot_control_server.mjs` publica o painel em uma URL
2. O painel salva o JSON diretamente no servidor
3. O mesmo serviço roda o scheduler em segundo plano
4. O scheduler lê a agenda do JSON e dispara sozinho no horário configurado
5. O `run_benel_robot_from_config.mjs` executa os ciclos
6. Cada ciclo tira print e envia no Telegram pelo bot, como hoje

## Agendamentos suportados

O scheduler usa o bloco `schedule` do seu JSON:

- `enabled = true` ativa o agendamento
- `mode = daily` roda no `startTime`
- `mode = weekly` roda no `startTime` apenas nos dias de `weekdays`
- `mode = interval` roda dentro da janela `startTime` ate `endTime`, repetindo a cada `intervalMinutes`
- `mode = manual` nao roda sozinho

O campo `actionWaitSeconds` continua sendo o tempo entre passos do robo.

## Variaveis de ambiente

No servidor/container, configure:

```bash
BENEL_LOGIN_USER=seu_usuario
BENEL_LOGIN_PASSWORD=sua_senha
TZ=America/Sao_Paulo
BENEL_HEADLESS=true
BENEL_CONFIG_PATH=/app/config/benel-guberman-config.json
BENEL_PROFILE_DIR=/app/data/profile
BENEL_SCREENSHOT_DIR=/app/data/screenshots
BENEL_SCHEDULER_STATE_PATH=/app/data/cloud-scheduler-state.json
```

## Subida com Render

O caminho recomendado no Render e usar um `Web Service` com disco persistente, porque:

- o painel precisa ter URL publica
- o robo precisa manter sessao do portal
- o scheduler precisa ficar ligado
- a sessao do navegador e os prints precisam sobreviver a reinicios

O arquivo `render.yaml` ja foi criado com:

- web service Docker
- health check em `/api/health`
- disco persistente montado em `/app/data`
- variaveis de ambiente-base

Voce so precisa preencher no Render:

- `BENEL_LOGIN_USER`
- `BENEL_LOGIN_PASSWORD`

## Subida com Docker

Build:

```bash
docker build -t benel-guberman-robot .
```

Run:

```bash
docker run -d \
  --name benel-guberman-robot \
  -e BENEL_LOGIN_USER='seu_usuario' \
  -e BENEL_LOGIN_PASSWORD='sua_senha' \
  -e TZ='America/Sao_Paulo' \
  -v /seu/caminho/config:/app/config \
  -v /seu/caminho/data:/app/data \
  benel-guberman-robot
```

## Onde eu recomendo hospedar

Hoje, entre GitHub Pages e Render, a melhor opcao para o robo completo e o Render.

- GitHub Pages serve apenas para site estatico
- ele nao executa o scheduler nem o navegador do robo
- no GitHub Pages o painel poderia existir, mas o robo continuaria sem execucao automatica

No projeto eu tambem deixei o arquivo:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel-robot-config-site\.nojekyll`

para facilitar, caso voce queira publicar so a interface estatica no GitHub Pages.

## Ponto importante sobre login

O maior cuidado na nuvem e a sessao do portal.

Como o robo salva perfil em:

- `/app/data/profile` no container

voce precisa usar armazenamento persistente. Sem isso, a sessao pode se perder a cada reinicio.

## Fluxo recomendado

1. Ajustar o JSON no painel
2. Subir o projeto no GitHub manualmente
3. Conectar o repositório ao Render
4. Criar o Web Service usando o `render.yaml`
5. Abrir o painel na URL publicada
6. Salvar a configuracao pelo proprio site
7. Deixar `schedule.enabled = true`
8. Acompanhar logs

## Logs

Para ver os logs:

```bash
docker logs -f benel-guberman-robot
```

## Limitacoes reais

- Se o portal pedir CAPTCHA ou invalidar a sessao, o robo vai precisar de nova autenticacao
- `headless` em nuvem pode funcionar diferente do navegador local
- Em Render, o cron job puro nao serve bem para este caso porque nao trabalha com disco persistente para a sessao
