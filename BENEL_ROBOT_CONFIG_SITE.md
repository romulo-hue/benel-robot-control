# Painel Offline do Robo Guberman

Arquivos principais:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel-robot-config-site\index.html`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel-robot-config-site\app.js`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel-robot-config-site\styles.css`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\start_benel_robot_config_site.ps1`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_config.ps1`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_vscode.ps1`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\refresh_report28_filter_options.mjs`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\.vscode\tasks.json`

Como abrir:

```powershell
& 'C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\start_benel_robot_config_site.ps1'
```

O que o painel faz:

- Configura horario inicial, horario final, modo de agenda e espera entre passos
- Permite configurar o token global do bot do Telegram
- Permite criar varios ciclos
- Cada ciclo pode ter nome, repeticoes, filtros e envio opcional para um grupo do Telegram
- As sugestoes de filtros do ciclo passam a ser lidas do mapeamento real do relatorio 28
- Gera um preview dos comandos PowerShell do robo
- Salva os dados no navegador
- Exporta e importa a configuracao em JSON

Filtros mapeados hoje no relatorio 28:

- `filial`
- `zona`
- `situacao`
- `centroCusto`
- `tipoCategoria`
- `frota`
- `placa`
- `km` (campo 1)
- `km2` (campo 2)
- `manutencao`
- `os`
- `venceDia`

Arquivo gerado com o mapeamento mais recente:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel-robot-config-site\filter-options.js`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\outputs\report28-filter-options.json`

Como usar o Telegram:

1. Preencha o `Token global do bot` na Central do Robo Guberman
2. Em cada ciclo, marque `Enviar print no Telegram = Sim`
3. Preencha o `Grupo / Chat ID do Telegram`
4. Opcionalmente preencha a `Mensagem do Telegram`
5. Exporte o JSON e rode o executor normalmente

Observacoes do Telegram:

- O bot precisa estar adicionado no grupo
- O grupo pode usar `chat_id` numerico como `-100...`
- O envio acontece depois que o print do ciclo for salvo

Como rodar pelo JSON exportado:

1. Abra o painel offline
2. Monte os ciclos e clique em `Baixar JSON`
3. Salve o arquivo `.json` onde preferir
4. Rode no PowerShell:

```powershell
$env:BENEL_LOGIN_USER='SEU_USUARIO'
$env:BENEL_LOGIN_PASSWORD='SUA_SENHA'
& 'C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_config.ps1' `
  -ConfigPath 'C:\caminho\benel-guberman-config.json'
```

Como iniciar pelo VS Code:

1. Abra a pasta `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27` no VS Code
2. Pressione `Ctrl+Shift+P`
3. Digite `Tasks: Run Task`
4. Escolha `Benel: Rodar robo pelo JSON`

Ou, se quiser escolher o arquivo em uma janela:

1. Abra a pasta `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27` no VS Code
2. Pressione `Ctrl+Shift+P`
3. Digite `Tasks: Run Task`
4. Escolha `Benel: Selecionar JSON e rodar em Python`

Esse atalho usa:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel_robot_json_launcher.py`

O launcher em Python:

- abre uma janela para escolher o arquivo `.json`
- pede usuario e senha se as variaveis de ambiente nao estiverem preenchidas
- chama automaticamente o executor PowerShell do robo

Esse atalho usa:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_vscode.ps1`
- Por padrao ele procura o JSON mais recente em `C:\Users\benel.FRZNBIGOR\Downloads`

Se quiser mudar o caminho do JSON, usuario ou senha, edite estes parametros no topo do arquivo:

```powershell
param(
  [string]$ConfigPath = "C:\Users\benel.FRZNBIGOR\Downloads",
  [string]$LoginUser = "romulo@bnel.com.br",
  [string]$LoginPassword = "Romulo@123321"
)
```

Filtros extras do executor por JSON:

- Rodar apenas ciclos especificos:

```powershell
& 'C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_config.ps1' `
  -ConfigPath 'C:\caminho\benel-guberman-config.json' `
  -CycleName 'Vencidos FOR-CE','A vencer MOS-RN'
```

- Manter a ultima janela aberta:

```powershell
& 'C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_robot_from_config.ps1' `
  -ConfigPath 'C:\caminho\benel-guberman-config.json' `
  -KeepOpenLastRun
```

Observacao:

- O painel esta offline e ainda nao cria a tarefa agendada do Windows sozinho
- Ele serve como central de configuracao para a proxima etapa de integracao
