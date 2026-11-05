const { test: plainTest, expect } = require('@playwright/test');
const { test: extensionTest, setPrefs, armExtension, clipboardText } = require('./extension-harness.cjs');
const { renderFixture } = require('./helpers.cjs');

const viewport = { width: 1656, height: 908 };
const items = [
  { text: 'Alpha', value: '101' },
  { text: 'Beta', value: '202' },
  { text: 'Gamma', value: '303' },
];
const supportedTypes = [
  { type: 'native' },
  { type: 'aria', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  {
    type: 'aria-searchable', trigger: '.dropdown-select', open: '.dropdown-container:not(.dropdown-invisible)',
    triggerEvent: 'mousedown', scrollable: '[role="listbox"]',
  },
  { type: 'aria-grid', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'selectize', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'react', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'react-atlassian', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'downshift', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'mui', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'radix-menu', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'dropbox-menu', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'antd', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'select2', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'chosen', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
  { type: 'slm-modal', trigger: '.slm-show-modal', open: '.slm-dropdown-modal.show', closeOutside: true },
  { type: 'github-selectmenu', trigger: '.gh-selectmenu-summary', open: '.gh-selectmenu.open .SelectMenu' },
  { type: 'aliexpress', trigger: '.ali-shell input', open: '.ali-suggestions.open', closeOutside: true },
  { type: 'expedia', trigger: '.dropdown-trigger', open: '.dropdown-menu.open' },
];

plainTest.use({ viewport });

plainTest('compact iframe contract preserves same-origin controls and visible preview geometry', async ({ page }) => {
  await page.goto('/');
  await renderFixture(page, { type: 'native', items, iframe: true });
  const frame = page.frameLocator('#playground-fixture-frame');
  const select = frame.locator('select');
  await expect(select.locator('option')).toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await select.locator('option').evaluateAll(es => es.map(e => e.value)))
    .toEqual(['101', '202', '303']);
  const sameOrigin = await page.locator('#playground-fixture-frame').evaluate(e => (
    e.contentWindow.parent.document === document
      && e.contentDocument === e.contentWindow.document
  ));
  expect(sameOrigin).toBe(true);
  const frameBox = await page.locator('#playground-fixture-frame').boundingBox();
  const selectBox = await select.boundingBox();
  expect(selectBox.x).toBeGreaterThanOrEqual(frameBox.x);
  expect(selectBox.y).toBeGreaterThanOrEqual(frameBox.y);
  expect(selectBox.y + selectBox.height).toBeLessThan(viewport.height);
  await select.selectOption('202');
  await expect(select).toHaveValue('202');
  for (const selector of ['.dropdown-panel h2', '#dropdown-type', '#render']) {
    await expect(page.locator(selector)).toBeInViewport();
  }
});

async function activateFixture(locator, eventName) {
  if (eventName) {
    await locator.dispatchEvent(eventName);
  } else {
    await locator.click();
  }
}

for (const fixture of supportedTypes) {
  plainTest(`iframe sizing follows ${fixture.type} through its closed and open lifecycle`, async ({ page }) => {
    await page.goto('/');
    await renderFixture(page, { type: fixture.type, items });
    await expect(page.locator('#dropdown-type')).toContainText('Supported');
    const topItems = await page.locator('#items').boundingBox();

    await page.locator('#render-in-iframe').check();
    await page.locator('#render').click();
    const frameElement = page.locator('#playground-fixture-frame');
    const frame = page.frameLocator('#playground-fixture-frame');
    const root = frame.locator('#fixture-root');
    await expect(root.locator(':scope > *')).toHaveCount(1);

    const initialFrame = await frameElement.boundingBox();
    const initialRoot = await root.boundingBox();
    const iframeItems = await page.locator('#items').boundingBox();
    expect.soft(
      initialFrame.height - initialRoot.height,
      `${fixture.type}: initial unused iframe height`
    ).toBeLessThanOrEqual(64);
    expect.soft(
      Math.abs(iframeItems.y - topItems.y),
      `${fixture.type}: item editor movement when only rendering context changes`
    ).toBeLessThanOrEqual(2);

    if (!fixture.trigger) return;
    const trigger = frame.locator(fixture.trigger);
    const openContent = frame.locator(fixture.open);
    await activateFixture(trigger, fixture.triggerEvent);
    await expect(openContent).toBeVisible();
    const openFrame = await frameElement.boundingBox();
    const openBox = await openContent.boundingBox();
    expect.soft(
      openBox.y + openBox.height - (openFrame.y + openFrame.height),
      `${fixture.type}: open content outside iframe`
    ).toBeLessThanOrEqual(1);
    if (fixture.scrollable) {
      const scroll = await frame.locator(fixture.scrollable).evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(scroll.scrollHeight, `${fixture.type}: long menu retains intentional internal scrolling`)
        .toBeGreaterThan(scroll.clientHeight);
    }

    if (fixture.closeOutside) {
      await frame.locator('body').click({ position: { x: 2, y: 2 } });
    } else {
      await activateFixture(trigger, fixture.triggerEvent);
    }
    await expect(openContent).toBeHidden();
    await expect.poll(async () => {
      const [frameBox, rootBox] = await Promise.all([
        frameElement.boundingBox(),
        root.boundingBox(),
      ]);
      return frameBox.height - rootBox.height;
    }, `${fixture.type}: iframe settles after close`).toBeLessThanOrEqual(64);
    const closedFrame = await frameElement.boundingBox();
    const closedRoot = await root.boundingBox();
    const closedItems = await page.locator('#items').boundingBox();
    expect.soft(
      closedFrame.height - closedRoot.height,
      `${fixture.type}: unused iframe height after close`
    ).toBeLessThanOrEqual(64);
    expect.soft(
      Math.abs(closedItems.y - topItems.y),
      `${fixture.type}: item editor movement after close`
    ).toBeLessThanOrEqual(2);
  });
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function notifications(page, text) {
  const matches = [];
  for (const frame of page.frames()) {
    let offset = { x: 0, y: 0 };
    let clip = { x: 0, y: 0, ...viewport };
    if (frame !== page.mainFrame()) {
      const element = await frame.frameElement();
      const box = await element.boundingBox();
      const border = await element.evaluate(e => ({ x: e.clientLeft, y: e.clientTop }));
      await element.dispose();
      offset = { x: box.x + border.x, y: box.y + border.y };
      clip = box;
    }
    // Read transient toasts atomically: nth-based locators can rebind when the
    // previous activation toast is removed while success feedback is appearing.
    const toasts = await frame.locator('.dropdown-extractor-toast').evaluateAll(es => es.map(e => {
      const rect = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return { text: e.textContent, opacity: Number(style.opacity),
        display: style.display, visibility: style.visibility,
        x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    for (const toast of toasts) {
      if (!toast.text.startsWith(text) || toast.opacity < 0.9
        || toast.display === 'none' || toast.visibility === 'hidden') continue;
      const box = { ...toast, x: toast.x + offset.x, y: toast.y + offset.y };
      if (intersects(box, { x: 0, y: 0, ...viewport }) && intersects(box, clip)) {
        matches.push({ document: frame === page.mainFrame() ? 'top' : 'iframe', ...box });
      }
    }
  }
  return matches;
}

async function expectToastMovesFromTopRight(page, toast) {
  await expect(toast).toBeVisible();
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const before = await toast.boundingBox();
  expect.soft(before.y, 'notification starts at the top edge').toBeLessThanOrEqual(24);
  expect.soft(clientWidth - (before.x + before.width), 'notification starts at the right edge')
    .toBeLessThanOrEqual(24);

  await page.mouse.move(before.x + (before.width / 2), before.y + (before.height / 2));
  await expect(toast).toHaveAttribute('data-corner', 'top-left', { timeout: 1_500 });
  await expect.poll(async () => (await toast.boundingBox()).x, {
    message: 'hovered notification finishes moving to the left edge',
    timeout: 1_500,
  }).toBeLessThanOrEqual(24);
  const after = await toast.boundingBox();
  expect.soft(after.y, 'moved notification remains at the top edge').toBeLessThanOrEqual(24);
}

for (const phase of ['activation', 'timeout', 'success']) {
  // Independent tests: an expected failure in activation must not skip timeout/success.
  extensionTest(`iframe feedback regression: ${phase} is unique and movable`, async ({
    extensionContext: context, extensionPage: page, extensionWorker: worker,
  }, testInfo) => {
    if (phase === 'timeout') testInfo.setTimeout(30_000);
    await page.setViewportSize(viewport);
    await renderFixture(page, { type: 'native', items, iframe: true });
    const select = page.frameLocator('#playground-fixture-frame').locator('select');
    await expect(select.locator('option')).toHaveText(['Alpha', 'Beta', 'Gamma']);
    await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
    // Keep the pointer away from notifications so hover-to-move cannot conceal overlap.
    await page.mouse.move(10, 10);
    await armExtension(worker, page, context);
    const text = phase === 'activation' ? 'Click a dropdown'
      : phase === 'timeout' ? 'Dropdown extractor stopped (timeout)' : 'Extracted 3 items to clipboard:';
    if (phase === 'success') {
      await select.click();
      await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
    }
    await expect.poll(async () => (await notifications(page, text))
      .some(notification => notification.document === 'top'), {
      timeout: phase === 'timeout' ? 12_000 : 5_000,
    }).toBe(true);
    const visible = await notifications(page, text);
    await testInfo.attach('notification-geometry', {
      body: JSON.stringify({ phase, visible }, null, 2),
      contentType: 'application/json',
    });
    expect.soft(visible.map(n => n.document), 'one notification across the top page and iframe').toEqual(['top']);
    await expectToastMovesFromTopRight(page, page.locator('.dropdown-extractor-toast', { hasText: text }));
  });
}
