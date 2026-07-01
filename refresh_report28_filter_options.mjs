import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const START_URL = "https://integra.benellog.com.br/workspaces";
const WORKSPACE_OPERATION_REPORTS_URL = "https://integra.benellog.com.br/workspaces/detalhes/78";
const PROFILE_DIR = path.join(__dirname, "outputs", "benel-ppbi-profile");
const FILTER_OPTIONS_JS_PATH = path.join(__dirname, "benel-robot-config-site", "filter-options.js");
const FILTER_OPTIONS_JSON_PATH = path.join(__dirname, "outputs", "report28-filter-options.json");

const FILTER_CONFIG = [
  { key: "filial", label: "FILIAL" },
  { key: "zona", label: "ZONA" },
  { key: "situacao", label: "SITUAÇÃO" },
  { key: "centroCusto", label: "CENTRO DE CUSTO" },
  { key: "tipoCategoria", label: "TIPO, CATEGORIA" },
  { key: "frota", label: "FROTA" },
  { key: "placa", label: "PLACA" },
  { key: "km", label: "KM", outputLabel: "KM (campo 1)", occurrence: 0 },
  { key: "km2", label: "KM", outputLabel: "KM (campo 2)", occurrence: 1 },
  { key: "manutencao", label: "MANUTENÇÃO" },
  { key: "os", label: "Nº OS" },
];

function getReportCardByTitle(page, title) {
  const titleLocator = page.getByText(title, { exact: true }).first();
  const reportCard = titleLocator.locator(
    "xpath=ancestor::*[(self::div or self::section or self::article) and (.//a[contains(@href,'/relatorio/detalhes/')] or .//a[.//span[normalize-space()='Abrir']] or .//button[normalize-space()='Abrir'])][1]",
  );

  return { titleLocator, reportCard };
}

async function hardenAutomationFingerprint(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["pt-BR", "pt", "en-US", "en"],
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    window.chrome = window.chrome || { runtime: {} };
  });
}

async function createBrowserContext() {
  try {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    });
    await hardenAutomationFingerprint(context);
    return context;
  } catch {
    const context = await chromium.launchPersistentContext(path.join(__dirname, "outputs", `filter-refresh-${Date.now()}`), {
      channel: "chrome",
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    });
    await hardenAutomationFingerprint(context);
    return context;
  }
}

async function findVisibleLocator(candidates) {
  for (const candidate of candidates) {
    if ((await candidate.count()) === 0) {
      continue;
    }

    const first = candidate.first();
    if (await first.isVisible().catch(() => false)) {
      return first;
    }
  }

  return null;
}

async function ensureVisible(locator, label, timeout = 120000) {
  await locator.first().waitFor({ state: "visible", timeout });
  console.log(`OK: ${label}`);
}

async function detectCaptcha(page) {
  const captchaSignals = [
    page.locator('iframe[src*="recaptcha"]'),
    page.getByText(/captcha/i),
    page.locator('[class*="captcha"]'),
  ];

  return (await findVisibleLocator(captchaSignals)) != null;
}

async function loginIfNeeded(page) {
  const operationTitle = page.getByText(/opera/i);
  if (await operationTitle.first().isVisible().catch(() => false)) {
    return false;
  }

  const usernameField = await findVisibleLocator([
    page.locator('input[type="email"]'),
    page.locator('input[name*="mail" i]'),
    page.locator('input[name*="user" i]'),
    page.locator('input[id*="mail" i]'),
    page.locator('input[id*="user" i]'),
  ]);

  const passwordField = await findVisibleLocator([
    page.locator('input[type="password"]'),
    page.locator('input[name*="senha" i]'),
    page.locator('input[name*="password" i]'),
  ]);

  if (!usernameField || !passwordField) {
    return false;
  }

  if (await detectCaptcha(page)) {
    throw new Error("O portal exibiu CAPTCHA antes do login.");
  }

  const username = process.env.BENEL_LOGIN_USER?.trim();
  const password = process.env.BENEL_LOGIN_PASSWORD ?? "";

  if (!username || !password) {
    throw new Error("Credenciais BENEL_LOGIN_USER e BENEL_LOGIN_PASSWORD sao necessarias.");
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const submitButton = await findVisibleLocator([
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
    page.getByRole("button", { name: /entrar|acessar|login/i }),
  ]);

  if (!submitButton) {
    throw new Error("Nao consegui localizar o botao de login.");
  }

  await submitButton.click();
  await page.waitForTimeout(2500);
  return true;
}

async function gotoWorkspaces(page) {
  await page.goto(START_URL, { waitUntil: "domcontentloaded" });
  const operationTitle = page.getByText(/opera/i);

  try {
    await ensureVisible(operationTitle, "Workspace Operacao", 15000);
  } catch {
    const loginPerformed = await loginIfNeeded(page);
    if (loginPerformed) {
      await page.goto(START_URL, { waitUntil: "domcontentloaded" });
    }

    await ensureVisible(operationTitle, "Workspace Operacao", 300000);
  }
}

async function waitForOperationReportsGallery(page) {
  const { titleLocator, reportCard } = getReportCardByTitle(page, "REL2026 GUBERMAN v.00");
  await ensureVisible(titleLocator, "Card REL2026 GUBERMAN v.00", 120000);

  const openLink = reportCard.locator('a[href*="/relatorio/detalhes/"]').first();
  await ensureVisible(openLink, "Link do REL2026 GUBERMAN v.00", 120000);
}

async function gotoOperationReportsWorkspace(page) {
  await page.goto(WORKSPACE_OPERATION_REPORTS_URL, { waitUntil: "domcontentloaded" });
  const reportsHeader = page.locator("#tituloRelatorioPorWorkspaces").first();
  await ensureVisible(reportsHeader, "Tela de relatorios");
  await waitForOperationReportsGallery(page);
}

async function openGubermanReportDirect(page) {
  const { titleLocator, reportCard } = getReportCardByTitle(page, "REL2026 GUBERMAN v.00");
  await ensureVisible(titleLocator, "Card REL2026 GUBERMAN v.00", 12000);
  const directLink = reportCard.locator('a[href*="/relatorio/detalhes/"]').first();
  await ensureVisible(directLink, "Link do REL2026 GUBERMAN v.00", 12000);

  const href = await directLink.getAttribute("href");
  if (!href) {
    throw new Error("O card do REL2026 foi encontrado, mas o link nao tem href.");
  }

  await page.goto(new URL(href, START_URL).toString(), { waitUntil: "domcontentloaded" });
}

function getPowerBiFrame(page) {
  return page.frames().find((frame) => {
    const url = frame.url();
    return url.startsWith("https://app.powerbi.com/") || url.includes("app.powerbi.com");
  });
}

async function inspectPowerBiScreen(page) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    return { hasPageCounter: false, filterHits: 0, hasVisualSurface: false };
  }

  return powerBiFrame.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    };

    const bodyText = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    const upperText = bodyText.toUpperCase();
    const filterLabels = ["FILIAL", "ZONA", "SITUA", "CENTRO DE CUSTO", "TIPO", "FROTA", "PLACA"];
    const filterHits = filterLabels.filter((label) => upperText.includes(label)).length;
    const hasPageCounter = /\b\d+\s*DE\s*\d+\b/i.test(upperText);
    const hasVisualSurface = Array.from(
      document.querySelectorAll("table, svg, canvas, [role='grid'], .tablix, .pivotTable, .visualContainer"),
    ).some(isVisible);

    return { hasPageCounter, filterHits, hasVisualSurface };
  });
}

async function waitForPowerBiInteractiveScreen(page, label) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const state = await inspectPowerBiScreen(page);
    if (state.hasPageCounter && state.filterHits >= 3 && state.hasVisualSurface) {
      console.log(`OK: ${label} carregada no Power BI`);
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`O Power BI nao terminou de carregar ${label}.`);
}

async function waitForReportViewer(page) {
  await page.waitForURL(/\/relatorio\/detalhes\//, { timeout: 120000 });
  console.log("OK: Visualizacao do relatorio");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (getPowerBiFrame(page)) {
      console.log("OK: Frame do Power BI carregado");
      await waitForPowerBiInteractiveScreen(page, "tela inicial do relatorio");
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("O frame do Power BI nao carregou a tempo.");
}

async function enterFullscreen(page) {
  const fullscreenButton = page.locator('button[title="Tela cheia (F)"]').first();
  if (await fullscreenButton.isVisible().catch(() => false)) {
    await fullscreenButton.click();
  }

  await waitForPowerBiInteractiveScreen(page, "tela em modo cheio");
}

async function openPowerBiPageMenu(page) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    throw new Error("Frame do Power BI nao encontrado para abrir o menu de paginas.");
  }

  const clicked = await powerBiFrame.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a.middleText"));
    const visible = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    });

    const target = visible ?? candidates[0] ?? null;
    if (!target) {
      return false;
    }

    target.click();
    return true;
  });

  if (!clicked) {
    throw new Error("Nao consegui localizar o contador de paginas do Power BI.");
  }
}

async function selectPowerBiSectionByMenu(page, sectionLabel) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    throw new Error("Frame do Power BI nao encontrado para selecionar a secao.");
  }

  const tryClickSection = async () =>
    powerBiFrame.evaluate((label) => {
      const item = Array.from(document.querySelectorAll("button.sectionItem")).find((button) => {
        const aria = (button.getAttribute("aria-label") || "").trim();
        const text = (button.textContent || "").trim();
        return aria === label || text === label;
      });

      if (!item) {
        return false;
      }

      item.click();
      return true;
    }, sectionLabel);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await tryClickSection()) {
      return;
    }

    if (attempt === 0) {
      await openPowerBiPageMenu(page);
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Secao nao encontrada no Power BI: ${sectionLabel}`);
}

async function goToReport28(page) {
  await selectPowerBiSectionByMenu(page, "MANUT. PREV.");
  await waitForPowerBiInteractiveScreen(page, "pagina 28 MANUT. PREV.");
}

async function extractOptionsFromPopup(frame, popupId) {
  return frame.evaluate(async (id) => {
    const popup = document.getElementById(id);
    if (!popup) {
      return [];
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const values = new Set();
    const findScrollable = () =>
      Array.from(popup.querySelectorAll("*")).find((element) => element.scrollHeight > element.clientHeight + 20) || popup;
    const scrollable = findScrollable();

    let stagnant = 0;
    let previousSize = 0;

    for (let step = 0; step < 300; step += 1) {
      popup.querySelectorAll('[role="option"][title], .slicerItemContainer[title]').forEach((element) => {
        const title = (element.getAttribute("title") || "").trim();
        if (title && title !== "Selecionar tudo") {
          values.add(title);
        }
      });

      if (values.size === previousSize) {
        stagnant += 1;
      } else {
        stagnant = 0;
        previousSize = values.size;
      }

      if (stagnant >= 6) {
        break;
      }

      scrollable.scrollTop += Math.max(120, scrollable.clientHeight - 20);
      await sleep(60);
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, popupId);
}

async function extractComboboxOptions(page, label, occurrence = 0) {
  const frame = getPowerBiFrame(page);
  const combobox = frame.locator(`[role="combobox"][aria-label="${label}"]`).nth(occurrence);
  await combobox.click();
  await page.waitForTimeout(300);
  const popupId = await combobox.getAttribute("aria-controls");
  if (!popupId) {
    return [];
  }

  const options = await extractOptionsFromPopup(frame, popupId);
  await combobox.click().catch(() => {});
  await page.waitForTimeout(200);
  return options;
}

async function extractDateRange(page) {
  const frame = getPowerBiFrame(page);
  return frame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input")).filter((input) =>
      (input.getAttribute("aria-label") || "").includes("Intervalo de entrada disponível"),
    );

    const info = inputs.map((input) => {
      const aria = input.getAttribute("aria-label") || "";
      return {
        aria,
        value: input.value || "",
      };
    });

    const combined = info.map((item) => item.aria).join(" ");
    const match = combined.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);

    return {
      inputs: info,
      start: match ? match[1] : "",
      end: match ? match[2] : "",
    };
  });
}

async function main() {
  const context = await createBrowserContext();
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await gotoWorkspaces(page);
    await gotoOperationReportsWorkspace(page);
    await openGubermanReportDirect(page);
    await waitForReportViewer(page);
    await enterFullscreen(page);
    await goToReport28(page);

    const filters = {};
    for (const filter of FILTER_CONFIG) {
      console.log(`Extraindo opcoes de ${filter.label}...`);
      filters[filter.key] = {
        label: filter.outputLabel ?? filter.label,
        type: "datalist",
        sourceLabel: filter.label,
        occurrence: filter.occurrence ?? 0,
        options: await extractComboboxOptions(page, filter.label, filter.occurrence ?? 0),
      };
      console.log(`OK: ${filter.label} -> ${filters[filter.key].options.length} opcoes`);
    }

    const dateRange = await extractDateRange(page);
    filters.venceDia = {
      label: "VENCE DIA",
      type: "date",
      range: {
        start: dateRange.start,
        end: dateRange.end,
      },
      inputs: dateRange.inputs,
    };

    const payload = {
      generatedAt: new Date().toISOString(),
      report: "REL2026 GUBERMAN v.00",
      page: 28,
      section: "MANUT. PREV.",
      filters,
    };

    await fs.mkdir(path.dirname(FILTER_OPTIONS_JS_PATH), { recursive: true });
    await fs.mkdir(path.dirname(FILTER_OPTIONS_JSON_PATH), { recursive: true });

    await fs.writeFile(
      FILTER_OPTIONS_JS_PATH,
      `window.BENEL_FILTER_OPTIONS = ${JSON.stringify(payload, null, 2)};\n`,
      "utf8",
    );
    await fs.writeFile(FILTER_OPTIONS_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`Arquivo JS salvo em: ${FILTER_OPTIONS_JS_PATH}`);
    console.log(`Arquivo JSON salvo em: ${FILTER_OPTIONS_JSON_PATH}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
