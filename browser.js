const { chromium } = require("playwright");

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
  }
  return browserPromise;
}

// Alguns sites (ex.: Pichau) detectam automação por sinais óbvios que o
// Chromium headless deixa vazar (navigator.webdriver, ausência de
// navigator.plugins/chrome, etc.) e servem uma página de bloqueio disfarçada
// em vez de um 403. Isso mascara só esses sinais — não contorna captcha nem
// challenge de verificação humana de fato.
const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`;

// Limita quantas páginas headless rodam ao mesmo tempo, para não sobrecarregar
// a máquina local nem soar como um bot martelando as lojas com dezenas de
// requisições simultâneas.
const MAX_CONCURRENT_PAGES = 4;
let active = 0;
const queue = [];

function acquireSlot() {
  if (active < MAX_CONCURRENT_PAGES) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function releaseSlot() {
  active--;
  const next = queue.shift();
  if (next) {
    active++;
    next();
  }
}

// Abre uma página nova (contexto isolado, UA/idioma de navegador real —
// necessário para passar pelo desafio JS da Cloudflare em algumas lojas),
// executa `fn(page)` e garante o fechamento do contexto ao final.
async function withPage(fn) {
  await acquireSlot();
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      locale: "pt-BR",
      viewport: { width: 1366, height: 900 },
    });
    await context.addInitScript(STEALTH_INIT_SCRIPT);
    try {
      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context.close();
    }
  } finally {
    releaseSlot();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

module.exports = { withPage, closeBrowser };
