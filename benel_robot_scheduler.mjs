import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = process.env.BENEL_CONFIG_PATH || path.join(__dirname, "benel-guberman-config.json");
const STATE_PATH = process.env.BENEL_SCHEDULER_STATE_PATH || path.join(__dirname, "outputs", "cloud-scheduler-state.json");
const CHECK_INTERVAL_MS = Math.max(15_000, Number(process.env.BENEL_SCHEDULER_CHECK_MS || 60_000));
const TIMEZONE = process.env.TZ || "America/Sao_Paulo";

let isRunning = false;

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
    second: parts.second,
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

async function readJson(targetPath) {
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

async function readState() {
  try {
    return await readJson(STATE_PATH);
  } catch {
    return { lastRunKey: "" };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
  if (!schedule || schedule.enabled !== true) {
    return { shouldRun: false, runKey: "" };
  }

  if (schedule.mode === "manual") {
    return { shouldRun: false, runKey: "" };
  }

  if (schedule.mode === "daily") {
    const runKey = resolveRunKey(schedule, now);
    const shouldRun = now.time === (schedule.startTime || "00:00") && state.lastRunKey !== runKey;
    return { shouldRun, runKey };
  }

  if (schedule.mode === "weekly") {
    const weekdayKey = weekdayToKey(now.weekday);
    const allowed = Array.isArray(schedule.weekdays) ? schedule.weekdays : [];
    const runKey = resolveRunKey(schedule, now);
    const shouldRun = allowed.includes(weekdayKey) && now.time === (schedule.startTime || "00:00") && state.lastRunKey !== runKey;
    return { shouldRun, runKey };
  }

  if (schedule.mode === "interval") {
    const intervalMinutes = Math.max(1, Number(schedule.intervalMinutes || 60));
    const [hour, minute] = now.time.split(":").map(Number);
    const minuteOfDay = hour * 60 + minute;
    const runKey = resolveRunKey(schedule, now);
    const shouldRun = isTimeInsideWindow(now.time, schedule.startTime, schedule.endTime) &&
      minuteOfDay % intervalMinutes === 0 &&
      state.lastRunKey !== runKey;
    return { shouldRun, runKey };
  }

  return { shouldRun: false, runKey: "" };
}

async function runConfiguredCycles(configPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "run_benel_robot_from_config.mjs"), "--config-path", configPath], {
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

      reject(new Error(`Scheduler runner encerrou com codigo ${code}.`));
    });
  });
}

async function tick() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const [config, state] = await Promise.all([readJson(CONFIG_PATH), readState()]);
    const now = getDateParts();
    const decision = shouldRunSchedule(config.schedule || {}, now, state);

    if (!decision.shouldRun) {
      return;
    }

    console.log(`[scheduler] Disparando execucao automatica em ${now.date} ${now.time} (${TIMEZONE})`);
    await runConfiguredCycles(CONFIG_PATH);
    await writeState({ lastRunKey: decision.runKey, lastRunAt: `${now.date} ${now.time}` });
  } catch (error) {
    console.error("[scheduler] Falha:", error);
  } finally {
    isRunning = false;
  }
}

console.log(`[scheduler] Monitorando ${CONFIG_PATH}`);
console.log(`[scheduler] Timezone: ${TIMEZONE}`);
console.log(`[scheduler] Intervalo de checagem: ${CHECK_INTERVAL_MS} ms`);

await tick();
setInterval(tick, CHECK_INTERVAL_MS);
