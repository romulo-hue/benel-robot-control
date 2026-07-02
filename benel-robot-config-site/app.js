const STORAGE_KEY = "benel-guberman-robot-config-v1";
const SCRIPT_PATH = "C:\\Users\\benel.FRZNBIGOR\\Documents\\Codex\\2026-05-27\\run_benel_guberman_report28.ps1";
const CONFIG_RUNNER_PATH = "C:\\Users\\benel.FRZNBIGOR\\Documents\\Codex\\2026-05-27\\run_benel_robot_from_config.ps1";
const WEEKDAYS = [
  { value: "mon", label: "Seg" },
  { value: "tue", label: "Ter" },
  { value: "wed", label: "Qua" },
  { value: "thu", label: "Qui" },
  { value: "fri", label: "Sex" },
  { value: "sat", label: "Sab" },
  { value: "sun", label: "Dom" },
];
const HOSTED_MODE = window.location.protocol.startsWith("http");
const IS_GITHUB_PAGES = window.location.hostname.endsWith("github.io");
const SUPPORTS_SERVER_API = HOSTED_MODE && !IS_GITHUB_PAGES;
const SERVER_CONFIG_ENDPOINT = "/api/config";
const SERVER_RUN_NOW_ENDPOINT = "/api/run-now";
const SERVER_HEALTH_ENDPOINT = "/api/health";
const REPORT_FILTERS = window.BENEL_FILTER_OPTIONS?.filters || {};
const FILTER_LIST_IDS = {
  filial: "filialSuggestions",
  situacao: "situacaoSuggestions",
  tipoCategoria: "tipoCategoriaSuggestions",
  zona: "zonaSuggestions",
  centroCusto: "centroCustoSuggestions",
  frota: "frotaSuggestions",
  placa: "placaSuggestions",
  km: "kmSuggestions",
  km2: "km2Suggestions",
  manutencao: "manutencaoSuggestions",
  os: "osSuggestions",
};

function createCycle(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "Ciclo novo",
    page: 28,
    repetitions: 1,
    filial: "",
    situacao: "",
    tipoCategoria: "",
    zona: "",
    centroCusto: "",
    frota: "",
    placa: "",
    supervisorIndex: "",
    km: "",
    km2: "",
    manutencao: "",
    os: "",
    venceDia: "",
    telegramEnabled: false,
    telegramChatId: "",
    telegramMessage: "",
    notes: "",
    ...overrides,
  };
}

function getDefaultState() {
  return {
    schedule: {
      enabled: true,
      mode: "daily",
      startTime: "06:00",
      endTime: "18:00",
      intervalMinutes: 60,
      actionWaitSeconds: 0,
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
    },
    integrations: {
      telegram: {
        botToken: "",
      },
    },
    cycles: [
      createCycle({
        name: "Ciclo base relatorio 28",
      }),
    ],
  };
}

function hydrateState(parsed = {}) {
  return {
    ...getDefaultState(),
    ...parsed,
    schedule: {
      ...getDefaultState().schedule,
      ...(parsed.schedule || {}),
    },
    integrations: {
      ...getDefaultState().integrations,
      ...(parsed.integrations || {}),
      telegram: {
        ...getDefaultState().integrations.telegram,
        ...((parsed.integrations && parsed.integrations.telegram) || {}),
      },
    },
    cycles: Array.isArray(parsed.cycles) && parsed.cycles.length
      ? parsed.cycles.map((cycle) => createCycle(cycle))
      : getDefaultState().cycles,
  };
}

let state = loadState();

const elements = {
  scheduleEnabled: document.querySelector("#scheduleEnabled"),
  scheduleMode: document.querySelector("#scheduleMode"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  intervalMinutes: document.querySelector("#intervalMinutes"),
  actionWaitSeconds: document.querySelector("#actionWaitSeconds"),
  telegramBotToken: document.querySelector("#telegramBotToken"),
  weekdayButtons: document.querySelector("#weekdayButtons"),
  cyclesList: document.querySelector("#cyclesList"),
  cycleTemplate: document.querySelector("#cycleTemplate"),
  addCycleButton: document.querySelector("#addCycleButton"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  runNowButton: document.querySelector("#runNowButton"),
  resetConfigButton: document.querySelector("#resetConfigButton"),
  copyCommandsButton: document.querySelector("#copyCommandsButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  importJsonInput: document.querySelector("#importJsonInput"),
  commandPreview: document.querySelector("#commandPreview"),
  scheduleSummary: document.querySelector("#scheduleSummary"),
  activeCyclesMetric: document.querySelector("#activeCyclesMetric"),
  totalRunsMetric: document.querySelector("#totalRunsMetric"),
  waitMetric: document.querySelector("#waitMetric"),
  scheduleMetric: document.querySelector("#scheduleMetric"),
  modeValue: document.querySelector("#modeValue"),
  serverStatus: document.querySelector("#serverStatus"),
};

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultState();
    }

    const parsed = JSON.parse(raw);
    return hydrateState(parsed);
  } catch (error) {
    console.warn("Falha ao carregar configuracao salva.", error);
    return getDefaultState();
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
}

function setStatusMessage(message) {
  if (elements.serverStatus) {
    elements.serverStatus.textContent = message;
  }
}

function refreshModeBadge(isHostedReady = false) {
  if (!elements.modeValue) {
    return;
  }

  if (isHostedReady) {
    elements.modeValue.textContent = "Render / Nuvem";
    return;
  }

  if (IS_GITHUB_PAGES) {
    elements.modeValue.textContent = "GitHub Pages";
    return;
  }

  elements.modeValue.textContent = HOSTED_MODE ? "Web" : "Offline";
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function scheduleLabel() {
  if (!state.schedule.enabled || state.schedule.mode === "manual") {
    return "Manual";
  }

  if (state.schedule.mode === "daily") {
    return `Diario ${state.schedule.startTime}`;
  }

  if (state.schedule.mode === "weekly") {
    return `Semanal ${state.schedule.startTime}`;
  }

  return `A cada ${state.schedule.intervalMinutes} min`;
}

function buildScheduleSummary() {
  const { schedule } = state;
  const weekdayNames = WEEKDAYS.filter((day) => schedule.weekdays.includes(day.value)).map((day) => day.label);

  if (!schedule.enabled) {
    return `
      <strong>Agendamento desligado.</strong><br />
      O painel esta pronto, mas o robo so roda quando voce decidir manualmente.
    `;
  }

  if (schedule.mode === "manual") {
    return `
      <strong>Execucao manual.</strong><br />
      Use os ciclos montados abaixo quando quiser disparar o robo.
    `;
  }

  if (schedule.mode === "daily") {
    return `
      <strong>Execucao diaria.</strong><br />
      Inicio previsto: ${schedule.startTime}. Espera entre passos: ${schedule.actionWaitSeconds}s.
    `;
  }

  if (schedule.mode === "weekly") {
    return `
      <strong>Execucao semanal.</strong><br />
      Dias: ${weekdayNames.join(", ") || "nenhum selecionado"}. Inicio: ${schedule.startTime}.
    `;
  }

  return `
    <strong>Execucao intervalada.</strong><br />
    Janela de ${schedule.startTime} ate ${schedule.endTime}, repetindo a cada ${schedule.intervalMinutes} minutos.
  `;
}

function hasTelegramEnabledCycles() {
  return state.cycles.some((cycle) => cycle.enabled && cycle.telegramEnabled);
}

function cycleArgMap(cycle) {
  return [
    ["-Page", cycle.page],
    ["-Filial", cycle.filial],
    ["-Situacao", cycle.situacao],
    ["-TipoCategoria", cycle.tipoCategoria],
    ["-Zona", cycle.zona],
    ["-CentroCusto", cycle.centroCusto],
    ["-Frota", cycle.frota],
    ["-Placa", cycle.placa],
    ["-SupervisorIndex", cycle.supervisorIndex],
    ["-Km", cycle.km],
    ["-Km2", cycle.km2],
    ["-Manutencao", cycle.manutencao],
    ["-Os", cycle.os],
    ["-VenceDia", cycle.venceDia],
  ];
}

function buildCycleCommand(cycle) {
  const parts = [`& ${psQuote(SCRIPT_PATH)}`];

  if (state.schedule.actionWaitSeconds > 0) {
    parts.push(`-ActionWaitSeconds ${state.schedule.actionWaitSeconds}`);
  }

  for (const [flag, value] of cycleArgMap(cycle)) {
    if (value === "" || value == null) {
      continue;
    }

    if (typeof value === "number") {
      parts.push(`${flag} ${value}`);
      continue;
    }

    parts.push(`${flag} ${psQuote(value)}`);
  }

  return parts.join(" ");
}

function buildCommandPreview() {
  const activeCycles = state.cycles.filter((cycle) => cycle.enabled);

  if (!activeCycles.length) {
    return [
      "# Nenhum ciclo ativo.",
      "# Ative pelo menos um ciclo para gerar a sequencia de execucao.",
    ].join("\n");
  }

  const lines = [
    "$env:BENEL_LOGIN_USER='SEU_USUARIO'",
    "$env:BENEL_LOGIN_PASSWORD='SUA_SENHA'",
    "",
    "# 1. Exporte o JSON pelo botao 'Baixar JSON'",
    "# 2. Rode tudo pelo arquivo JSON exportado",
    `& ${psQuote(CONFIG_RUNNER_PATH)} -ConfigPath ${psQuote("C:\\caminho\\benel-guberman-config.json")}`,
    "",
  ];

  if (hasTelegramEnabledCycles()) {
    lines.push(`# Telegram configurado: ${state.integrations.telegram.botToken ? "token preenchido" : "preencher token global"}`);
    lines.push("");
  }

  lines.push(
    "# Ou rode ciclo por ciclo com os comandos abaixo",
    "",
  );

  activeCycles.forEach((cycle, index) => {
    lines.push(`# ${index + 1}. ${cycle.name}`);
    lines.push(`# Repeticoes: ${cycle.repetitions}`);
    lines.push(buildCycleCommand(cycle));

    if (cycle.repetitions > 1) {
      lines.push(`# Esse ciclo deve rodar ${cycle.repetitions} vezes.`);
    }

    if (cycle.notes.trim()) {
      lines.push(`# Observacao: ${cycle.notes.trim()}`);
    }

    if (cycle.telegramEnabled) {
      lines.push(`# Telegram: ${cycle.telegramChatId || "chat nao preenchido"}`);
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}

function refreshMetrics() {
  const activeCycles = state.cycles.filter((cycle) => cycle.enabled);
  const totalRuns = activeCycles.reduce((total, cycle) => total + Number(cycle.repetitions || 0), 0);

  elements.activeCyclesMetric.textContent = String(activeCycles.length);
  elements.totalRunsMetric.textContent = String(totalRuns);
  elements.waitMetric.textContent = `${state.schedule.actionWaitSeconds}s`;
  elements.scheduleMetric.textContent = scheduleLabel();
  elements.scheduleSummary.innerHTML = buildScheduleSummary().trim();
  elements.commandPreview.textContent = buildCommandPreview();
}

function setScheduleInputs() {
  const { schedule } = state;
  elements.scheduleEnabled.value = String(schedule.enabled);
  elements.scheduleMode.value = schedule.mode;
  elements.startTime.value = schedule.startTime;
  elements.endTime.value = schedule.endTime;
  elements.intervalMinutes.value = String(schedule.intervalMinutes);
  elements.actionWaitSeconds.value = String(schedule.actionWaitSeconds);
  elements.telegramBotToken.value = state.integrations.telegram.botToken || "";
}

function listOptionsFor(field) {
  return Array.isArray(REPORT_FILTERS[field]?.options) ? REPORT_FILTERS[field].options : [];
}

function toInputDate(value) {
  if (!value || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return "";
  }

  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function dateValueForInput(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return String(value);
  }

  return toInputDate(String(value || ""));
}

function populateFilterSuggestionLists() {
  Object.entries(FILTER_LIST_IDS).forEach(([field, listId]) => {
    const datalist = document.getElementById(listId);
    if (!datalist) {
      return;
    }

    datalist.innerHTML = "";

    listOptionsFor(field).forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      datalist.appendChild(option);
    });
  });
}

function fieldPlaceholder(field) {
  const optionCount = listOptionsFor(field).length;

  if (!REPORT_FILTERS[field]) {
    return "";
  }

  if (optionCount === 0) {
    return "Digite exatamente como no relatorio";
  }

  if (optionCount === 1) {
    return "1 opcao mapeada do relatorio";
  }

  return `${optionCount} opcoes mapeadas do relatorio`;
}

function applyCycleFieldMetadata(input, field) {
  if (input.tagName !== "INPUT") {
    return;
  }

  if (field === "venceDia" && input.type === "date") {
    const range = REPORT_FILTERS.venceDia?.range || {};
    const min = toInputDate(range.start);
    const max = toInputDate(range.end);

    if (min) {
      input.min = min;
    } else {
      input.removeAttribute("min");
    }

    if (max) {
      input.max = max;
    } else {
      input.removeAttribute("max");
    }

    input.title = range.start && range.end
      ? `Intervalo disponivel no relatorio: ${range.start} ate ${range.end}`
      : "Filtro de data do relatorio 28.";
    return;
  }

  const listId = FILTER_LIST_IDS[field];
  if (!listId) {
    return;
  }

  const optionCount = listOptionsFor(field).length;
  if (optionCount > 0) {
    input.setAttribute("list", listId);
  } else {
    input.removeAttribute("list");
  }

  input.placeholder = fieldPlaceholder(field);
  input.title = optionCount > 0
    ? `${optionCount} opcoes mapeadas diretamente do relatorio 28.`
    : "Campo livre: o BI nao exibiu uma lista fechada para este filtro.";
}

function renderWeekdayButtons() {
  elements.weekdayButtons.innerHTML = "";

  WEEKDAYS.forEach((day) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `weekday-button${state.schedule.weekdays.includes(day.value) ? " is-active" : ""}`;
    button.textContent = day.label;
    button.addEventListener("click", () => {
      const exists = state.schedule.weekdays.includes(day.value);
      state.schedule.weekdays = exists
        ? state.schedule.weekdays.filter((value) => value !== day.value)
        : [...state.schedule.weekdays, day.value];
      render();
    });
    elements.weekdayButtons.appendChild(button);
  });
}

function updateCycle(index, field, rawValue) {
  const cycle = state.cycles[index];
  if (!cycle) {
    return;
  }

  if (field === "enabled") {
    cycle.enabled = rawValue === "true";
  } else if (field === "telegramEnabled") {
    cycle.telegramEnabled = rawValue === "true";
  } else if (field === "page" || field === "repetitions") {
    cycle[field] = Math.max(1, Number(rawValue) || 1);
  } else if (field === "supervisorIndex") {
    cycle.supervisorIndex = rawValue === "" ? "" : Math.min(9, Math.max(1, Number(rawValue) || 1));
  } else {
    cycle[field] = rawValue;
  }

  refreshMetrics();
  saveState();
}

function moveCycle(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.cycles.length) {
    return;
  }

  const nextCycles = [...state.cycles];
  const [picked] = nextCycles.splice(index, 1);
  nextCycles.splice(target, 0, picked);
  state.cycles = nextCycles;
  render();
}

function renderCycles() {
  elements.cyclesList.innerHTML = "";

  state.cycles.forEach((cycle, index) => {
    const node = elements.cycleTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".cycle-title").textContent = cycle.name || `Ciclo ${index + 1}`;

    node.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      const value = cycle[field];
      applyCycleFieldMetadata(input, field);

      if (input.tagName === "SELECT") {
        input.value = String(value);
      } else if (field === "venceDia" && input.type === "date") {
        input.value = dateValueForInput(value);
      } else {
        input.value = value ?? "";
      }

      const handleCycleFieldChange = (event) => {
        updateCycle(index, field, event.target.value);
        if (field === "name") {
          node.querySelector(".cycle-title").textContent = event.target.value || `Ciclo ${index + 1}`;
        }
      };

      input.addEventListener("input", handleCycleFieldChange);
      input.addEventListener("change", handleCycleFieldChange);
    });

    node.querySelector(".remove").addEventListener("click", () => {
      state.cycles.splice(index, 1);
      if (!state.cycles.length) {
        state.cycles.push(createCycle());
      }
      render();
    });

    node.querySelector(".duplicate").addEventListener("click", () => {
      const clone = createCycle({
        ...cycle,
        name: `${cycle.name} copia`,
      });
      state.cycles.splice(index + 1, 0, clone);
      render();
    });

    node.querySelector(".move-up").addEventListener("click", () => moveCycle(index, -1));
    node.querySelector(".move-down").addEventListener("click", () => moveCycle(index, 1));

    elements.cyclesList.appendChild(node);
  });
}

function render() {
  setScheduleInputs();
  populateFilterSuggestionLists();
  renderWeekdayButtons();
  renderCycles();
  refreshMetrics();
  saveState();
}

async function loadServerConfig() {
  if (!HOSTED_MODE) {
    refreshModeBadge(false);
    setStatusMessage("Modo local: configuracao salva no navegador.");
    return;
  }

  if (!SUPPORTS_SERVER_API) {
    refreshModeBadge(false);
    setStatusMessage("GitHub Pages ativo: configuracao salva no navegador e exportada em JSON.");
    render();
    return;
  }

  try {
    const [configResponse, healthResponse] = await Promise.all([
      fetch(SERVER_CONFIG_ENDPOINT, { method: "GET" }),
      fetch(SERVER_HEALTH_ENDPOINT, { method: "GET" }),
    ]);

    if (configResponse.ok) {
      const configPayload = await configResponse.json();
      if (configPayload?.config) {
        state = hydrateState(configPayload.config);
      }
    }

    if (healthResponse.ok) {
      const healthPayload = await healthResponse.json();
      refreshModeBadge(true);
      const lastRun = healthPayload.lastRunAt ? ` Ultima execucao: ${healthPayload.lastRunAt}.` : "";
      setStatusMessage(`Modo hospedado ativo. Fuso: ${healthPayload.timezone || "America/Sao_Paulo"}.${lastRun}`);
    } else {
      refreshModeBadge(false);
      setStatusMessage("Modo web sem API do servidor: usando a configuracao local do navegador.");
    }
  } catch (error) {
    console.warn("Nao consegui carregar a configuracao do servidor.", error);
    refreshModeBadge(false);
    setStatusMessage("Modo web sem conexao com a API: usando a configuracao local do navegador.");
  }

  render();
}

function attachScheduleListeners() {
  elements.scheduleEnabled.addEventListener("change", (event) => {
    state.schedule.enabled = event.target.value === "true";
    refreshMetrics();
    saveState();
  });

  elements.scheduleMode.addEventListener("change", (event) => {
    state.schedule.mode = event.target.value;
    refreshMetrics();
    saveState();
  });

  elements.startTime.addEventListener("input", (event) => {
    state.schedule.startTime = event.target.value;
    refreshMetrics();
    saveState();
  });

  elements.endTime.addEventListener("input", (event) => {
    state.schedule.endTime = event.target.value;
    refreshMetrics();
    saveState();
  });

  elements.intervalMinutes.addEventListener("input", (event) => {
    state.schedule.intervalMinutes = Math.max(5, Number(event.target.value) || 5);
    refreshMetrics();
    saveState();
  });

  elements.actionWaitSeconds.addEventListener("input", (event) => {
    state.schedule.actionWaitSeconds = Math.max(0, Number(event.target.value) || 0);
    refreshMetrics();
    saveState();
  });

  elements.telegramBotToken.addEventListener("input", (event) => {
    state.integrations.telegram.botToken = event.target.value.trim();
    refreshMetrics();
    saveState();
  });
}

async function copyCommands() {
  const payload = buildCommandPreview();

  try {
    await navigator.clipboard.writeText(payload);
    window.alert("Comandos copiados para a area de transferencia.");
  } catch (error) {
    window.alert("Nao consegui copiar automaticamente. O preview ja esta na tela para copia manual.");
  }
}

async function saveConfig() {
  saveState();

  if (!HOSTED_MODE) {
    window.alert("Configuracao salva no navegador.");
    return;
  }

  if (!SUPPORTS_SERVER_API) {
    window.alert("No GitHub Pages a configuracao fica salva no navegador. Use Baixar JSON para levar a configuracao para outra maquina.");
    return;
  }

  try {
    const response = await fetch(SERVER_CONFIG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    setStatusMessage(payload.message || "Configuracao salva no servidor.");
    window.alert("Configuracao salva no servidor.");
  } catch (error) {
    console.warn("Falha ao salvar no servidor.", error);
    window.alert("Nao consegui salvar no servidor. A configuracao local no navegador foi mantida.");
  }
}

async function runNow() {
  if (!HOSTED_MODE) {
    window.alert("A execucao imediata pelo site hospedado so funciona quando o painel estiver rodando no servidor.");
    return;
  }

  if (!SUPPORTS_SERVER_API) {
    window.alert("No GitHub Pages o painel serve para montar e baixar o JSON. A execucao do robo continua sendo local na sua maquina.");
    return;
  }

  try {
    const response = await fetch(SERVER_RUN_NOW_ENDPOINT, { method: "POST" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || `HTTP ${response.status}`);
    }

    setStatusMessage(payload.message || "Execucao iniciada no servidor.");
    window.alert("Execucao iniciada no servidor.");
  } catch (error) {
    window.alert(`Nao consegui iniciar a execucao agora. ${String(error.message || error)}`);
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "benel-guberman-config.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      state = hydrateState(parsed);
      render();
    } catch (error) {
      window.alert("Nao consegui importar esse JSON.");
    }
  };
  reader.readAsText(file);
}

function attachActions() {
  elements.addCycleButton.addEventListener("click", () => {
    state.cycles.push(createCycle({ name: `Ciclo ${state.cycles.length + 1}` }));
    render();
  });

  elements.saveConfigButton.addEventListener("click", saveConfig);
  elements.runNowButton.addEventListener("click", runNow);

  elements.resetConfigButton.addEventListener("click", () => {
    state = getDefaultState();
    render();
  });

  elements.copyCommandsButton.addEventListener("click", copyCommands);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.importJsonInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importJson(file);
    }
    event.target.value = "";
  });
}

attachScheduleListeners();
attachActions();
render();
loadServerConfig();
