import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = String.raw`C:\Users\benel.FRZNBIGOR\Downloads\Telegram Desktop\MODELO ENTREGÁVEIS(1).xlsx`;
const outputDir = String.raw`C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\outputs`;
const outputPath = `${outputDir}\\relatorio_setor_manutencao_frota_benel.xlsx`;
const previewPath = `${outputDir}\\relatorio_setor_manutencao_frota_benel.png`;

const missionText =
  "Garantir a disponibilidade, a seguranca e a confiabilidade da frota da Benel Transporte e Logistica, por meio do planejamento e da execucao das manutencoes preventivas e corretivas, contribuindo diretamente para a continuidade das operacoes de transporte de petroleo e do apoio as atividades de extracao em terra.";

const objectivesText = [
  "1. Assegurar alta disponibilidade da frota para atender com regularidade as operacoes da empresa.",
  "2. Reduzir falhas mecanicas e paradas nao programadas por meio de manutencao preventiva eficiente.",
  "3. Aumentar a vida util de veiculos, componentes e equipamentos com controle tecnico e historico de manutencao.",
  "4. Otimizar custos de manutencao sem comprometer seguranca, qualidade e conformidade operacional.",
  "5. Padronizar registros, ordens de servico e analise de causa raiz para melhorar a tomada de decisao.",
].join("\n");

const goalsText = [
  "1. Cumprir no minimo 95% do plano de manutencao preventiva dentro do prazo programado.",
  "2. Reduzir em 15% as ocorrencias de manutencao corretiva emergencial no periodo de 12 meses.",
  "3. Manter a disponibilidade operacional da frota acima de 90% ao mes.",
  "4. Reduzir em 10% o tempo medio de parada dos veiculos em manutencoes corretivas.",
  "5. Garantir 100% das ordens de servico registradas com descricao da falha, acao executada e encerramento.",
  "6. Manter 100% dos itens criticos de seguranca inspecionados e regularizados dentro da periodicidade definida.",
].join("\n");

const indicatorsText = [
  "1. Disponibilidade da frota (%) - ligado ao objetivo de garantir continuidade operacional - meta: >= 90%.",
  "2. Cumprimento da manutencao preventiva (%) - ligado ao objetivo de disciplinar o plano de manutencao - meta: >= 95%.",
  "3. Quantidade de corretivas emergenciais - ligado ao objetivo de reduzir falhas - meta: reducao de 15% em 12 meses.",
  "4. Tempo medio de parada por manutencao (horas) - ligado ao objetivo de aumentar agilidade e produtividade - meta: reducao de 10%.",
  "5. Custo de manutencao por veiculo ou km rodado - ligado ao objetivo de eficiencia de custos - acompanhamento mensal.",
  "6. Percentual de ordens de servico fechadas com historico completo - ligado ao objetivo de padronizacao e rastreabilidade - meta: 100%.",
].join("\n");

const meetingsText = [
  "1. Reuniao diaria de programacao da manutencao: periodicidade diaria; participantes: coordenacao e equipe de manutencao; pauta: status da frota, prioridades do dia, veiculos parados, seguranca e pecas pendentes.",
  "2. Reuniao semanal de acompanhamento: periodicidade semanal; participantes: manutencao, operacao e suprimentos quando necessario; pauta: preventivas programadas, corretivas abertas, indicadores e gargalos.",
  "3. Reuniao mensal de resultados: periodicidade mensal; participantes: lideranca do setor e gestor imediato; pauta: disponibilidade da frota, custos, reincidencia de falhas, plano de acao e necessidades de investimento.",
  "4. Reuniao extraordinaria de analise de falha critica: realizada sempre que houver quebra relevante; participantes: envolvidos no processo; pauta: causa raiz, acao corretiva, acao preventiva, responsavel e prazo.",
].join("\n");

const contentFormat = {
  horizontalAlignment: "left",
  verticalAlignment: "top",
  wrapText: true,
  font: {
    size: 10,
    color: "#000000",
  },
};

try {
  await fs.mkdir(outputDir, { recursive: true });

  const input = await FileBlob.load(inputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItem("Planilha1");

  sheet.getRange("A1").values = [["SETOR DE MANUTENCAO DE FROTA"]];
  sheet.getRange("A2").values = [["RESPONSAVEL DO SETOR: COORDENACAO DE MANUTENCAO DE FROTA"]];

  sheet.getRange("A4").values = [[missionText]];
  sheet.getRange("A9").values = [[objectivesText]];
  sheet.getRange("A19").values = [[goalsText]];
  sheet.getRange("A32").values = [[indicatorsText]];
  sheet.getRange("A39").values = [[meetingsText]];

  sheet.getRange("A4:U7").format = contentFormat;
  sheet.getRange("A9:U17").format = contentFormat;
  sheet.getRange("A19:U30").format = contentFormat;
  sheet.getRange("A32:U37").format = contentFormat;
  sheet.getRange("A39:U44").format = contentFormat;

  sheet.getRange("V1:V39").clear({ applyTo: "contents" });

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Planilha1!A1:V39",
    include: "values",
    tableMaxRows: 39,
    tableMaxCols: 22,
    tableMaxCellChars: 140,
    maxChars: 14000,
  });

  console.log(inspect.ndjson);

  const preview = await workbook.render({
    sheetName: "Planilha1",
    scale: 2,
    format: "png",
  });

  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  console.log(`OUTPUT_XLSX=${outputPath}`);
  console.log(`OUTPUT_PREVIEW=${previewPath}`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
