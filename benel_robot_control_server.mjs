import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_DIR = path.join(__dirname, "benel-robot-config-site");
const CONFIG_PATH = process.env.BENEL_CONFIG_PATH || path.join(__dirname, "benel-guberman-config.json");
const STATE_PATH = process.env.BENEL_SCHEDULER_STATE_PATH || path.join(__dirname, "outputs", "cloud-scheduler-state.json");
const PORT = Number(process.env.PORT || 3000);
const TIMEZONE = process.env.TZ || "America/Sao_Paulo";
const CHECK_INTERVAL_MS = Math.max(15_000, Number(process.env.BENEL_SCHEDULER_CHECK_MS || 60_000));

let schedulerIsRunning = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function getDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}

function weekdayToKey(weekday) {
  const map = {
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
    Sun: "sun",
  };

  return map[weekday] || "";
}

async function ensureParentDirectory(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function readJson(targetPath, fallback = null) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(targetPath, payload) {
  await ensureParentDirectory(targetPath);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function isTimeInsideWindow(currentTime, startTime, endTime) {
  if (!startTime || !endTime) {
    return true;
  }

  return currentTime >= startTime && currentTime <= endTime;
}

function resolveRunKey(schedule, now) {
  if (schedule.mode === "daily") {
    return `${now.date}|daily|${schedule.startTime || "00:00"}`;
  }

  if (schedule.mode === "weekly") {
    return `${now.date}|weekly|${schedule.startTime || "00:00"}`;
  }

  if (schedule.mode === "interval") {
    return `${now.date}|interval|${now.time}`;
  }

  return "";
}

function shouldRunSchedule(schedule, now, state) {
  if (!schedule || schedule.enabled !== true || schedule.mode === "manual") {
    return { shouldRun: false, runKey: "" };
  }

  if (schedule.mode === "daily") {
    const runKey = resolveRunKey(schedule, now);
    return {
      shouldRun: now.time === (schedule.startTime || "00:00") && state.lastRunKey !== runKey,
      runKey,
    };
  }

  if (schedule.mode === "weekly") {
    const runKey = resolveRunKey(schedule, now);
    const allowed = Array.isArray(schedule.weekdays) ? schedule.weekdays : [];
    return {
      shouldRun: allowed.includes(weekdayToKey(now.weekday)) && now.time === (schedule.startTime || "00:00") && state.lastRunKey !== runKey,
      runKey,
    };
  }

  if (schedule.mode === "interval") {
    const [hour, minute] = now.time.split(":").map(Number);
    const minuteOfDay = hour * 60 + minute;
    const intervalMinutes = Math.max(1, Number(schedule.intervalMinutes || 60));
    const runKey = resolveRunKey(schedule, now);
    return {
      shouldRun: isTimeInsideWindow(now.time, schedule.startTime, schedule.endTime) &&
        minuteOfDay % intervalMinutes === 0 &&
        state.lastRunKey !== runKey,
      runKey,
    };
  }

  return { shouldRun: false, runKey: "" };
}

async function runConfiguredCycles() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "run_benel_robot_from_config.mjs"), "--config-path", CONFIG_PATH], {
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

      reject(new Error(`Execucao do robo encerrou com codigo ${code}.`));
    });
  });
}

async function schedulerTick() {
  if (schedulerIsRunning) {
    return;
  }

  schedulerIsRunning = true;

  try {
    const [config, state] = await Promise.all([
      readJson(CONFIG_PATH, null),
      readJson(STATE_PATH, { lastRunKey: "" }),
    ]);

    if (!config) {
      return;
    }

    const now = getDateParts();
    const decision = shouldRunSchedule(config.schedule || {}, now, state);
    if (!decision.shouldRun) {
      return;
    }

    console.log(`[scheduler] Disparando execucao automatica em ${now.date} ${now.time} (${TIMEZONE})`);
    await runConfiguredCycles();
    await writeJson(STATE_PATH, {
      lastRunKey: decision.runKey,
      lastRunAt: `${now.date} ${now.time}`,
    });
  } catch (error) {
    console.error("[scheduler] Falha:", error);
  } finally {
    schedulerIsRunning = false;
  }
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(payload);
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/config" && request.method === "GET") {
    const config = await readJson(CONFIG_PATH, null);
    if (!config) {
      sendJson(response, 404, { ok: false, message: "Configuracao ainda nao encontrada no servidor." });
      return true;
    }

    sendJson(response, 200, { ok: true, config });
    return true;
  }

  if (pathname === "/api/config" && request.method === "POST") {
    try {
      const rawBody = await readRequestBody(request);
      const payload = JSON.parse(rawBody);
      await writeJson(CONFIG_PATH, payload);
      sendJson(response, 200, { ok: true, message: "Configuracao salva no servidor.", path: CONFIG_PATH });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: "Nao consegui salvar a configuracao.", error: String(error.message || error) });
    }
    return true;
  }

  if (pathname === "/api/run-now" && request.method === "POST") {
    if (schedulerIsRunning) {
      sendJson(response, 409, { ok: false, message: "Ja existe uma execucao em andamento." });
      return true;
    }

    schedulerIsRunning = true;
    runConfiguredCycles()
      .then(() => {
        schedulerIsRunning = false;
      })
      .catch((error) => {
        schedulerIsRunning = false;
        console.error("[manual-run] Falha:", error);
      });

    sendJson(response, 202, { ok: true, message: "Execucao iniciada." });
    return true;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    const state = await readJson(STATE_PATH, { lastRunKey: "", lastRunAt: "" });
    sendJson(response, 200, {
      ok: true,
      status: "online",
      schedulerIsRunning,
      timezone: TIMEZONE,
      configPath: CONFIG_PATH,
      lastRunAt: state.lastRunAt || "",
    });
    return true;
  }

  return false;
}

async function serveStatic(pathname, response) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const targetPath = path.join(SITE_DIR, normalizedPath.replace(/^\/+/, ""));

  if (!targetPath.startsWith(SITE_DIR)) {
    sendText(response, 403, "Acesso negado.");
    return;
  }

  try {
    const content = await fs.readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
    response.end(content);
  } catch {
    sendText(response, 404, "Arquivo nao encontrado.");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (await handleApi(request, response, url.pathname)) {
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    console.error("[server] Falha:", error);
    sendJson(response, 500, { ok: false, message: "Erro interno no servidor." });
  }
});

server.listen(PORT, () => {
  console.log(`[server] Benel Robot Control online em http://0.0.0.0:${PORT}`);
  console.log(`[server] Configuracao principal: ${CONFIG_PATH}`);
  console.log(`[server] Timezone: ${TIMEZONE}`);
});

await schedulerTick();
setInterval(schedulerTick, CHECK_INTERVAL_MS);
