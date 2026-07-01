# Automacao BENEL PPBI - Relatorio 28

Arquivos principais:

- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\benel_guberman_report28.mjs`
- `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\run_benel_guberman_report28.ps1`

## O que o script faz

1. Abre `https://integra.benellog.com.br/workspaces`
2. Entra no workspace `Operação`
3. Abre `REL2026 GUBERMAN v.00`
4. Tenta navegar automaticamente ate a pagina `28`
5. Deixa visiveis os filtros da tela e, se voce informar valores, tenta aplicar:
   `FILIAL`, `SITUAÇÃO`, `TIPO, CATEGORIA` e outros filtros da pagina

## Primeiro uso

Execute:

```powershell
cd C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27
.\run_benel_guberman_report28.ps1 -KeepOpen
```

Se o portal pedir login, conclua manualmente na janela aberta. A sessao fica salva em:

`C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\outputs\benel-ppbi-profile`

## Exemplos

Abrir a pagina 28 sem aplicar filtro:

```powershell
.\run_benel_guberman_report28.ps1
```

Abrir a pagina 28 e tentar aplicar filtros:

```powershell
.\run_benel_guberman_report28.ps1 `
  -Filial "FOR - CE" `
  -Situacao "A VENCER" `
  -TipoCategoria "MP 1 - LEVES" `
  -KeepOpen
```

Abrir outra pagina do relatorio:

```powershell
.\run_benel_guberman_report28.ps1 -Page 28
```

## Observacoes

- O script foi montado com base nos prints do portal. Se algum texto, botao ou posicao do relatorio mudar, talvez seja necessario ajustar um fallback dentro do `.mjs`.
- O primeiro login e manual. Depois disso, o perfil persistente reduz bastante a necessidade de novo acesso.
- Screenshots de evidencia ficam em:
  `C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\outputs\benel-ppbi-screenshots`
