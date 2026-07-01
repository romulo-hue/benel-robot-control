import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = String.raw`C:\Users\benel.FRZNBIGOR\Downloads\Telegram Desktop\MODELO ENTREGÁVEIS(1).xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});

console.log(summary.ndjson);

const preview = await workbook.render({
  sheetName: "Planilha1",
  scale: 2,
  format: "png",
});

await fs.writeFile(
  String.raw`C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27\report_model_preview.png`,
  new Uint8Array(await preview.arrayBuffer()),
);
