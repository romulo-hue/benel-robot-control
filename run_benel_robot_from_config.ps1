param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,
  [string[]]$CycleName,
  [switch]$KeepOpenLastRun,
  [switch]$NoScreenshot
)

$ErrorActionPreference = "Stop"

$workspace = "C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27"
$runnerPath = Join-Path $workspace "run_benel_guberman_report28.ps1"
$screenshotDir = Join-Path $workspace "outputs\benel-ppbi-screenshots"

function Get-LatestScreenshotFile {
  param(
    [string]$DirectoryPath
  )

  if (-not (Test-Path -LiteralPath $DirectoryPath)) {
    return $null
  }

  return Get-ChildItem -LiteralPath $DirectoryPath -Filter *.png -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
}

function Resolve-NewScreenshotFile {
  param(
    [string]$DirectoryPath,
    [object]$PreviousFile
  )

  $latestFile = Get-LatestScreenshotFile -DirectoryPath $DirectoryPath
  if ($null -eq $latestFile) {
    return $null
  }

  if ($null -eq $PreviousFile) {
    return $latestFile
  }

  if ($latestFile.FullName -ne $PreviousFile.FullName -or $latestFile.LastWriteTimeUtc -gt $PreviousFile.LastWriteTimeUtc) {
    return $latestFile
  }

  return $null
}

function Send-TelegramPhoto {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BotToken,
    [Parameter(Mandatory = $true)]
    [string]$ChatId,
    [Parameter(Mandatory = $true)]
    [string]$PhotoPath,
    [string]$Caption
  )

  $curlPath = Join-Path $env:SystemRoot "System32\curl.exe"
  if (-not (Test-Path -LiteralPath $curlPath)) {
    throw "Nao encontrei o curl.exe necessario para enviar ao Telegram."
  }

  if (-not (Test-Path -LiteralPath $PhotoPath)) {
    throw "Arquivo de print nao encontrado para envio ao Telegram: $PhotoPath"
  }

  $url = "https://api.telegram.org/bot$BotToken/sendPhoto"
  $arguments = @(
    "-sS",
    "-X", "POST",
    $url,
    "-F", "chat_id=$ChatId",
    "-F", "photo=@$PhotoPath"
  )

  if ($Caption) {
    $arguments += @("--form-string", "caption=$Caption")
  }

  $response = & $curlPath @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar curl para envio ao Telegram."
  }

  $json = $null
  try {
    $json = $response | ConvertFrom-Json
  } catch {
    throw "O Telegram respondeu em formato inesperado."
  }

  if (-not $json.ok) {
    $description = if ($json.description) { [string]$json.description } else { "Erro desconhecido do Telegram." }
    throw "Falha ao enviar ao Telegram: $description"
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Arquivo JSON nao encontrado em $ConfigPath"
}

$configItem = Get-Item -LiteralPath $ConfigPath

if ($configItem.PSIsContainer) {
  $jsonFiles = Get-ChildItem -LiteralPath $ConfigPath -Filter *.json -File | Sort-Object LastWriteTime -Descending

  if (-not $jsonFiles -or $jsonFiles.Count -eq 0) {
    throw "A pasta informada nao tem arquivos JSON: $ConfigPath"
  }

  $preferredByName = $jsonFiles | Where-Object { $_.Name -match '^benel-guberman-config.*\.json$' } | Select-Object -First 1
  $preferredByShape = $null

  if (-not $preferredByName) {
    foreach ($file in $jsonFiles) {
      try {
        $candidate = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
        if ($null -ne $candidate.schedule -and $null -ne $candidate.cycles) {
          $preferredByShape = $file
          break
        }
      } catch {
        continue
      }
    }
  }

  $selectedFile = if ($preferredByName) { $preferredByName } elseif ($preferredByShape) { $preferredByShape } else { $jsonFiles[0] }
  $ConfigPath = $selectedFile.FullName
  Write-Host "Pasta informada. Usando o JSON selecionado: $ConfigPath"
}

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Runner principal nao encontrado em $runnerPath"
}

$rawJson = Get-Content -LiteralPath $ConfigPath -Raw
$config = $rawJson | ConvertFrom-Json
$telegramBotToken = ""
$previousSupervisorClickMapJson = $env:BENEL_SUPERVISOR_CLICK_MAP_JSON

if ($null -ne $config.supervisorClickMap) {
  $env:BENEL_SUPERVISOR_CLICK_MAP_JSON = $config.supervisorClickMap | ConvertTo-Json -Depth 8 -Compress
} else {
  Remove-Item Env:BENEL_SUPERVISOR_CLICK_MAP_JSON -ErrorAction SilentlyContinue
}

if ($null -ne $config.integrations -and $null -ne $config.integrations.telegram -and $config.integrations.telegram.botToken) {
  $telegramBotToken = [string]$config.integrations.telegram.botToken
}

$actionWaitSeconds = 0
if ($null -ne $config.schedule -and $null -ne $config.schedule.actionWaitSeconds) {
  $actionWaitSeconds = [int]$config.schedule.actionWaitSeconds
}

$cycles = @($config.cycles) | Where-Object { $_ -and $_.enabled -eq $true }

if ($CycleName -and $CycleName.Count -gt 0) {
  $allowed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($name in $CycleName) {
    if ($name) {
      [void]$allowed.Add($name)
    }
  }

  $cycles = @($cycles) | Where-Object { $allowed.Contains([string]$_.name) }
}

if (-not $cycles -or $cycles.Count -eq 0) {
  throw "Nenhum ciclo ativo foi encontrado no JSON."
}

$expandedRuns = New-Object System.Collections.Generic.List[object]

foreach ($cycle in $cycles) {
  $repeatCount = 1
  if ($null -ne $cycle.repetitions -and [int]$cycle.repetitions -gt 0) {
    $repeatCount = [int]$cycle.repetitions
  }

  for ($index = 1; $index -le $repeatCount; $index++) {
    $expandedRuns.Add([pscustomobject]@{
      Cycle = $cycle
      Iteration = $index
      TotalIterations = $repeatCount
    })
  }
}

try {
  Write-Host "JSON carregado: $ConfigPath"
  Write-Host "Ciclos ativos: $($cycles.Count)"
  Write-Host "Execucoes totais: $($expandedRuns.Count)"

  for ($runIndex = 0; $runIndex -lt $expandedRuns.Count; $runIndex++) {
    $run = $expandedRuns[$runIndex]
    $cycle = $run.Cycle

    Write-Host ""
    Write-Host ("Iniciando ciclo {0}/{1}: {2} (repeticao {3}/{4})" -f ($runIndex + 1), $expandedRuns.Count, $cycle.name, $run.Iteration, $run.TotalIterations)
    $screenshotBeforeRun = Get-LatestScreenshotFile -DirectoryPath $screenshotDir

    $invokeParams = @{
      Page = if ($null -ne $cycle.page -and [int]$cycle.page -gt 0) { [int]$cycle.page } else { 28 }
    }

    if ($actionWaitSeconds -gt 0) { $invokeParams.ActionWaitSeconds = $actionWaitSeconds }
    if ($cycle.filial) { $invokeParams.Filial = [string]$cycle.filial }
    if ($cycle.zona) { $invokeParams.Zona = [string]$cycle.zona }
    if ($cycle.situacao) { $invokeParams.Situacao = [string]$cycle.situacao }
    if ($cycle.centroCusto) { $invokeParams.CentroCusto = [string]$cycle.centroCusto }
    if ($cycle.tipoCategoria) { $invokeParams.TipoCategoria = [string]$cycle.tipoCategoria }
    if ($cycle.frota) { $invokeParams.Frota = [string]$cycle.frota }
    if ($cycle.placa) { $invokeParams.Placa = [string]$cycle.placa }
    if ($null -ne $cycle.supervisorIndex -and [string]$cycle.supervisorIndex -ne "") { $invokeParams.SupervisorIndex = [int]$cycle.supervisorIndex }
    if ($cycle.km) { $invokeParams.Km = [string]$cycle.km }
    if ($cycle.km2) { $invokeParams.Km2 = [string]$cycle.km2 }
    if ($cycle.manutencao) { $invokeParams.Manutencao = [string]$cycle.manutencao }
    if ($cycle.os) { $invokeParams.Os = [string]$cycle.os }
    if ($cycle.venceDia) { $invokeParams.VenceDia = [string]$cycle.venceDia }
    if ($NoScreenshot) { $invokeParams.NoScreenshot = $true }
    if ($KeepOpenLastRun -and $runIndex -eq ($expandedRuns.Count - 1)) { $invokeParams.KeepOpen = $true }

    & $runnerPath @invokeParams

    $shouldSendTelegram = $false
    if ($null -ne $cycle.telegramEnabled) {
      $shouldSendTelegram = [System.Convert]::ToBoolean($cycle.telegramEnabled)
    }

    if ($shouldSendTelegram) {
      $chatId = if ($cycle.telegramChatId) { [string]$cycle.telegramChatId } else { "" }
      $caption = if ($cycle.telegramMessage) { [string]$cycle.telegramMessage } else { "" }

      if (-not $telegramBotToken) {
        Write-Warning "Ciclo com Telegram ativo, mas o token global do bot nao foi preenchido."
      } elseif (-not $chatId) {
        Write-Warning "Ciclo com Telegram ativo, mas o grupo/chat ID nao foi preenchido."
      } elseif ($NoScreenshot) {
        Write-Warning "Ciclo com Telegram ativo, mas a execucao atual esta sem screenshot."
      } else {
        $newScreenshot = Resolve-NewScreenshotFile -DirectoryPath $screenshotDir -PreviousFile $screenshotBeforeRun

        if ($null -eq $newScreenshot) {
          Write-Warning "Nao encontrei um print novo para enviar ao Telegram neste ciclo."
        } else {
          Write-Host "Enviando print ao Telegram: $($newScreenshot.FullName)"
          Send-TelegramPhoto -BotToken $telegramBotToken -ChatId $chatId -PhotoPath $newScreenshot.FullName -Caption $caption
          Write-Host "OK: Print enviado ao Telegram"
        }
      }
    }
  }
}
finally {
  if ($null -ne $previousSupervisorClickMapJson) {
    $env:BENEL_SUPERVISOR_CLICK_MAP_JSON = $previousSupervisorClickMapJson
  } else {
    Remove-Item Env:BENEL_SUPERVISOR_CLICK_MAP_JSON -ErrorAction SilentlyContinue
  }
}
