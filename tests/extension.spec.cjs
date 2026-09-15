const { test: base, expect, chromium } = require('@playwright/test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { renderFixture } = require('./helpers.cjs');

const extensionPath = join(__dirname, '..');
const test = base.extend({
  extensionContext: async ({}, use) => {
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

async function armExtension(worker, page, context) {
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

test('extracts all items from a native select', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Extracted 3 items' })).toBeVisible();
});

test('safe capture extracts an ARIA list without selecting the clicked option', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await expect(trigger).toHaveText('Alpha');
  await trigger.click();
  await page.locator('#dropdown [role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Alpha');
});

test('extracts GitHub checkbox values with the configured format', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'github-selectmenu', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown .gh-selectmenu-summary').click();
  await page.locator('#dropdown [role="listitem"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha [101]\nBeta [202]\nGamma [303]');
});

test('safe capture handles Dropbox menus that select on mousedown', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'dropbox-menu', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await expect(trigger).toHaveText('Alpha');
  await trigger.click();
  await page.locator('#dropdown [role="menuitem"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Alpha');
  await expect(page.locator('#dropdown .dropdown-menu')).toHaveClass(/open/);
});

test('AliExpress extraction uses href and ignores other value fields', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const aliItems = [
    { text: 'Alpha', value: 'wrong-101', dataValue: 'also-wrong-101', href: 'https://example.com/alpha' },
    { text: 'Beta', value: 'wrong-202', dataValue: 'also-wrong-202', href: 'https://example.com/beta' },
    { text: 'Gamma', value: 'wrong-303', dataValue: 'also-wrong-303', href: 'https://example.com/gamma' },
  ];
  await renderFixture(page, { type: 'aliexpress', items: aliItems });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown #search-words').click();
  await page.locator('#dropdown .ali-suggestions a').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe([
    'Alpha [https://example.com/alpha]',
    'Beta [https://example.com/beta]',
    'Gamma [https://example.com/gamma]',
  ].join('\n'));
});

test('Expedia extraction prefers aria-label and handles absent values', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'expedia', items });
  const options = page.locator('#dropdown [data-stid="destination_form_field-result-item-button"]');
  await options.nth(0).evaluate(button => { button.textContent = 'Wrong visible Alpha'; });
  await options.nth(1).evaluate(button => { button.textContent = 'Wrong visible Beta'; });
  await options.nth(2).evaluate(button => { button.textContent = 'Wrong visible Gamma'; });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown .dropdown-trigger').click();
  await options.nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Only text extracted, no values found.' })).toBeVisible();
});
