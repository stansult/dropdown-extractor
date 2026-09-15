const { test: base, expect, chromium } = require('@playwright/test');
const { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { renderFixture } = require('./helpers.cjs');

const extensionPath = join(__dirname, '..');
const extensionFiles = [
  'manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js',
  'options.html', 'options.css', 'options.js', 'icon16.png', 'icon32.png',
  'icon48.png', 'icon128.png',
];
const test = base.extend({
  extensionContext: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dropdown-playwright-'));
    const testExtensionDir = mkdtempSync(join(tmpdir(), 'dropdown-extension-'));
    for (const file of extensionFiles) {
      copyFileSync(join(extensionPath, file), join(testExtensionDir, file));
    }
    const manifestPath = join(testExtensionDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.host_permissions = ['http://127.0.0.1/*'];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${testExtensionDir}`,
        `--load-extension=${testExtensionDir}`,
      ],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173',
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(testExtensionDir, { recursive: true, force: true });
  },
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

test.describe.configure({ mode: 'serial' });

async function setPrefs(worker, values) {
  await worker.evaluate(prefs => new Promise(resolve => chrome.storage.sync.set(prefs, resolve)), values);
}

async function armExtension(worker, page) {
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) throw new Error('Could not find the active test tab.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  });
  await expect(page.locator('.dropdown-extractor-toast')).toContainText('Click a dropdown');
}

async function clipboardText(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

const items = [
  { text: 'Alpha', value: '101' },
  { text: 'Beta', value: '202' },
  { text: 'Gamma', value: '303' },
];

test('extracts all items from a native select', async ({ extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Extracted 3 items' })).toBeVisible();
});

test('safe capture extracts an ARIA list without selecting the clicked option', async ({ extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await expect(trigger).toHaveText('Alpha');
  await trigger.click();
  await page.locator('#dropdown [role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Alpha');
});

test('extracts GitHub checkbox values with the configured format', async ({ extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'github-selectmenu', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page);
  await page.locator('#dropdown .gh-selectmenu-summary').click();
  await page.locator('#dropdown [role="listitem"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha [101]\nBeta [202]\nGamma [303]');
});
