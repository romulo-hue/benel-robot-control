param(
  [string]$Filial,
  [string]$Zona,
  [string]$Situacao,
  [string]$CentroCusto,
  [string]$TipoCategoria,
  [string]$Frota,
  [string]$Placa,
  [int]$SupervisorIndex,
  [string]$Km,
  [string]$Km2,
  [string]$Manutencao,
  [string]$Os,
  [string]$VenceDia,
  [int]$Page = 28,
  [int]$ActionWaitSeconds = 0,
  [switch]$KeepOpen,
  [switch]$NoScreenshot
)

$ErrorActionPreference = "Stop"

$workspace = "C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27"
$scriptPath = Join-Path $workspace "benel_guberman_report28.mjs"
$nodePath = "C:\Users\benel.FRZNBIGOR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Script nao encontrado em $scriptPath"
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node nao encontrado em $nodePath"
}

$arguments = @($scriptPath, "--page", $Page)

if ($ActionWaitSeconds -gt 0) { $arguments += @("--action-wait-seconds", $ActionWaitSeconds) }

if ($Filial) { $arguments += @("--filial", $Filial) }
if ($Zona) { $arguments += @("--zona", $Zona) }
if ($Situacao) { $arguments += @("--situacao", $Situacao) }
if ($CentroCusto) { $arguments += @("--centro-custo", $CentroCusto) }
if ($TipoCategoria) { $arguments += @("--tipo-categoria", $TipoCategoria) }
if ($Frota) { $arguments += @("--frota", $Frota) }
if ($Placa) { $arguments += @("--placa", $Placa) }
if ($SupervisorIndex -gt 0) { $arguments += @("--supervisor", $SupervisorIndex) }
if ($Km) { $arguments += @("--km", $Km) }
if ($Km2) { $arguments += @("--km2", $Km2) }
if ($Manutencao) { $arguments += @("--manutencao", $Manutencao) }
if ($Os) { $arguments += @("--os", $Os) }
if ($VenceDia) { $arguments += @("--vence-dia", $VenceDia) }
if ($KeepOpen) { $arguments += "--keep-open" }
if ($NoScreenshot) { $arguments += "--no-screenshot" }

Push-Location $workspace
try {
  & $nodePath @arguments
}
finally {
  Pop-Location
}
