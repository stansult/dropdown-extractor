const { test, expect } = require('@playwright/test');
const { renderFixture, setItems } = require('./helpers.cjs');

const items = [
  { text: 'Alpha', value: '101' },
  { text: 'Beta', value: '202' },
  { text: 'Gamma', value: '303' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('native fixture renders options and supports normal selection', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await expect(page.getByRole('heading', { name: 'Dropdown Playground' })).toBeVisible();
  await expect(page.locator('#items tr')).toHaveCount(5);
  await expect(page.locator('#dropdown select option')).toHaveCount(5);
  await expect(page.locator('#playground-fixture-frame')).toHaveCount(0);
  await expect(page.locator('#dropdown-type')).toContainText('Native <select>');

  await renderFixture(page, { type: 'native', items });
  const select = page.locator('#dropdown select');
  const options = select.locator('option');
  await expect(options).toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await options.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['101', '202', '303']);
  await select.selectOption('202');
  await expect(select).toHaveValue('202');

  const valueOnlyItems = items.map(item => ({ text: '', value: item.value }));
  await renderFixture(page, { type: 'native', items: valueOnlyItems });
  const valueOnlyOptions = page.locator('#dropdown select option');
  await expect(valueOnlyOptions).toHaveText(['', '', '']);
  expect(await valueOnlyOptions.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['101', '202', '303']);
  expect(errors).toEqual([]);
});

test('iframe option reports and changes the rendered context', async ({ page }) => {
  const iframeOption = page.locator('#render-in-iframe');
  const iframeControl = page.locator('.render-context-control');
  const renderButton = page.locator('#render');
  const contextStatus = page.locator('#dropdown-context');

  await expect(iframeOption).not.toBeChecked();
  await expect(contextStatus).toHaveText('Context: Top page');
  await page.locator('#render').click();
  await expect(page.locator('#playground-fixture-frame')).toHaveCount(0);

  await iframeOption.check();
  await expect(iframeControl).toHaveClass(/changed/);
  await expect(renderButton).toHaveClass(/changed/);
  await renderButton.click();
  await expect(iframeControl).not.toHaveClass(/changed/);
  await expect(renderButton).not.toHaveClass(/changed/);
  await expect(contextStatus).toHaveText('Context: Same-origin iframe');
  await expect(page.locator('#playground-fixture-frame')).toBeVisible();
  await expect(page.frameLocator('#playground-fixture-frame').locator('link[href*="styles.css"]'))
    .toHaveCount(1);
});

test('configurable iframe renders a native select with normal interaction', async ({ page }) => {
  await renderFixture(page, { type: 'native', items, iframe: true });
  const frame = page.frameLocator('#playground-fixture-frame');
  const select = frame.locator('select');
  const options = select.locator('option');

  await expect(options).toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await options.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['101', '202', '303']);
  await select.selectOption('202');
  await expect(select).toHaveValue('202');
});

test('configurable iframe preserves searchable ARIA interaction behavior', async ({ page }) => {
  await renderFixture(page, { type: 'aria-searchable', items, iframe: true });
  const frame = page.frameLocator('#playground-fixture-frame');
  const trigger = frame.locator('.dropdown-select');
  const container = frame.locator('.dropdown-container');
  const search = frame.locator('.dropdown-search');
  const options = frame.locator('[role="listbox"] [role="option"]');

  await expect(options.nth(3)).toHaveText('Additional searchable category 4');
  await trigger.click();
  await expect(container).not.toHaveClass(/dropdown-invisible/);
  await search.fill('category 26');
  await expect(options.nth(0)).toBeHidden();
  await expect(options.nth(25)).toBeVisible();
  await frame.locator('#fixture-root').click({ position: { x: 2, y: 2 } });
  await expect(container).toHaveClass(/dropdown-invisible/);

  await trigger.click();
  await search.fill('Beta');
  await options.nth(1).click();
  await expect(trigger.locator('.dropdown-text')).toHaveText('Beta');
  await expect(container).toHaveClass(/dropdown-invisible/);
});

test('every offered dropdown type renders in iframe mode without a page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const types = await page.locator('#type option').evaluateAll(options => (
    options.map(option => option.value)
  ));
  await setItems(page, items);
  await page.locator('#render-in-iframe').check();

  for (const type of types) {
    await page.locator('#type').evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, type);
    await page.locator('#render').click();
    await expect(page.locator('#playground-fixture-frame')).toBeVisible();
    await expect(page.frameLocator('#playground-fixture-frame').locator('#fixture-root > *'))
      .toHaveCount(1);
  }

  expect(errors).toEqual([]);
});

test('native select iframe fixture preserves option data and normal selection', async ({ page }) => {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'native-select-frame';
    frame.src = '/native-select-frame.html';
    frame.style.width = '800px';
    frame.style.height = '300px';
    document.querySelector('#dropdown').replaceChildren(frame);
  });
  const frame = page.frameLocator('#native-select-frame');
  const select = frame.locator('#education-start-month');
  const options = select.locator('option');

  await expect(select).toHaveAttribute('aria-labelledby', 'education-start-month-label');
  await expect(options).toHaveText(['', 'Jan', 'Feb', 'Mar']);
  expect(await options.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['0', '01', '02', '03']);
  await expect(select).toHaveValue('02');
  await select.selectOption('03');
  await expect(select).toHaveValue('03');
});

test('tall native select iframe fixture places the control below the iframe top', async ({ page }) => {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'tall-native-select-frame';
    frame.src = '/tall-native-select-frame.html';
    frame.style.width = '800px';
    frame.style.height = '1400px';
    document.querySelector('#dropdown').replaceChildren(frame);
  });
  const frameElement = page.locator('#tall-native-select-frame');
  const frame = page.frameLocator('#tall-native-select-frame');
  const select = frame.locator('#education-start-day');
  const options = select.locator('option');

  await expect(options).toHaveText(['', '1', '2', '3']);
  expect(await options.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['0', '1', '2', '3']);
  await expect(select).toHaveValue('2');
  const frameBox = await frameElement.boundingBox();
  const selectBox = await select.boundingBox();
  expect(frameBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  expect(selectBox.y - frameBox.y).toBeGreaterThan(1000);
  await select.selectOption('3');
  await expect(select).toHaveValue('3');
});

test('playground marks native and ARIA grid dropdowns as published', async ({ page }) => {
  const comingNote = page.locator('#note-coming');
  await expect(comingNote).toBeHidden();
  await page.locator('#type-trigger').click();
  const nativeType = page.locator('.type-option[data-value="native"]');
  const ariaGridType = page.locator('.type-option[data-value="aria-grid"]');

  await expect(ariaGridType.locator('.type-pill')).toHaveText('Supported');
  await expect(ariaGridType).toHaveClass(/supported/);
  await expect(nativeType.locator('.type-pill')).toHaveText('Supported');
  await expect(nativeType).toHaveClass(/supported/);

  await ariaGridType.click();
  await expect(page.locator('#type-support-config')).toHaveText('Supported');
  await expect(page.locator('#type-support-config')).toHaveClass(/supported/);
  await expect(comingNote).toBeHidden();

  await page.locator('#render').click();
  await expect(page.locator('#dropdown-type .type-support')).toHaveText('Supported');
  await expect(page.locator('#dropdown-type .type-support')).toHaveClass(/supported/);
  await page.locator('#dropdown .dropdown-trigger').click();
  await expect(page.locator('#dropdown [role="grid"]')).toBeVisible();
});

test('ARIA fixture exposes listbox options and performs normal selection', async ({ page }) => {
  await renderFixture(page, { type: 'aria', items });
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const options = page.locator('#dropdown [role="listbox"] [role="option"]');

  await expect(options).toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await options.evaluateAll(elements => elements.map(element => element.getAttribute('value'))))
    .toEqual(['101', '202', '303']);
  await trigger.click();
  await expect(menu).toHaveClass(/open/);
  await options.nth(1).click();
  await expect(trigger).toHaveText('Beta');
  await expect(options.nth(1)).toHaveClass(/selected/);
  await expect(menu).not.toHaveClass(/open/);
});

test('long searchable ARIA fixture is public, supported, searchable, and selectable', async ({ page }) => {
  await renderFixture(page, { type: 'aria-searchable', items });
  const trigger = page.locator('#dropdown .dropdown-select');
  const container = page.locator('#dropdown .dropdown-container');
  const search = page.locator('#dropdown .dropdown-search');
  const options = page.locator('#dropdown [role="listbox"] [role="option"]');

  await expect(page.locator('#type-support-config')).toHaveText('Supported');
  await expect(page.locator('#dropdown-type')).toContainText('Searchable ARIA listbox (long)');
  await expect(trigger).toHaveAttribute('role', 'combobox');
  await expect(trigger).not.toHaveAttribute('aria-controls');
  await expect(container).toHaveAttribute('aria-owns', 'candidate-major_dropdown-results');
  await expect(options).toHaveCount(26);
  await expect(options.nth(0)).toHaveText('Alpha');
  await expect(options.nth(1)).toHaveText('Beta');
  await expect(options.nth(3)).toHaveText('Additional searchable category 4');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await search.fill('category 26');
  await expect(options.nth(0)).toBeHidden();
  await expect(options.nth(25)).toBeVisible();
  await search.fill('Beta');
  await options.nth(1).click();
  await expect(trigger.locator('.dropdown-text')).toHaveText('Beta');
  await expect(container).toHaveClass(/dropdown-invisible/);
});

for (const { label, optionCount } of [
  { label: 'short', optionCount: 3 },
  { label: 'long', optionCount: 26 },
]) {
  test(`searchable ARIA iframe fixture preserves the ${label} component contract`, async ({ page }) => {
    await page.evaluate(count => {
      const frame = document.createElement('iframe');
      frame.id = 'searchable-aria-frame';
      frame.src = `/searchable-aria-frame.html?options=${count}`;
      frame.style.width = '800px';
      frame.style.height = '600px';
      document.querySelector('#dropdown').replaceChildren(frame);
    }, optionCount);
    const frame = page.frameLocator('#searchable-aria-frame');
    const trigger = frame.locator('.dropdown-select');
    const container = frame.locator('.dropdown-container');
    const search = frame.locator('.dropdown-search');
    const options = frame.locator('[role="listbox"] [role="option"]');

    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(trigger).not.toHaveAttribute('aria-controls');
    await expect(container).toHaveAttribute('aria-owns', 'candidate-major_dropdown-results');
    await expect(options).toHaveCount(optionCount);
    await expect(options.nth(0)).toHaveText('Alpha');
    await expect(options.nth(1)).toHaveText('Beta');
    await expect(options.nth(2)).toHaveText('Gamma');
    if (optionCount > 3) {
      await expect(options.nth(3)).toHaveText('Additional searchable category 4');
    }
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await search.fill('Be');
    await expect(options.nth(0)).toBeHidden();
    await expect(options.nth(1)).toBeVisible();
    await options.nth(1).click();
    await expect(trigger.locator('.dropdown-text')).toHaveText('Beta');
    await expect(container).toHaveClass(/dropdown-invisible/);
  });
}

test('tall searchable ARIA iframe fixture places the component below the iframe top', async ({ page }) => {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'tall-searchable-aria-frame';
    frame.src = '/searchable-aria-frame.html?options=3&tall=1';
    frame.style.width = '800px';
    frame.style.height = '1400px';
    document.querySelector('#dropdown').replaceChildren(frame);
  });
  const frameElement = page.locator('#tall-searchable-aria-frame');
  const frame = page.frameLocator('#tall-searchable-aria-frame');
  const trigger = frame.locator('.dropdown-select');
  const container = frame.locator('.dropdown-container');

  await expect(frame.locator('[role="option"]')).toHaveText(['Alpha', 'Beta', 'Gamma']);
  const frameBox = await frameElement.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(frameBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox.y - frameBox.y).toBeGreaterThan(1000);
  await trigger.click();
  await expect(container).not.toHaveClass(/dropdown-invisible/);
  await frame.locator('[role="option"]').nth(1).click();
  await expect(trigger.locator('.dropdown-text')).toHaveText('Beta');
  await expect(container).toHaveClass(/dropdown-invisible/);
});

test('ARIA grid fixture exposes selectable nested grid cells without values', async ({ page }) => {
  await renderFixture(page, { type: 'aria-grid', items });
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const grid = page.locator('#dropdown [role="grid"]');
  const rows = grid.locator('[role="row"]');
  const cells = grid.locator('[role="gridcell"]');

  await expect(grid).toHaveAttribute('aria-label', 'Example choices');
  await expect(rows).toHaveCount(3);
  await expect(cells).toHaveCount(3);
  await expect(cells.locator('.mock-gridcell-content > span:last-child'))
    .toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await cells.evaluateAll(elements => elements.map(element => ({
    value: element.getAttribute('value'),
    dataValue: element.getAttribute('data-value'),
  })))).toEqual([
    { value: null, dataValue: null },
    { value: null, dataValue: null },
    { value: null, dataValue: null },
  ]);

  await trigger.click();
  await expect(menu).toHaveClass(/open/);
  await cells.nth(1).click();
  await expect(trigger).toHaveText('Beta');
  await expect(cells.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(menu).not.toHaveClass(/open/);
});

test('GitHub fixture exposes checkbox values and performs normal selection', async ({ page }) => {
  await renderFixture(page, { type: 'github-selectmenu', items });
  const shell = page.locator('#dropdown .gh-selectmenu');
  const summary = page.locator('#dropdown .gh-selectmenu-summary');
  const rows = page.locator('#dropdown .SelectMenu-list [role="listitem"]');
  const checkboxes = page.locator('#dropdown input[name="list_ids[]"]');

  await expect(rows).toHaveCount(3);
  expect(await checkboxes.evaluateAll(elements => elements.map(element => element.value)))
    .toEqual(['101', '202', '303']);
  await summary.click();
  await expect(shell).toHaveClass(/open/);
  await rows.nth(1).click();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(summary).toContainText('Beta');
  await expect(shell).not.toHaveClass(/open/);
});

test('Dropbox fixture selects on mousedown and closes its menu', async ({ page }) => {
  await renderFixture(page, { type: 'dropbox-menu', items });
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const options = page.locator('#dropdown [role="menu"] [role="menuitem"]');

  await expect(options).toHaveText(['Alpha', 'Beta', 'Gamma']);
  await trigger.click();
  await expect(menu).toHaveClass(/open/);
  await options.nth(1).dispatchEvent('mousedown');
  await expect(trigger).toHaveText('Beta');
  await expect(options.nth(1)).toHaveClass(/selected/);
  await expect(menu).not.toHaveClass(/open/);
});

test('AliExpress fixture uses hrefs and omits competing value fields', async ({ page }) => {
  const aliItems = items.map((item, index) => ({
    ...item,
    dataValue: `also-wrong-${index + 1}`,
    href: `https://example.com/${item.text.toLowerCase()}`,
  }));
  await renderFixture(page, { type: 'aliexpress', items: aliItems });
  const suggestions = page.locator('#dropdown .ali-suggestions');
  const links = suggestions.locator('a');

  await expect(links).toHaveText(['Alpha', 'Beta', 'Gamma']);
  expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute('href'))))
    .toEqual([
      'https://example.com/alpha',
      'https://example.com/beta',
      'https://example.com/gamma',
    ]);
  await expect(links.nth(0)).not.toHaveAttribute('value');
  await expect(links.nth(0)).not.toHaveAttribute('data-value');
  await page.locator('#dropdown #search-words').click();
  await expect(suggestions).toHaveClass(/open/);
  await expect(links.nth(1)).toHaveAttribute('href', 'https://example.com/beta');
});

test('Expedia fixture exposes aria-label text without value fields', async ({ page }) => {
  await renderFixture(page, { type: 'expedia', items });
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const options = page.locator('#dropdown [data-stid="destination_form_field-result-item-button"]');

  await expect(options.nth(0)).toHaveAttribute('aria-label', 'Alpha');
  await expect(options.nth(1)).toHaveAttribute('aria-label', 'Beta');
  await expect(options.nth(2)).toHaveAttribute('aria-label', 'Gamma');
  await expect(options.nth(0)).not.toHaveAttribute('value');
  await expect(options.nth(0)).not.toHaveAttribute('data-value');
  await trigger.click();
  await options.nth(1).click();
  await expect(trigger).toHaveText('Beta');
  await expect(menu).not.toHaveClass(/open/);
});
