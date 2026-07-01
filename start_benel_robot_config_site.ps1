$ErrorActionPreference = "Stop"

$workspace = "C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27"
$sitePath = Join-Path $workspace "benel-robot-config-site\index.html"

if (-not (Test-Path -LiteralPath $sitePath)) {
  throw "Painel offline nao encontrado em $sitePath"
}

Start-Process -FilePath $sitePath
