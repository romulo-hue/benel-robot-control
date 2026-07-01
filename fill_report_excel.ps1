$ErrorActionPreference = "Stop"

$inputDir = "C:\Users\benel.FRZNBIGOR\Downloads\Telegram Desktop"
$outputDir = "C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\outputs"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputPath = Join-Path $outputDir "relatorio_setor_manutencao_frota_benel_$timestamp.xlsx"

$missionText = @"
Garantir a disponibilidade, a seguranca e a confiabilidade da frota da Benel Transporte e Logistica, por meio do planejamento e da execucao das manutencoes preventivas e corretivas.

O setor contribui diretamente para a continuidade das operacoes de transporte de petroleo e do apoio as atividades de extracao em terra.

Atende principalmente a operacao, os condutores, a lideranca e as areas de apoio, assegurando veiculos em condicoes adequadas de uso.
"@.Trim()

$objectivesText = @"
1. Assegurar alta disponibilidade da frota para atender com regularidade as operacoes da empresa.
2. Reduzir falhas mecanicas e paradas nao programadas por meio de manutencao preventiva eficiente.
3. Aumentar a vida util de veiculos, componentes e equipamentos com controle tecnico e historico de manutencao.
4. Otimizar custos de manutencao sem comprometer seguranca, qualidade e conformidade operacional.
5. Padronizar registros, ordens de servico e analise de causa raiz para melhorar a tomada de decisao.
"@.Trim()

$goalsText = @"
1. Cumprir no minimo 95% do plano de manutencao preventiva dentro do prazo programado.
2. Reduzir em 15% as ocorrencias de manutencao corretiva emergencial no periodo de 12 meses.
3. Manter a disponibilidade operacional da frota acima de 90% ao mes.
4. Reduzir em 10% o tempo medio de parada dos veiculos em manutencoes corretivas.
5. Garantir 100% das ordens de servico registradas com descricao da falha, acao executada e encerramento.
6. Manter 100% dos itens criticos de seguranca inspecionados e regularizados dentro da periodicidade definida.
"@.Trim()

$indicatorsText = @"
1. Disponibilidade da frota (%) - objetivo ligado: continuidade operacional - meta: igual ou acima de 90%.
2. Cumprimento da manutencao preventiva (%) - objetivo ligado: disciplina do plano de manutencao - meta: igual ou acima de 95%.
3. Quantidade de corretivas emergenciais - objetivo ligado: reducao de falhas - meta: reduzir 15% em 12 meses.
4. Tempo medio de parada por manutencao (horas) - objetivo ligado: agilidade e produtividade - meta: reduzir 10%.
5. Custo de manutencao por veiculo ou por km rodado - objetivo ligado: eficiencia de custos - acompanhamento mensal.
6. Percentual de ordens de servico fechadas com historico completo - objetivo ligado: padronizacao e rastreabilidade - meta: 100%.
"@.Trim()

$meetingsText = @"
1. Reuniao diaria de programacao da manutencao
Periodicidade: diaria.
Participantes: coordenacao e equipe de manutencao.
Pauta: status da frota, prioridades do dia, veiculos parados, seguranca e pecas pendentes.

2. Reuniao semanal de acompanhamento
Periodicidade: semanal.
Participantes: manutencao, operacao e suprimentos quando necessario.
Pauta: preventivas programadas, corretivas abertas, indicadores e gargalos.

3. Reuniao mensal de resultados
Periodicidade: mensal.
Participantes: lideranca do setor e gestor imediato.
Pauta: disponibilidade da frota, custos, reincidencia de falhas, plano de acao e necessidades de investimento.

4. Reuniao extraordinaria de analise de falha critica
Periodicidade: sempre que houver quebra relevante.
Participantes: envolvidos no processo.
Pauta: causa raiz, acao corretiva, acao preventiva, responsavel e prazo.
"@.Trim()

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$inputPath = (Get-ChildItem -LiteralPath $inputDir -File | Where-Object { $_.Name -like "MODELO*ENTREG*xlsx" } | Select-Object -First 1 -ExpandProperty FullName)
if (-not $inputPath) {
  throw "Arquivo modelo nao encontrado em $inputDir"
}

$excel = $null
$workbook = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $workbook = $excel.Workbooks.Open($inputPath, $null, $true)
  $sheet = $workbook.Worksheets.Item(1)

  $sheet.Range("A1").Value2 = "SETOR DE MANUTENCAO DE FROTA"
  $sheet.Range("A2").Value2 = "RESPONSAVEL DO SETOR: COORDENACAO DE MANUTENCAO DE FROTA"
  $sheet.Range("A4").Value2 = $missionText
  $sheet.Range("A9").Value2 = $objectivesText
  $sheet.Range("A19").Value2 = $goalsText
  $sheet.Range("A32").Value2 = $indicatorsText
  $sheet.Range("A39").Value2 = $meetingsText

  foreach ($address in @("A4:U7", "A9:U17", "A19:U30", "A32:U37", "A39:U44")) {
    $range = $sheet.Range($address)
    $range.WrapText = $true
    $range.HorizontalAlignment = -4131
    $range.VerticalAlignment = -4160
    $range.Font.Size = 10
    $range.Font.Name = "Calibri"
  }

  $sheet.Range("V1").MergeArea.ClearContents()

  $xlOpenXmlWorkbook = 51
  $workbook.SaveAs($outputPath, $xlOpenXmlWorkbook)
  $workbook.Close($true)
  $excel.Quit()

  Write-Output "OUTPUT_XLSX=$outputPath"
}
finally {
  if ($workbook -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  if ($excel -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
