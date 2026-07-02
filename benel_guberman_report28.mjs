import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const START_URL = "https://integra.benellog.com.br/workspaces";
const WORKSPACE_OPERATION_REPORTS_URL = "https://integra.benellog.com.br/workspaces/detalhes/78";
const PROFILE_DIR = process.env.BENEL_PROFILE_DIR || path.join(__dirname, "outputs", "benel-ppbi-profile");
const SCREENSHOT_DIR = process.env.BENEL_SCREENSHOT_DIR || path.join(__dirname, "outputs", "benel-ppbi-screenshots");
const TARGET_REPORT_PAGE = 28;
const HEADLESS = /^true$/i.test(process.env.BENEL_HEADLESS || "false");
const SUPERVISOR_COUNT = 9;
const SUPERVISOR_PRIMARY_SELECTOR = "svg image";
const SUPERVISOR_FALLBACK_SELECTOR = "img";

function parseArgs(argv) {
  const options = {
    page: TARGET_REPORT_PAGE,
    keepOpen: false,
    screenshot: true,
    actionWaitMs: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];

    if (!part.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const nextValue = argv[index + 1];

    if (key === "keep-open") {
      options.keepOpen = true;
      continue;
    }

    if (key === "no-screenshot") {
      options.screenshot = false;
      continue;
    }

    if (nextValue == null || nextValue.startsWith("--")) {
      throw new Error(`O argumento --${key} precisa de um valor.`);
    }

    index += 1;

    switch (key) {
      case "filial":
        options.filial = nextValue;
        break;
      case "zona":
        options.zona = nextValue;
        break;
      case "situacao":
        options.situacao = nextValue;
        break;
      case "centro-custo":
        options.centroCusto = nextValue;
        break;
      case "tipo-categoria":
        options.tipoCategoria = nextValue;
        break;
      case "frota":
        options.frota = nextValue;
        break;
      case "placa":
        options.placa = nextValue;
        break;
      case "km":
        options.km = nextValue;
        break;
      case "km2":
        options.km2 = nextValue;
        break;
      case "manutencao":
        options.manutencao = nextValue;
        break;
      case "os":
        options.os = nextValue;
        break;
      case "vence-dia":
        options.venceDia = nextValue;
        break;
      case "supervisor":
        options.supervisorIndex = Number(nextValue);
        if (!Number.isInteger(options.supervisorIndex) || options.supervisorIndex < 1 || options.supervisorIndex > 9) {
          throw new Error("O argumento --supervisor precisa ser um numero inteiro entre 1 e 9.");
        }
        break;
      case "page":
        options.page = Number(nextValue);
        if (!Number.isInteger(options.page) || options.page <= 0) {
          throw new Error("O argumento --page precisa ser um numero inteiro positivo.");
        }
        break;
      case "action-wait-seconds":
        options.actionWaitMs = Number(nextValue) * 1000;
        if (!Number.isFinite(options.actionWaitMs) || options.actionWaitMs < 0) {
          throw new Error("O argumento --action-wait-seconds precisa ser um numero maior ou igual a zero.");
        }
        break;
      default:
        throw new Error(`Argumento desconhecido: --${key}`);
    }
  }

  return options;
}

async function pauseBetweenActions(page, options, label) {
  if (!options.actionWaitMs) {
    return;
  }

  const seconds = Math.round(options.actionWaitMs / 1000);
  console.log(`Aguardando ${seconds} segundos apos: ${label}`);
  await page.waitForTimeout(options.actionWaitMs);
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
      channel: HEADLESS ? undefined : "chrome",
      headless: HEADLESS,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    });
    await hardenAutomationFingerprint(context);
    return context;
  } catch (error) {
    console.warn("Nao foi possivel abrir o perfil persistente principal do Google Chrome.");
    console.warn(String(error.message || error));
  }

  try {
    const fallbackProfileDir = path.join(__dirname, "outputs", `benel-ppbi-profile-fallback-${Date.now()}`);
    console.warn(`Tentando novamente com um perfil temporario do Chrome: ${fallbackProfileDir}`);
    const context = await chromium.launchPersistentContext(fallbackProfileDir, {
      channel: HEADLESS ? undefined : "chrome",
      headless: HEADLESS,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    });
    await hardenAutomationFingerprint(context);
    return context;
  } catch (error) {
    console.warn("Nao foi possivel abrir o Google Chrome diretamente. Usando o Chromium do Playwright.");
    console.warn(String(error.message || error));

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: HEADLESS,
      viewport: HEADLESS ? { width: 1600, height: 900 } : null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
    });
    await hardenAutomationFingerprint(context);
    return context;
  }
}

async function ensureVisible(locator, label, timeout = 120000) {
  await locator.first().waitFor({ state: "visible", timeout });
  console.log(`OK: ${label}`);
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

function getReportCardByTitle(page, title) {
  const titleLocator = page.getByText(title, { exact: true }).first();
  const reportCard = titleLocator.locator(
    "xpath=ancestor::*[(self::div or self::section or self::article) and (.//a[contains(@href,'/relatorio/detalhes/')] or .//a[.//span[normalize-space()='Abrir']] or .//button[normalize-space()='Abrir'])][1]",
  );

  return { titleLocator, reportCard };
}

async function detectCaptcha(page) {
  const captchaSignals = [
    page.locator('iframe[src*="recaptcha"]'),
    page.getByText(/captcha/i),
    page.locator('[class*="captcha"]'),
  ];

  return (await findVisibleLocator(captchaSignals)) != null;
}

async function activateOpenAction(page, locator) {
  const href = await locator.getAttribute("href").catch(() => null);
  if (href) {
    const targetUrl = new URL(href, START_URL).toString();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    return;
  }

  await locator.click();
  await page.waitForTimeout(1500);
}

function getPowerBiFrame(page) {
  return page.frames().find((frame) => {
    const url = frame.url();
    return url.startsWith("https://app.powerbi.com/") || url.includes("app.powerbi.com");
  });
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
    page.getByLabel(/e-?mail/i),
    page.getByLabel(/usu[aá]rio/i),
    page.getByPlaceholder(/e-?mail/i),
    page.getByPlaceholder(/usu[aá]rio/i),
  ]);

  const passwordField = await findVisibleLocator([
    page.locator('input[type="password"]'),
    page.locator('input[name*="senha" i]'),
    page.locator('input[name*="password" i]'),
    page.getByLabel(/senha/i),
    page.getByPlaceholder(/senha/i),
  ]);

  if (!usernameField || !passwordField) {
    return false;
  }

  if (await detectCaptcha(page)) {
    throw new Error("O portal exibiu um CAPTCHA antes do login. Preciso que voce resolva isso manualmente.");
  }

  const username = process.env.BENEL_LOGIN_USER?.trim();
  const password = process.env.BENEL_LOGIN_PASSWORD ?? "";

  if (!username || !password) {
    throw new Error("O portal pediu login, mas as credenciais nao foram fornecidas para esta execucao.");
  }

  console.log("Preenchendo login no portal...");
  await usernameField.fill(username);
  await passwordField.fill(password);

  const submitButton = await findVisibleLocator([
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
    page.getByRole("button", { name: /entrar/i }),
    page.getByRole("button", { name: /acessar/i }),
    page.getByRole("button", { name: /login/i }),
    page.getByText(/entrar/i),
  ]);

  if (!submitButton) {
    throw new Error("Nao consegui localizar o botao de login.");
  }

  await submitButton.click();
  await page.waitForTimeout(2000);

  if (await detectCaptcha(page)) {
    throw new Error("O portal exibiu um CAPTCHA apos preencher o login. Preciso que voce resolva isso manualmente.");
  }

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

async function clickSingleOpenButton(page) {
  const candidates = [
    page.getByRole("button", { name: "Abrir" }),
    page.getByRole("link", { name: "Abrir" }),
    page.locator('a:has-text("Abrir"), button:has-text("Abrir")'),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count();
    if (count === 1) {
      await candidate.first().click();
      return true;
    }
  }

  return false;
}

async function openOperationWorkspace(page) {
  console.log("Abrindo o workspace Operacao...");

  if (await clickSingleOpenButton(page)) {
    return;
  }

  const operationCard = page
    .locator("div, section, article")
    .filter({ hasText: /opera/i })
    .filter({ hasText: /relat/i })
    .first();

  const cardOpenAction = await findVisibleLocator([
    operationCard.getByRole("button", { name: "Abrir" }),
    operationCard.getByRole("link", { name: "Abrir" }),
    operationCard.locator('a:has-text("Abrir"), button:has-text("Abrir")'),
    operationCard.locator('a[href*="/workspaces/detalhes/"]'),
    page.locator('a.btnAbrirWorkspaces[href*="/workspaces/detalhes/"]'),
  ]);

  if (cardOpenAction) {
    await activateOpenAction(page, cardOpenAction);
    return;
  }

  throw new Error("Nao consegui localizar o botao Abrir do workspace Operacao.");
}

async function openGubermanReport(page) {
  console.log("Abrindo REL2026 GUBERMAN v.00...");

  const { titleLocator, reportCard } = getReportCardByTitle(page, "REL2026 GUBERMAN v.00");
  await ensureVisible(titleLocator, "Card REL2026 GUBERMAN v.00");

  const scopedAction = await findVisibleLocator([
    reportCard.getByRole("button", { name: "Abrir" }),
    reportCard.getByRole("link", { name: "Abrir" }),
    reportCard.locator('a:has-text("Abrir"), button:has-text("Abrir")'),
    reportCard.locator('a[href*="/relatorio/detalhes/"]'),
  ]);

  if (scopedAction) {
    await activateOpenAction(page, scopedAction);
    return;
  }

  const fallbackActions = page.locator('a:has-text("Abrir"), button:has-text("Abrir")');
  if ((await fallbackActions.count()) >= 3) {
    await activateOpenAction(page, fallbackActions.nth(2));
    return;
  }

  throw new Error("Nao consegui localizar o botao Abrir do REL2026 GUBERMAN v.00.");
}

async function waitForOperationReportsGallery(page) {
  const { titleLocator, reportCard } = getReportCardByTitle(page, "REL2026 GUBERMAN v.00");
  await ensureVisible(titleLocator, "Card REL2026 GUBERMAN v.00", 120000);

  const openLink = reportCard.locator('a[href*="/relatorio/detalhes/"]').first();
  await ensureVisible(openLink, "Link do REL2026 GUBERMAN v.00", 120000);

  await page.waitForFunction(
    (selector) => {
      const link = document.querySelector(selector);
      if (!link) {
        return false;
      }

      const href = link.getAttribute("href") || "";
      return href.includes("/relatorio/detalhes/");
    },
    'a[href*="/relatorio/detalhes/"]',
    { timeout: 120000 },
  );

  console.log("OK: Galeria de relatorios carregada");
}

async function gotoOperationReportsWorkspace(page) {
  console.log("Abrindo a lista de relatorios da Operacao...");
  await page.goto(WORKSPACE_OPERATION_REPORTS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const reportsHeader = page.locator("#tituloRelatorioPorWorkspaces").first();
  await ensureVisible(reportsHeader, "Tela de relatorios");
  await waitForOperationReportsGallery(page);
}

async function openGubermanReportDirect(page) {
  console.log("Abrindo REL2026 GUBERMAN v.00...");

  const { titleLocator, reportCard } = getReportCardByTitle(page, "REL2026 GUBERMAN v.00");
  await ensureVisible(titleLocator, "Card REL2026 GUBERMAN v.00", 12000);
  const directLink = reportCard.locator('a[href*="/relatorio/detalhes/"]').first();
  await ensureVisible(directLink, "Link do REL2026 GUBERMAN v.00", 12000);

  const href = await directLink.getAttribute("href");
  if (!href) {
    throw new Error("O card do REL2026 foi encontrado, mas o link do relatorio nao tem href.");
  }

  const targetUrl = new URL(href, START_URL).toString();
  console.log(`URL dinamica do REL2026 detectada: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
}

async function openGubermanReportWithFallback(page) {
  try {
    await openGubermanReport(page);

    const navigatedByCard = await page
      .waitForURL(/\/relatorio\/detalhes\//, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    if (navigatedByCard) {
      await page.waitForTimeout(3000);
      return;
    }

    console.warn("O clique no card do REL2026 nao concluiu a navegacao a tempo. Tentando a URL direta.");
  } catch (error) {
    console.warn("Falha ao abrir o card do REL2026. Tentando a URL direta.");
    console.warn(String(error.message || error));
  }

  await openGubermanReportDirect(page);
}

async function waitForReportViewer(page) {
  await page.waitForURL(/\/relatorio\/detalhes\//, { timeout: 120000 });
  await page.waitForTimeout(3000);
  console.log("OK: Visualizacao do relatorio");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (getPowerBiFrame(page)) {
      console.log("OK: Frame do Power BI carregado");
      await waitForPowerBiInteractiveScreen(page, "tela inicial do relatorio");
      return;
    }

    await page.waitForTimeout(1000);
  }

  const knownFrames = page
    .frames()
    .map((frame) => frame.url())
    .filter(Boolean);
  console.warn("Frames detectados na pagina:");
  console.warn(knownFrames.join("\n") || "Nenhum frame com URL disponivel.");
  throw new Error("O frame do Power BI nao carregou a tempo.");
}

async function inspectPowerBiScreen(page) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    return {
      hasPageCounter: false,
      filterHits: 0,
      hasVisualSurface: false,
      visibleLoadingIndicators: 0,
      hasError: false,
      snippet: "",
    };
  }

  return powerBiFrame.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        !element.hasAttribute("hidden")
      );
    };

    const bodyText = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    const upperText = bodyText.toUpperCase();
    const filterLabels = ["FILIAL", "ZONA", "SITUA", "CENTRO DE CUSTO", "TIPO", "FROTA", "PLACA"];
    const filterHits = filterLabels.filter((label) => upperText.includes(label)).length;
    const hasPageCounter = /\b\d+\s*DE\s*\d+\b/i.test(upperText);
    const hasVisualSurface = Array.from(
      document.querySelectorAll("table, svg, canvas, [role='grid'], .tablix, .pivotTable, .visualContainer"),
    ).some(isVisible);
    const loadingSelector = [
      '[class*="spinner"]',
      '[class*="Spinner"]',
      '[class*="loading"]',
      '[class*="Loading"]',
      '[class*="loader"]',
      '[class*="Loader"]',
      '[class*="progress"]',
      '[class*="Progress"]',
      '[class*="wait"]',
      '[class*="Wait"]',
      '[aria-label*="carreg"]',
      '[aria-label*="Carreg"]',
      '[aria-label*="loading"]',
      '[aria-label*="Loading"]',
      '[title*="carreg"]',
      '[title*="Carreg"]',
      '[title*="loading"]',
      '[title*="Loading"]',
    ].join(", ");
    const visibleLoadingIndicators = Array.from(document.querySelectorAll(loadingSelector)).filter((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      return area > 0 && area < 200000;
    }).length;
    const hasError = /N[AÃ]O FOI POSS[IÍ]VEL CARREGAR ESTE RELAT[OÓ]RIO|ATUALIZE A P[AÁ]GINA OU ENTRE NOVAMENTE/i.test(
      upperText,
    );

    return {
      hasPageCounter,
      filterHits,
      hasVisualSurface,
      visibleLoadingIndicators,
      hasError,
      snippet: bodyText.slice(0, 400),
    };
  });
}

async function waitForPowerBiInteractiveScreen(page, label) {
  let lastState = null;
  let consecutiveReadyChecks = 0;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    lastState = await inspectPowerBiScreen(page);

    const isReady =
      lastState.hasPageCounter &&
      lastState.filterHits >= 3 &&
      lastState.hasVisualSurface &&
      lastState.visibleLoadingIndicators === 0;

    if (isReady) {
      consecutiveReadyChecks += 1;
    } else {
      consecutiveReadyChecks = 0;
    }

    if (consecutiveReadyChecks >= 3) {
      console.log(`OK: ${label} carregada no Power BI`);
      return;
    }

    await page.waitForTimeout(1000);
  }

  if (lastState?.hasError) {
    throw new Error(`O Power BI exibiu erro ao carregar a ${label}.`);
  }

  throw new Error(
    `O Power BI nao terminou de carregar a ${label}. ` +
      `Estado final: contador=${lastState?.hasPageCounter}, filtros=${lastState?.filterHits}, ` +
      `visual=${lastState?.hasVisualSurface}, carregando=${lastState?.visibleLoadingIndicators}.`,
  );
}

async function enterFullscreen(page) {
  const fullscreenButton = page.locator('button[title="Tela cheia (F)"]').first();
  if (await fullscreenButton.isVisible().catch(() => false)) {
    console.log("Abrindo o relatorio em tela cheia...");
    await fullscreenButton.click();
    await page.waitForTimeout(8000);
  }

  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    throw new Error("Nao encontrei o frame do Power BI apos entrar em tela cheia.");
  }

  await page.mouse.click(800, 450).catch(() => {});
  await page.waitForTimeout(1500);
  await waitForPowerBiInteractiveScreen(page, "tela em modo cheio");
}

async function readViewerPageCounter(page) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    return null;
  }

  const content = await powerBiFrame.locator("body").innerText();
  const compact = content.replace(/\s+/g, "");
  const match = compact.match(/(\d+)de(\d+)/i);
  if (!match) {
    return null;
  }

  return {
    current: Number(match[1]),
    total: Number(match[2]),
  };
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
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        !el.hasAttribute("hidden")
      );
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

  await page.waitForTimeout(1500);
}

async function closePowerBiPageMenu(page) {
  const powerBiFrame = getPowerBiFrame(page);
  if (!powerBiFrame) {
    return;
  }

  const menuVisible = await powerBiFrame.evaluate(() =>
    Array.from(document.querySelectorAll("button.sectionItem")).some((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        !button.hasAttribute("hidden")
      );
    })
  );

  if (!menuVisible) {
    return;
  }

  const toggled = await powerBiFrame.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a.middleText"));
    const visible = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        !el.hasAttribute("hidden")
      );
    });

    const target = visible ?? candidates[0] ?? null;
    if (!target) {
      return false;
    }

    target.click();
    return true;
  });

  if (!toggled) {
    await powerBiFrame.locator("body").click({ position: { x: 80, y: 80 } }).catch(() => {});
  }

  await page.waitForTimeout(1200);
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

  let clickedDirectly = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clickedDirectly = await tryClickSection();
    if (clickedDirectly) {
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (!clickedDirectly) {
    await openPowerBiPageMenu(page);
    let clickedFromMenu = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      clickedFromMenu = await tryClickSection();
      if (clickedFromMenu) {
        break;
      }

      await page.waitForTimeout(1000);
    }

    if (!clickedFromMenu) {
      throw new Error(`Secao nao encontrada no Power BI: ${sectionLabel}`);
    }
  }

  await page.waitForTimeout(6000);
  await closePowerBiPageMenu(page);
  console.log(`OK: Secao ${sectionLabel} selecionada no menu inferior`);
}

async function pressViewerNavigationKey(page, direction) {
  const powerBiFrame = getPowerBiFrame(page);
  const viewer = powerBiFrame ? powerBiFrame.locator("body") : page.locator("body");
  await viewer.click({ position: { x: 900, y: 400 } }).catch(() => {});

  if (direction === "next") {
    await page.keyboard.press("ArrowRight").catch(() => {});
    await page.keyboard.press("PageDown").catch(() => {});
    return;
  }

  await page.keyboard.press("ArrowLeft").catch(() => {});
  await page.keyboard.press("PageUp").catch(() => {});
}

async function clickCoordinateFallback(page, direction) {
  const viewport = page.viewportSize() ?? { width: 1600, height: 900 };

  const coordinates =
    direction === "next"
      ? { x: Math.round(viewport.width * 0.57), y: Math.round(viewport.height * 0.98) }
      : { x: Math.round(viewport.width * 0.5), y: Math.round(viewport.height * 0.98) };

  await page.mouse.click(coordinates.x, coordinates.y);
}

async function clickPageArrow(page, direction) {
  const powerBiFrame = getPowerBiFrame(page);
  if (powerBiFrame) {
    const selector =
      direction === "next" ? 'button[aria-label="Próxima Página"]' : 'button[aria-label="Página Anterior"]';
    const button = powerBiFrame.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }

  const selectors =
    direction === "next"
      ? [
          'button[aria-label*="Próx"]',
          'button[aria-label*="proxim"]',
          'button[title*="Próx"]',
          'button[aria-label*="Next"]',
          'button[title*="Next"]',
          '[role="button"][aria-label*="Próx"]',
          '[role="button"][aria-label*="Next"]',
        ]
      : [
          'button[aria-label*="Ant"]',
          'button[aria-label*="anter"]',
          'button[title*="Ant"]',
          'button[aria-label*="Prev"]',
          'button[title*="Prev"]',
          '[role="button"][aria-label*="Ant"]',
          '[role="button"][aria-label*="Prev"]',
        ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.click();
      return true;
    }
  }

  await clickCoordinateFallback(page, direction);
  await page.waitForTimeout(400);
  await pressViewerNavigationKey(page, direction);
  return true;
}

async function goToReportPage(page, targetPage) {
  console.log(`Indo para a pagina ${targetPage} do relatorio...`);

  if (targetPage === 28) {
    await selectPowerBiSectionByMenu(page, "MANUT. PREV.");
    const directCounter = await readViewerPageCounter(page);
    if (directCounter?.current === 28) {
      console.log(`Pagina atual detectada: ${directCounter.current} de ${directCounter.total}`);
      return;
    }

    console.log("A secao MANUT. PREV. foi aberta. Seguindo mesmo sem confirmar o contador automaticamente.");
    return;
  }

  let counter = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    counter = await readViewerPageCounter(page);
    if (counter) {
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (!counter) {
    console.warn("Nao consegui ler o contador de paginas automaticamente. Mantendo a pagina atual.");
    return;
  }

  console.log(`Pagina atual detectada: ${counter.current} de ${counter.total}`);

  const direction = counter.current <= targetPage ? "next" : "previous";
  let attempts = 0;

  while (counter.current !== targetPage && attempts < counter.total + 5) {
    attempts += 1;
    await clickPageArrow(page, direction);
    await page.waitForTimeout(900);

    const nextCounter = await readViewerPageCounter(page);
    if (!nextCounter) {
      continue;
    }

    counter = nextCounter;
    console.log(`Pagina atual detectada: ${counter.current} de ${counter.total}`);
  }

  if (counter.current !== targetPage) {
    throw new Error(
      `Nao consegui chegar automaticamente na pagina ${targetPage}. Ultima pagina detectada: ${counter.current}.`,
    );
  }
}

function legacyBuildFilterDefinitions(options) {
  return [
    { label: "FILIAL", matcher: /filial/i, comboboxLabel: "FILIAL", value: options.filial },
    { label: "ZONA", matcher: /zona/i, comboboxLabel: "ZONA", value: options.zona },
    { label: "SITUACAO", matcher: /situa/i, comboboxLabel: "SITUAÇÃO", value: options.situacao },
    { label: "CENTRO DE CUSTO", matcher: /centro de custo/i, comboboxLabel: "CENTRO DE CUSTO", value: options.centroCusto },
    { label: "TIPO, CATEGORIA", matcher: /tipo,\s*categoria/i, comboboxLabel: "TIPO, CATEGORIA", value: options.tipoCategoria },
    { label: "FROTA", matcher: /frota/i, comboboxLabel: "FROTA", value: options.frota },
    { label: "PLACA", matcher: /placa/i, comboboxLabel: "PLACA", value: options.placa },
    { label: "KM (campo 1)", matcher: /^km$/i, comboboxLabel: "KM", value: options.km, occurrence: 0 },
    { label: "KM (campo 2)", matcher: /^km$/i, comboboxLabel: "KM", value: options.km2, occurrence: 1 },
    { label: "MANUTENCAO", matcher: /manuten/i, comboboxLabel: "MANUTENÇÃO", value: options.manutencao },
    { label: "N OS", matcher: /n.? ?os/i, comboboxLabel: "Nº OS", value: options.os },
    { label: "VENCE DIA", matcher: /vence dia/i, comboboxLabel: "VENCE DIA", value: options.venceDia },
  ].filter((item) => item.value != null && item.value !== "");
}

async function legacyTrySelectOption(surface, locator, value) {
  await locator.click();

  const popupId = await locator.getAttribute("aria-controls").catch(() => null);
  if (popupId) {
    const popup = surface.locator(`#${popupId}`).first();
    await popup.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if ((await popup.count()) > 0 && (await popup.isVisible().catch(() => false))) {
      const searchInput = popup.locator('input[aria-label="Pesquisar"]').first();
      if ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false))) {
        await searchInput.fill(value).catch(() => {});
      }

      const scopedCandidates = [
        popup.locator(`[role="option"][title="${value}"]`),
        popup.locator(`.slicerItemContainer[title="${value}"]`),
        popup.locator(`[role="option"]`).filter({ hasText: value }),
        popup.getByText(value, { exact: true }),
      ];

      for (const optionLocator of scopedCandidates) {
        if ((await optionLocator.count()) > 0 && (await optionLocator.first().isVisible().catch(() => false))) {
          const option = optionLocator.first();
          await option.evaluate((node) => node.click()).catch(async () => {
            await option.click();
          });
          await locator.waitFor({ state: "visible", timeout: 1000 }).catch(() => {});
          await locator.click().catch(() => {});
          return true;
        }
      }
    }
  }

  const optionCandidates = [
    surface.locator(`[role="listbox"] [role="option"]`).filter({ hasText: value }),
    surface.locator(`[role="listbox"] *`).filter({ hasText: value }),
    surface.locator(`li`).filter({ hasText: value }),
    surface.locator(`div[role="option"]`).filter({ hasText: value }),
    surface.locator(`[role="menu"] *`).filter({ hasText: value }),
  ];

  for (const optionLocator of optionCandidates) {
    if ((await optionLocator.count()) > 0 && (await optionLocator.first().isVisible().catch(() => false))) {
      const option = optionLocator.first();
      await option.evaluate((node) => node.click()).catch(async () => {
        await option.click();
      });
      return true;
    }
  }

  return false;
}

function legacyNormalizeFilterValue(filter) {
  if (filter.comboboxLabel === "VENCE DIA" && /^\d{4}-\d{2}-\d{2}$/.test(String(filter.value))) {
    const [year, month, day] = String(filter.value).split("-");
    return `${day}/${month}/${year}`;
  }

  return String(filter.value);
}

async function legacySetFilterValue(surface, filter) {
  const normalizedValue = normalizeFilterValue(filter);
  console.log(`Aplicando filtro ${filter.label}: ${normalizedValue}`);
  const occurrence = filter.occurrence ?? 0;

  const locatorCandidates = [
    surface.locator(`[role="combobox"][aria-label="${filter.comboboxLabel}"]`).nth(occurrence),
    surface.locator(`input[aria-label="${filter.comboboxLabel}"]`).nth(occurrence),
    surface.getByLabel(filter.matcher).nth(occurrence),
    surface
      .getByText(filter.matcher)
      .nth(occurrence)
      .locator("xpath=following::*[(self::input or self::select)][1]"),
    surface
      .getByText(filter.matcher)
      .nth(occurrence)
      .locator("xpath=following::*[(self::input or self::button or @role='combobox' or @role='button') and not(@disabled)][1]"),
  ];

  for (const candidate of locatorCandidates) {
    if ((await candidate.count()) === 0) {
      continue;
    }

    const first = candidate.first();
    if (!(await first.isVisible().catch(() => false))) {
      continue;
    }

    console.log(`OK: Filtro ${filter.label}`);

    const tagName = await first.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");
    if (tagName === "select") {
      await first.selectOption({ label: normalizedValue }).catch(async () => {
        await first.selectOption(normalizedValue);
      });
      return;
    }

    if (tagName === "input") {
      await first.fill("");
      await first.fill(normalizedValue);
      await first.press("Enter").catch(() => {});
      return;
    }

    if (await trySelectOption(surface, first, normalizedValue)) {
      return;
    }
  }

  throw new Error(`Nao consegui aplicar o filtro ${filter.label} com o valor ${normalizedValue}.`);
}

async function legacyApplyOptionalFilters(page, options) {
  const filters = buildFilterDefinitions(options);
  if (filters.length === 0) {
    console.log("Nenhum filtro opcional foi informado. Mantendo os filtros visiveis na tela.");
    return;
  }

  const surface = getPowerBiFrame(page) ?? page;
  for (const filter of filters) {
    await setFilterValue(surface, filter);
    await pauseBetweenActions(page, options, `filtro ${filter.label}`);
  }
}

function buildFilterDefinitions(options) {
  return [
    { label: "FILIAL", controlType: "dropdown", comboboxLabel: "FILIAL", value: options.filial },
    { label: "ZONA", controlType: "dropdown", comboboxLabel: "ZONA", value: options.zona },
    { label: "SITUACAO", controlType: "dropdown", comboboxLabel: "SITUAÇÃO", value: options.situacao },
    { label: "CENTRO DE CUSTO", controlType: "dropdown", comboboxLabel: "CENTRO DE CUSTO", value: options.centroCusto },
    { label: "TIPO, CATEGORIA", controlType: "dropdown", comboboxLabel: "TIPO, CATEGORIA", value: options.tipoCategoria },
    { label: "FROTA", controlType: "dropdown", comboboxLabel: "FROTA", value: options.frota },
    { label: "PLACA", controlType: "dropdown", comboboxLabel: "PLACA", value: options.placa },
    { label: "KM (campo 1)", controlType: "dropdown", comboboxLabel: "KM", value: options.km, occurrence: 0 },
    { label: "KM (campo 2)", controlType: "dropdown", comboboxLabel: "KM", value: options.km2, occurrence: 1 },
    { label: "MANUTENCAO", controlType: "dropdown", comboboxLabel: "MANUTENÇÃO", value: options.manutencao },
    { label: "N OS", controlType: "dropdown", comboboxLabel: "Nº OS", value: options.os },
    { label: "VENCE DIA", controlType: "date", inputLabelPrefix: "Data de início.", value: options.venceDia },
  ].filter((item) => item.value != null && item.value !== "");
}

async function waitForReport28FiltersReady(page) {
  const surface = getPowerBiFrame(page);
  if (!surface) {
    throw new Error("Frame do Power BI nao encontrado para validar os filtros da pagina 28.");
  }

  const requiredLocators = [
    surface.locator('[role="combobox"][aria-label="FILIAL"]').first(),
    surface.locator('[role="combobox"][aria-label="ZONA"]').first(),
    surface.locator('[role="combobox"][aria-label="SITUAÇÃO"]').first(),
    surface.locator('[role="combobox"][aria-label="CENTRO DE CUSTO"]').first(),
    surface.locator('[role="combobox"][aria-label="TIPO, CATEGORIA"]').first(),
    surface.locator('[role="combobox"][aria-label="FROTA"]').first(),
    surface.locator('[role="combobox"][aria-label="PLACA"]').first(),
    surface.locator('[role="combobox"][aria-label="KM"]').nth(0),
    surface.locator('[role="combobox"][aria-label="KM"]').nth(1),
    surface.locator('[role="combobox"][aria-label="MANUTENÇÃO"]').first(),
    surface.locator('[role="combobox"][aria-label="Nº OS"]').first(),
    surface.locator('input[aria-label^="Data de início."]').first(),
  ];

  for (const locator of requiredLocators) {
    await locator.waitFor({ state: "visible", timeout: 120000 });
  }

  await page.waitForTimeout(1500);
  console.log("OK: Barra de filtros da pagina 28 carregada");
}

function getFilterLocator(surface, filter) {
  const occurrence = filter.occurrence ?? 0;

  if (filter.controlType === "date") {
    return surface.locator(`input[aria-label^="${filter.inputLabelPrefix}"]`).first();
  }

  return surface.locator(`[role="combobox"][aria-label="${filter.comboboxLabel}"]`).nth(occurrence);
}

async function waitForDropdownOptions(page, popup, label) {
  await popup.waitFor({ state: "visible", timeout: 10000 });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const optionCount = await popup.locator('[role="option"], .slicerItemContainer').count();
    if (optionCount > 0) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`O popup do filtro ${label} abriu, mas as opcoes nao carregaram.`);
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDigitsOnly(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

function textMatchesExpectedValue(currentValue, expectedValue) {
  const currentNormalized = normalizeComparableText(currentValue);
  const expectedNormalized = normalizeComparableText(expectedValue);

  if (!currentNormalized || !expectedNormalized) {
    return false;
  }

  if (currentNormalized === expectedNormalized || currentNormalized.includes(expectedNormalized)) {
    return true;
  }

  const currentDigits = normalizeDigitsOnly(currentValue);
  const expectedDigits = normalizeDigitsOnly(expectedValue);

  if (currentDigits && expectedDigits && currentDigits === expectedDigits) {
    return true;
  }

  return false;
}

async function listDropdownOptions(popup) {
  return popup.locator('[role="option"], .slicerItemContainer').evaluateAll((nodes) =>
    nodes.map((node, index) => {
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      const title = (node.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      return {
        index,
        text,
        title,
      };
    }),
  );
}

function findMatchingDropdownOption(options, expectedValue) {
  const exactMatch = options.find(
    (option) =>
      textMatchesExpectedValue(option.title, expectedValue) || textMatchesExpectedValue(option.text, expectedValue),
  );

  if (exactMatch) {
    return exactMatch;
  }

  const expectedNormalized = normalizeComparableText(expectedValue);
  if (!expectedNormalized) {
    return null;
  }

  return (
    options.find((option) => normalizeComparableText(option.title).includes(expectedNormalized)) ||
    options.find((option) => normalizeComparableText(option.text).includes(expectedNormalized)) ||
    null
  );
}

async function waitForDropdownValue(page, locator, expectedValue, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const text = ((await locator.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (textMatchesExpectedValue(text, expectedValue)) {
      console.log(`OK: Filtro ${label} confirmado com ${expectedValue}`);
      return;
    }

    await page.waitForTimeout(250);
  }

  const currentText = ((await locator.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  throw new Error(`O filtro ${label} nao confirmou o valor ${expectedValue}. Valor atual: ${currentText || "vazio"}.`);
}

async function waitForInputValue(page, locator, expectedValue, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = (await locator.inputValue().catch(() => "")) || "";
    if (value === expectedValue) {
      console.log(`OK: Filtro ${label} confirmado com ${expectedValue}`);
      return;
    }

    await page.waitForTimeout(250);
  }

  const currentValue = (await locator.inputValue().catch(() => "")) || "";
  throw new Error(`O filtro ${label} nao confirmou o valor ${expectedValue}. Valor atual: ${currentValue || "vazio"}.`);
}

async function selectDropdownValue(page, surface, locator, filter, normalizedValue) {
  await locator.click();

  const popupId = await locator.getAttribute("aria-controls").catch(() => null);
  if (!popupId) {
    throw new Error(`Nao encontrei o popup do filtro ${filter.label}.`);
  }

  const popup = surface.locator(`#${popupId}`).first();
  await waitForDropdownOptions(page, popup, filter.label);

  const searchInput = popup.locator('input[aria-label="Pesquisar"]').first();
  if ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false))) {
    await searchInput.fill("");
    await searchInput.fill(normalizedValue);
    await searchInput.press("Enter").catch(() => {});
    await page.waitForTimeout(600);
  }

  const targetCandidates = [
    popup.locator(`[role="option"][title="${normalizedValue}"]`).first(),
    popup.locator(`.slicerItemContainer[title="${normalizedValue}"]`).first(),
    popup.getByText(normalizedValue, { exact: true }).first(),
    popup.locator('[role="option"]').filter({ hasText: normalizedValue }).first(),
  ];

  for (const candidate of targetCandidates) {
    if ((await candidate.count()) === 0) {
      continue;
    }

    if (!(await candidate.isVisible().catch(() => false))) {
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(250);
    }

    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(async () => {
        await candidate.evaluate((node) => node.click());
      });
      await page.waitForTimeout(800);
      await waitForDropdownValue(page, locator, normalizedValue, filter.label);

      if ((await locator.getAttribute("aria-expanded").catch(() => null)) === "true") {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);
      }

      return;
    }
  }

  const optionSnapshot = await listDropdownOptions(popup);
  const matchedOption = findMatchingDropdownOption(optionSnapshot, normalizedValue);

  if (matchedOption) {
    const fallbackOption = popup.locator('[role="option"], .slicerItemContainer').nth(matchedOption.index);
    await fallbackOption.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    await fallbackOption.click().catch(async () => {
      await fallbackOption.evaluate((node) => node.click());
    });
    await page.waitForTimeout(800);
    await waitForDropdownValue(page, locator, normalizedValue, filter.label);

    if ((await locator.getAttribute("aria-expanded").catch(() => null)) === "true") {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
    }

    return;
  }

  const visibleOptionsPreview = optionSnapshot
    .map((option) => option.title || option.text)
    .filter((value) => value)
    .slice(0, 12)
    .join(", ");

  throw new Error(
    `Nao encontrei a opcao ${normalizedValue} no filtro ${filter.label}. ` +
      `Primeiras opcoes visiveis: ${visibleOptionsPreview || "nenhuma opcao visivel"}.`,
  );
}

function normalizeFilterValue(filter) {
  if (filter.controlType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(filter.value))) {
    const [year, month, day] = String(filter.value).split("-");
    return `${day}/${month}/${year}`;
  }

  return String(filter.value);
}

async function setFilterValue(page, surface, filter) {
  const normalizedValue = normalizeFilterValue(filter);
  console.log(`Aplicando filtro ${filter.label}: ${normalizedValue}`);

  const locator = getFilterLocator(surface, filter);
  await locator.waitFor({ state: "visible", timeout: 120000 });

  if (filter.controlType === "date") {
    await locator.fill("");
    await locator.fill(normalizedValue);
    await locator.press("Enter").catch(() => {});
    await waitForInputValue(page, locator, normalizedValue, filter.label);
    return;
  }

  await selectDropdownValue(page, surface, locator, filter, normalizedValue);
}

async function applyOptionalFilters(page, options) {
  const filters = buildFilterDefinitions(options);
  if (filters.length === 0) {
    console.log("Nenhum filtro opcional foi informado. Mantendo os filtros visiveis na tela.");
    return;
  }

  const surface = getPowerBiFrame(page) ?? page;
  await waitForReport28FiltersReady(page);

  for (const filter of filters) {
    await setFilterValue(page, surface, filter);
    await page.waitForTimeout(1500);
    await waitForPowerBiInteractiveScreen(page, `apos filtro ${filter.label}`);
    await pauseBetweenActions(page, options, `filtro ${filter.label}`);
  }
}

function buildSupervisorResetFilters() {
  return buildFilterDefinitions({
    filial: "Todos",
    zona: "Todos",
    situacao: "Todos",
    centroCusto: "Todos",
    tipoCategoria: "Todos",
    frota: "Todos",
    placa: "Todos",
  });
}

async function resetPersistedFiltersBeforeSupervisor(page) {
  const surface = getPowerBiFrame(page) ?? page;
  await waitForReport28FiltersReady(page);

  console.log("A galeria de supervisores parece filtrada. Limpando filtros principais para mapear os 9 supervisores...");

  for (const filter of buildSupervisorResetFilters()) {
    try {
      await setFilterValue(page, surface, filter);
      await page.waitForTimeout(700);
      await waitForPowerBiInteractiveScreen(page, `apos limpar ${filter.label}`);
    } catch (error) {
      console.warn(`AVISO: nao consegui limpar o filtro ${filter.label}: ${error.message || error}`);
      await closeOpenReportPopups(page).catch(() => {});
    }
  }
}

function dedupeAndSortSupervisorCandidates(candidates) {
  const deduped = [];

  for (const candidate of candidates.sort((left, right) => left.left - right.left)) {
    const alreadyIncluded = deduped.some(
      (existing) => Math.abs(existing.centerX - candidate.centerX) < 8 && Math.abs(existing.centerY - candidate.centerY) < 8,
    );

    if (!alreadyIncluded) {
      deduped.push(candidate);
    }
  }

  const centerSteps = deduped
    .slice(1)
    .map((candidate, index) => candidate.centerX - deduped[index].centerX)
    .filter((value) => Number.isFinite(value) && value > 0);

  const fallbackStep = deduped[0]?.width ?? 0;
  const sortedSteps = [...centerSteps].sort((left, right) => left - right);
  const stepX = sortedSteps.length ? sortedSteps[Math.floor(sortedSteps.length / 2)] : fallbackStep;

  return deduped.map((candidate, index) => ({
    ...candidate,
    position: index + 1,
    stepX,
  }));
}

async function collectSupervisorTileGroups(page, selector, options = {}) {
  const viewport = await page
    .evaluate(() => ({
      width: window.innerWidth || document.documentElement.clientWidth || 0,
      height: window.innerHeight || document.documentElement.clientHeight || 0,
    }))
    .catch(() => ({ width: 0, height: 0 }));

  const groups = [];

  for (const [frameIndex, frame] of page.frames().entries()) {
    let images = [];
    try {
      images = await frame.evaluate((selector) => {
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0" &&
            !element.hasAttribute("hidden")
          );
        };

        return Array.from(document.querySelectorAll(selector)).map((element, elementIndex) => {
          const rect = element.getBoundingClientRect();
          const href =
            element.getAttribute("href") ||
            element.getAttribute("xlink:href") ||
            element.href?.baseVal ||
            "";

          return {
            elementIndex,
            href,
            label:
              element.getAttribute("alt") ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              "",
            localLeft: rect.left,
            localTop: rect.top,
            localWidth: rect.width,
            localHeight: rect.height,
            tagName: element.tagName.toLowerCase(),
            visible: isVisible(element),
          };
        });
      }, selector);
    } catch {
      continue;
    }

    if (!images.length) {
      continue;
    }

    const imageLocator = frame.locator(selector);
    const frameCandidates = [];

    for (const image of images) {
      if (!image.visible) {
        continue;
      }

      const box = await imageLocator.nth(image.elementIndex).boundingBox().catch(() => null);
      if (!box) {
        continue;
      }

      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const roughlySquare = Math.abs(box.width - box.height) <= Math.max(14, Math.min(box.width, box.height) * 0.45);
      const hasHostedPhotoUrl = /ibb\.co|png|jpg|jpeg|webp/i.test(image.href || "");
      const looksLikeSupervisorPhoto =
        image.tagName === "image" ||
        hasHostedPhotoUrl ||
        /supervisor|foto|imagem/i.test(image.label || "");

      if (options.requireHostedPhotoUrl && !hasHostedPhotoUrl) {
        continue;
      }

      if (
        box.width < 16 ||
        box.height < 16 ||
        box.width > 90 ||
        box.height > 90 ||
        !roughlySquare ||
        !looksLikeSupervisorPhoto
      ) {
        continue;
      }

      if (viewport.width && centerX < viewport.width * 0.55) {
        continue;
      }

      if (centerY < 40 || centerY > 240) {
        continue;
      }

      frameCandidates.push({
        frame,
        frameIndex,
        selector,
        elementIndex: image.elementIndex,
        href: image.href,
        label: image.label,
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        centerX,
        centerY,
      });
    }

    if (frameCandidates.length) {
      groups.push(dedupeAndSortSupervisorCandidates(frameCandidates));
    }
  }

  return groups;
}

function chooseBestSupervisorGroup(groups) {
  if (!groups.length) {
    return [];
  }

  const sortedGroups = [...groups].sort((left, right) => {
    const leftHosted = left.filter((candidate) => /ibb\.co|png|jpg|jpeg|webp/i.test(candidate.href || "")).length;
    const rightHosted = right.filter((candidate) => /ibb\.co|png|jpg|jpeg|webp/i.test(candidate.href || "")).length;

    if (rightHosted !== leftHosted) {
      return rightHosted - leftHosted;
    }

    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return left[0].left - right[0].left;
  });

  return sortedGroups[0] || [];
}

async function listSupervisorTiles(page) {
  const primaryGroups = await collectSupervisorTileGroups(page, SUPERVISOR_PRIMARY_SELECTOR);
  const primaryBest = chooseBestSupervisorGroup(primaryGroups);
  if (primaryBest.length) {
    return primaryBest;
  }

  const fallbackGroups = await collectSupervisorTileGroups(page, SUPERVISOR_FALLBACK_SELECTOR, {
    requireHostedPhotoUrl: true,
  });
  return chooseBestSupervisorGroup(fallbackGroups);
}

async function waitForSupervisorTilesReady(page, supervisorIndex, options = {}) {
  const minimumTiles = options.requireFullGallery ? Math.max(supervisorIndex, SUPERVISOR_COUNT) : supervisorIndex;
  let lastTiles = [];
  await waitForPowerBiInteractiveScreen(page, "antes da selecao do supervisor");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastTiles = await listSupervisorTiles(page);

    if (lastTiles.length >= minimumTiles) {
      console.log(`OK: Blocos de supervisor detectados (${lastTiles.length} visiveis)`);
      return lastTiles;
    }

    if (attempt === 0 || (attempt + 1) % 10 === 0) {
      console.log(`Aguardando blocos de supervisor aparecerem... tentativa ${attempt + 1}/60`);
    }

    await page.waitForTimeout(500);
  }

  const preview = lastTiles
    .map((tile) => `${tile.position}:${tile.label || `x=${Math.round(tile.left)}`}`)
    .slice(0, 12)
    .join(", ");

  throw new Error(
    `Nao encontrei o supervisor ${supervisorIndex}. ` +
      `Blocos visiveis detectados: ${lastTiles.length}. ${preview ? `Mapa atual: ${preview}.` : "Nenhum candidato visivel foi encontrado."}`,
  );
}

async function clickSupervisorTile(page, tile) {
  const locator = tile.frame.locator(tile.selector || SUPERVISOR_PRIMARY_SELECTOR).nth(tile.elementIndex);
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Nao consegui medir o bloco do supervisor para clicar.");
  }

  const stepX = Number.isFinite(tile.stepX) && tile.stepX > 0 ? tile.stepX : box.width;
  const clickX = Math.max(0, tile.left - stepX / 2);
  const clickY = box.y + box.height / 2;

  await page.mouse.move(clickX, clickY).catch(() => {});
  await page.waitForTimeout(150);
  await page.mouse.click(clickX, clickY);
}

async function applySupervisorFilter(page, options) {
  if (!options.supervisorIndex) {
    return;
  }

  let tiles = await waitForSupervisorTilesReady(page, 1);
  if (tiles.length < SUPERVISOR_COUNT) {
    await resetPersistedFiltersBeforeSupervisor(page);
  }

  tiles = await waitForSupervisorTilesReady(page, options.supervisorIndex, { requireFullGallery: true });
  const targetTile = tiles[options.supervisorIndex - 1];
  if (!targetTile) {
    throw new Error(`O supervisor ${options.supervisorIndex} nao esta disponivel para clique.`);
  }

  console.log(
    `Aplicando filtro SUPERVISOR: ${options.supervisorIndex} (da esquerda para a direita)` +
      `${targetTile.label ? ` - ${targetTile.label}` : ""}`,
  );

  await clickSupervisorTile(page, targetTile);
  await page.waitForTimeout(1500);
  await waitForPowerBiInteractiveScreen(page, `apos supervisor ${options.supervisorIndex}`);
  await pauseBetweenActions(page, options, `supervisor ${options.supervisorIndex}`);
}

async function closeOpenReportPopups(page) {
  const surface = getPowerBiFrame(page);
  if (!surface) {
    return;
  }

  const hasVisiblePopup = async () =>
    surface.evaluate(() => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };

      return Array.from(document.querySelectorAll(".slicer-dropdown-popup")).some(isVisible);
    });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await hasVisiblePopup().catch(() => false))) {
      return;
    }

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);

    if (!(await hasVisiblePopup().catch(() => false))) {
      return;
    }

    await page.mouse.click(40, 220).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function waitForScreenshotReady(page) {
  await waitForPowerBiInteractiveScreen(page, "tela final para captura");
  await page.waitForTimeout(1500);
}

async function saveEvidence(page, options) {
  if (!options.screenshot) {
    return;
  }

  await waitForScreenshotReady(page);
  await closeOpenReportPopups(page);
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(SCREENSHOT_DIR, `relatorio28_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot salvo em: ${screenshotPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(PROFILE_DIR, { recursive: true });

  const context = await createBrowserContext();

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    await gotoWorkspaces(page);
    await pauseBetweenActions(page, options, "acesso aos workspaces");
    await gotoOperationReportsWorkspace(page);
    await pauseBetweenActions(page, options, "abertura da lista de relatorios");
    await openGubermanReportWithFallback(page);
    await pauseBetweenActions(page, options, "abertura do card REL2026 GUBERMAN v.00");
    await waitForReportViewer(page);
    await pauseBetweenActions(page, options, "carregamento do visualizador");
    await enterFullscreen(page);
    await pauseBetweenActions(page, options, "entrada em tela cheia");
    await goToReportPage(page, options.page);
    await pauseBetweenActions(page, options, `navegacao para a pagina ${options.page}`);
    await applySupervisorFilter(page, options);
    await applyOptionalFilters(page, options);
    await saveEvidence(page, options);

    console.log("Fluxo concluido. O relatorio 28 foi aberto.");
    console.log("Use --keep-open se quiser manter a janela aberta ao final.");
  } finally {
    if (!options.keepOpen) {
      await context.close();
    }
  }
}

main().catch((error) => {
  console.error("Falha na automacao:");
  console.error(error);
  process.exitCode = 1;
});
