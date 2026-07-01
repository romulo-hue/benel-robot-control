import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUNNER_PATH = path.join(__dirname, "benel_guberman_report28.mjs");
const SCREENSHOT_DIR = process.env.BENEL_SCREENSHOT_DIR || path.join(__dirname, "outputs", "benel-ppbi-screenshots");

function parseArgs(argv) {
  const options = {
    configPath: "",
    cycleNames: [],
    keepOpenLastRun: false,
    noScreenshot: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const nextValue = argv[index + 1];

    if (key === "keep-open-last-run") {
      options.keepOpenLastRun = true;
      continue;
    }

    if (key === "no-screenshot") {
      options.noScreenshot = true;
      continue;
    }

    if (nextValue == null || nextValue.startsWith("--")) {
      throw new Error(`O argumento --${key} precisa de um valor.`);
    }

    index += 1;

    if (key === "config-path") {
      options.configPath = nextValue;
      continue;
    }

    if (key === "cycle-name") {
      options.cycleNames.push(nextValue);
      continue;
    }

    throw new Error(`Argumento desconhecido: --${key}`);
  }

  if (!options.configPath) {
    throw new Error("Use --config-path com o caminho do JSON ou da pasta.");
  }

  return options;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveConfigPath(configPath) {
  if (!(await fileExists(configPath))) {
    throw new Error(`Arquivo JSON nao encontrado em ${configPath}`);
  }

  const stats = await fs.stat(configPath);
  if (!stats.isDirectory()) {
    return configPath;
  }

  const entries = await fs.readdir(configPath, { withFileTypes: true });
  const jsonFiles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }

    const fullPath = path.join(configPath, entry.name);
    const fileStats = await fs.stat(fullPath);
    jsonFiles.push({
      fullPath,
      name: entry.name,
      mtimeMs: fileStats.mtimeMs,
    });
  }

  if (!jsonFiles.length) {
    throw new Error(`A pasta informada nao tem arquivos JSON: ${configPath}`);
  }

  jsonFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);

  const preferredByName = jsonFiles.find((file) => /^benel-guberman-config.*\.json$/i.test(file.name));
  const selected = preferredByName || jsonFiles[0];
  console.log(`Pasta informada. Usando o JSON selecionado: ${selected.fullPath}`);
  return selected.fullPath;
}

async function getLatestScreenshotFile() {
  if (!(await fileExists(SCREENSHOT_DIR))) {
    return null;
  }

  const entries = await fs.readdir(SCREENSHOT_DIR, { withFileTypes: true });
  const pngFiles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) {
      continue;
    }

    const fullPath = path.join(SCREENSHOT_DIR, entry.name);
    const stats = await fs.stat(fullPath);
    pngFiles.push({
      fullPath,
      mtimeMs: stats.mtimeMs,
    });
  }

  pngFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return pngFiles[0] || null;
}

async function resolveNewScreenshotFile(previousFile) {
  const latestFile = await getLatestScreenshotFile();
  if (!latestFile) {
    return null;
  }

  if (!previousFile) {
    return latestFile;
  }

  if (latestFile.fullPath !== previousFile.fullPath || latestFile.mtimeMs > previousFile.mtimeMs) {
    return latestFile;
  }

  return null;
}

async function sendTelegramPhoto(botToken, chatId, photoPath, caption) {
  const form = new FormData();
  const fileBuffer = await fs.readFile(photoPath);

  form.set("chat_id", chatId);
  form.set("photo", new Blob([fileBuffer]), path.basename(photoPath));

  if (caption) {
    form.set("caption", caption);
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Falha HTTP ao enviar ao Telegram: ${response.status}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Falha ao enviar ao Telegram: ${json.description || "erro desconhecido"}`);
  }
}

function buildRunnerArgs(cycle, actionWaitSeconds, options, isLastRun) {
  const args = [RUNNER_PATH, "--page", String(cycle.page && Number(cycle.page) > 0 ? Number(cycle.page) : 28)];

  if (actionWaitSeconds > 0) {
    args.push("--action-wait-seconds", String(actionWaitSeconds));
  }

  const mappings = [
    ["filial", "--filial"],
    ["zona", "--zona"],
    ["situacao", "--situacao"],
    ["centroCusto", "--centro-custo"],
    ["tipoCategoria", "--tipo-categoria"],
    ["frota", "--frota"],
    ["placa", "--placa"],
    ["supervisorIndex", "--supervisor"],
    ["km", "--km"],
    ["km2", "--km2"],
    ["manutencao", "--manutencao"],
    ["os", "--os"],
    ["venceDia", "--vence-dia"],
  ];

  for (const [field, flag] of mappings) {
    const value = cycle[field];
    if (value != null && String(value) !== "") {
      args.push(flag, String(value));
    }
  }

  if (options.noScreenshot) {
    args.push("--no-screenshot");
  }

  if (options.keepOpenLastRun && isLastRun) {
    args.push("--keep-open");
  }

  return args;
}

async function runNodeProcess(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Execucao encerrada com codigo ${code}.`));
    });
  });
}

function shouldRunCycle(cycle, allowedNames) {
  if (!cycle || cycle.enabled !== true) {
    return false;
  }

  if (!allowedNames.size) {
    return true;
  }

  return allowedNames.has(String(cycle.name || "").toLowerCase());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = await resolveConfigPath(options.configPath);
  const rawJson = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(rawJson);

  const telegramBotToken = String(config?.integrations?.telegram?.botToken || "");
  const actionWaitSeconds = Number(config?.schedule?.actionWaitSeconds || 0);
  const allowedNames = new Set(options.cycleNames.map((name) => String(name).toLowerCase()));

  const cycles = Array.isArray(config?.cycles) ? config.cycles.filter((cycle) => shouldRunCycle(cycle, allowedNames)) : [];
  if (!cycles.length) {
    throw new Error("Nenhum ciclo ativo foi encontrado no JSON.");
  }

  const expandedRuns = [];
  for (const cycle of cycles) {
    const repeatCount = Number(cycle?.repetitions) > 0 ? Number(cycle.repetitions) : 1;
    for (let index = 1; index <= repeatCount; index += 1) {
      expandedRuns.push({
        cycle,
        iteration: index,
        totalIterations: repeatCount,
      });
    }
  }

  console.log(`JSON carregado: ${configPath}`);
  console.log(`Ciclos ativos: ${cycles.length}`);
  console.log(`Execucoes totais: ${expandedRuns.length}`);

  for (let runIndex = 0; runIndex < expandedRuns.length; runIndex += 1) {
    const run = expandedRuns[runIndex];
    const cycle = run.cycle;

    console.log("");
    console.log(`Iniciando ciclo ${runIndex + 1}/${expandedRuns.length}: ${cycle.name} (repeticao ${run.iteration}/${run.totalIterations})`);

    const screenshotBeforeRun = await getLatestScreenshotFile();
    const runnerArgs = buildRunnerArgs(cycle, actionWaitSeconds, options, runIndex === expandedRuns.length - 1);
    await runNodeProcess(runnerArgs);

    if (!cycle.telegramEnabled) {
      continue;
    }

    const chatId = String(cycle.telegramChatId || "");
    const caption = String(cycle.telegramMessage || "");
    if (!telegramBotToken) {
      console.warn("Ciclo com Telegram ativo, mas o token global do bot nao foi preenchido.");
      continue;
    }

    if (!chatId) {
      console.warn("Ciclo com Telegram ativo, mas o grupo/chat ID nao foi preenchido.");
      continue;
    }

    if (options.noScreenshot) {
      console.warn("Ciclo com Telegram ativo, mas a execucao atual esta sem screenshot.");
      continue;
    }

    const newScreenshot = await resolveNewScreenshotFile(screenshotBeforeRun);
    if (!newScreenshot) {
      console.warn("Nao encontrei um print novo para enviar ao Telegram neste ciclo.");
      continue;
    }

    console.log(`Enviando print ao Telegram: ${newScreenshot.fullPath}`);
    await sendTelegramPhoto(telegramBotToken, chatId, newScreenshot.fullPath, caption);
    console.log("OK: Print enviado ao Telegram");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
