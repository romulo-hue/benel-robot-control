param(
  [string]$ConfigPath = "C:\Users\benel.FRZNBIGOR\Downloads",
  [string]$LoginUser = "romulo@bnel.com.br",
  [string]$LoginPassword = "Romulo@123321",
  [switch]$KeepOpenLastRun,
  [switch]$NoScreenshot
)

$ErrorActionPreference = "Stop"

$workspace = "C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27"
$runnerPath = Join-Path $workspace "run_benel_robot_from_config.ps1"

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Script nao encontrado em $runnerPath"
}

$env:BENEL_LOGIN_USER = $LoginUser
$env:BENEL_LOGIN_PASSWORD = $LoginPassword

$invokeParams = @{
  ConfigPath = $ConfigPath
}

if ($KeepOpenLastRun) { $invokeParams.KeepOpenLastRun = $true }
if ($NoScreenshot) { $invokeParams.NoScreenshot = $true }

& $runnerPath @invokeParams
