const { test: base, expect, chromium } = require('@playwright/test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const extensionPath = join(__dirname, '..');
const test = base.extend({
  extensionContext: [async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dropdown-playwright-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-extension-debugging',
      ],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173',
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }, { timeout: 60_000 }],
  extensionWorker: async ({ extensionContext }, use) => {
    let [worker] = extensionContext.serviceWorkers();
    if (!worker) worker = await extensionContext.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionPage: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await use(page);
  },
});

async function setPrefs(worker, values) {
  await worker.evaluate(prefs => new Promise(resolve => chrome.storage.sync.set(prefs, resolve)), values);
}

async function armExtension(worker, page, context) {
  await page.locator('.dropdown-extractor-toast', { hasText: 'Click a dropdown' })
    .evaluateAll(toasts => toasts.forEach(toast => { toast.dataset.playwrightPreviousArm = 'true'; }));
  await page.bringToFront();
  const extensionId = new URL(worker.url()).hostname;
  const browser = context.browser();
  if (!browser) throw new Error('Browser connection is unavailable.');
  const browserSession = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await browserSession.send('Target.getTargets', {
      filter: [{ type: 'tab' }],
    });
    const target = targetInfos.find(candidate => candidate.url === page.url());
    if (!target) throw new Error('Playground tab target not found.');
    await browserSession.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: target.targetId,
    });
  } finally {
    await browserSession.detach();
  }
  await expect(page.locator(
    '.dropdown-extractor-toast:not([data-playwright-previous-arm])',
    { hasText: 'Click a dropdown' }
  )).toBeVisible();
}

async function clipboardText(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

module.exports = { test, expect, setPrefs, armExtension, clipboardText };
