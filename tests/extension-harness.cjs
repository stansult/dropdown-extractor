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

async function triggerActionWithPopupConfirmation(attempt, maxAttempts = 2) {
  for (let index = 0; index < maxAttempts; index += 1) {
    if (await attempt()) return;
  }
  throw new Error(`Chrome did not create the extension popup target after ${maxAttempts} attempts.`);
}

async function armExtension(worker, page, context) {
  await page.locator('.dropdown-extractor-toast', { hasText: 'Click a dropdown' })
    .evaluateAll(toasts => toasts.forEach(toast => { toast.dataset.playwrightPreviousArm = 'true'; }));
  await page.bringToFront();
  const extensionId = new URL(worker.url()).hostname;
  const browser = context.browser();
  if (!browser) throw new Error('Browser connection is unavailable.');
  const browserSession = await browser.newBrowserCDPSession();
  const targetEvents = [];
  browserSession.on('Target.targetCreated', ({ targetInfo }) => {
    targetEvents.push({ event: 'created', type: targetInfo.type, url: targetInfo.url });
  });
  browserSession.on('Target.targetInfoChanged', ({ targetInfo }) => {
    targetEvents.push({ event: 'changed', type: targetInfo.type, url: targetInfo.url });
  });
  browserSession.on('Target.targetDestroyed', ({ targetId }) => {
    targetEvents.push({ event: 'destroyed', targetId });
  });
  try {
    await browserSession.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await browserSession.send('Target.getTargets', {
      filter: [{ type: 'tab' }],
    });
    const target = targetInfos.find(candidate => candidate.url === page.url());
    if (!target) throw new Error('Playground tab target not found.');
    targetEvents.length = 0;
    await triggerActionWithPopupConfirmation(async () => {
      let resolvePopup;
      const popupCreated = new Promise(resolve => { resolvePopup = resolve; });
      const onTargetCreated = ({ targetInfo }) => {
        if (targetInfo.type === 'other') resolvePopup(true);
      };
      browserSession.on('Target.targetCreated', onTargetCreated);
      try {
        await browserSession.send('Extensions.triggerAction', {
          id: extensionId,
          targetId: target.targetId,
        });
        return await Promise.race([
          popupCreated,
          new Promise(resolve => setTimeout(() => resolve(false), 1_000)),
        ]);
      } finally {
        browserSession.off('Target.targetCreated', onTargetCreated);
      }
    });
    try {
      await expect(page.locator(
        '.dropdown-extractor-toast:not([data-playwright-previous-arm])',
        { hasText: 'Click a dropdown' }
      )).toBeVisible();
    } catch (error) {
      const [extensionState, pageState] = await Promise.all([
        worker.evaluate(async () => ({
          actionTitle: await chrome.action.getTitle({}),
          badgeText: await chrome.action.getBadgeText({}),
          activeTabs: (await chrome.tabs.query({ active: true, currentWindow: true }))
            .map(tab => ({ id: tab.id, url: tab.url })),
        })),
        page.evaluate(() => ({
          active: !!window.__dropdownExtractorActive,
          toasts: [...document.querySelectorAll('.dropdown-extractor-toast')]
            .map(toast => ({ text: toast.textContent, previous: toast.dataset.playwrightPreviousArm })),
        })),
      ]);
      throw new Error(`${error.message}\nActivation diagnostics: ${JSON.stringify({
        targetEvents, extensionState, pageState,
      })}`);
    }
  } finally {
    await browserSession.detach();
  }
}

async function clipboardText(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

module.exports = {
  test,
  expect,
  setPrefs,
  armExtension,
  clipboardText,
  triggerActionWithPopupConfirmation,
};
