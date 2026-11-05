const { test: plainTest, expect } = require('@playwright/test');
const { test: extensionTest, setPrefs, armExtension, clipboardText } = require('./extension-harness.cjs');
const { renderFixture } = require('./helpers.cjs');

const viewport = { width: 1656, height: 908 };
const items = [
  { text: 'Alpha', value: '101' },
  { text: 'Beta', value: '202' },
  { text: 'Gamma', value: '303' },
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

plainTest('iframe layout regression: compact native content does not reserve a tall empty frame', async ({ page }) => {
  await page.goto('/');
  await renderFixture(page, { type: 'native', items, iframe: true });
  const frameBox = await page.locator('#playground-fixture-frame').boundingBox();
  const selectBox = await page.frameLocator('#playground-fixture-frame').locator('select').boundingBox();
  // Compact native content allows a generous 64px total for padding/borders,
  // rather than reserving hundreds of blank pixels for an unopened native picker.
  expect(frameBox.height - selectBox.height, 'unused vertical space around the native control')
    .toBeLessThanOrEqual(64);
});

plainTest('iframe layout regression: enabling iframe mode does not push the item editor down', async ({ page }) => {
  await page.goto('/');
  await renderFixture(page, { type: 'native', items });
  const before = await page.locator('#items').boundingBox();
  await page.locator('#render-in-iframe').check();
  await page.locator('#render').click();
  await expect(page.frameLocator('#playground-fixture-frame').locator('select')).toBeVisible();
  const after = await page.locator('#items').boundingBox();
  expect(Math.abs(after.y - before.y), 'item editor movement when only rendering context changes')
    .toBeLessThanOrEqual(2);
});

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

for (const phase of ['activation', 'timeout', 'success']) {
  // Independent tests: an expected failure in activation must not skip timeout/success.
  extensionTest(`iframe feedback regression: ${phase} is unique and does not obscure controls`, async ({
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
      // The activation toast currently intercepts real clicks on this control.
      // Dispatch the actual extraction event so that defect cannot mask success
      // notification defects; obstruction is independently asserted below.
      await select.evaluate(element => {
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        }));
      });
      await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
    }
    await expect.poll(async () => (await notifications(page, text))
      .some(notification => notification.document === 'top'), {
      timeout: phase === 'timeout' ? 12_000 : 5_000,
    }).toBe(true);
    const visible = await notifications(page, text);
    const selectBox = await select.boundingBox();
    const previewControls = [];
    for (const selector of ['.dropdown-panel h2', '#dropdown-type', '#dropdown-context', '#render']) {
      previewControls.push({ selector, box: await page.locator(selector).boundingBox() });
    }
    const dropdownOverlaps = visible.filter(n => intersects(n, selectBox));
    const previewOverlaps = visible.filter(n => n.document === 'top').flatMap(n => (
      previewControls.filter(control => intersects(n, control.box)).map(control => control.selector)
    ));
    await testInfo.attach('notification-geometry', {
      body: JSON.stringify({ phase, visible, selectBox, previewControls, dropdownOverlaps, previewOverlaps }, null, 2),
      contentType: 'application/json',
    });
    // Soft assertions expose all three independent defects even when duplication fails first.
    expect.soft(visible.map(n => n.document), 'one notification across the top page and iframe').toEqual(['top']);
    expect.soft(dropdownOverlaps, 'notifications must not cover the test dropdown').toEqual([]);
    expect.soft(previewOverlaps, 'top notification must not cover preview heading/status/Render').toEqual([]);
  });
}
