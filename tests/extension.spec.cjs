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

const items = [
  { text: 'Alpha', value: '101' },
  { text: 'Beta', value: '202' },
  { text: 'Gamma', value: '303' },
];

const combinedFormats = [
  ['space', 'text-space-value', 'Alpha 101\nBeta 202\nGamma 303'],
  ['dash', 'text-dash-value', 'Alpha - 101\nBeta - 202\nGamma - 303'],
  ['pipe', 'text-pipe-value', 'Alpha | 101\nBeta | 202\nGamma | 303'],
  ['tab', 'text-tab-value', 'Alpha\t101\nBeta\t202\nGamma\t303'],
  ['line break', 'text-linebreak-value', 'Alpha\n101\nBeta\n202\nGamma\n303'],
  ['parentheses', 'text-parens-value', 'Alpha (101)\nBeta (202)\nGamma (303)'],
  ['brackets', 'text-brackets-value', 'Alpha [101]\nBeta [202]\nGamma [303]'],
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

test('extracts native values without text', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, { extractText: false, extractValue: true, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toBe('101\n202\n303');
});

for (const [label, format, expected] of combinedFormats) {
  test(`formats text and values with ${label}`, async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
    await renderFixture(page, { type: 'native', items });
    await setPrefs(worker, {
      extractText: true,
      extractValue: true,
      format,
      safeCapture: true,
      debugMode: false,
    });
    await armExtension(worker, page, context);
    await page.locator('#dropdown select').click();
    await expect.poll(() => clipboardText(page)).toBe(expected);
  });
}

test('immediate reactivation uses newly stored preferences', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-space-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();
  await expect.poll(() => clipboardText(page)).toBe('Alpha 101\nBeta 202\nGamma 303');

  await setPrefs(worker, { format: 'text-dash-value' });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha - 101\nBeta - 202\nGamma - 303');
});

test('reports an error when neither text nor value is selected', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, { extractText: false, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'No extract option selected.' })).toBeVisible();
  await expect.poll(() => clipboardText(page)).toBe('unchanged');
});

test('falls back to values when item text is absent', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const valueOnlyItems = items.map(item => ({ text: '', value: item.value }));
  await renderFixture(page, { type: 'native', items: valueOnlyItems });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toBe('101\n202\n303');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Only values extracted, no text found.' })).toBeVisible();
});

test('Safe Capture off allows normal ARIA selection', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: false, debugMode: false });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await trigger.click();
  await page.locator('#dropdown [role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Beta');
  await expect(page.locator('#dropdown .dropdown-menu')).not.toHaveClass(/open/);
});

test('Safe Capture off allows Dropbox mousedown selection', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'dropbox-menu', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: false, debugMode: false });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await trigger.click();
  await page.locator('#dropdown [role="menuitem"]').nth(1).dispatchEvent('mousedown');

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Beta');
  await expect(page.locator('#dropdown .dropdown-menu')).not.toHaveClass(/open/);
});

test('supported-dropdown debug copies raw dropdown HTML', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'supported',
  });
  await armExtension(worker, page, context);
  await page.locator('#dropdown select').click();

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: supported dropdown ---');
  await expect.poll(() => clipboardText(page)).toContain('tag: SELECT');
  await expect.poll(() => clipboardText(page)).toContain('<option value="202">Beta</option>');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied dropdown HTML' })).toBeVisible();
});

test('Any two debug captures the menu container and selected option', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
  });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  await trigger.click();
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied HTML (1/2, menu container)' })).toBeVisible();
  await page.locator('#dropdown [role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 1. menu container ---');
  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
  await expect.poll(() => clipboardText(page)).toContain('text: "Beta"');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied HTML (2/2, option)' })).toBeVisible();
  await expect(trigger).toHaveText('Alpha');
});
