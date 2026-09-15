const { test, expect } = require('@playwright/test');
const { renderFixture } = require('./helpers.cjs');

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
  await checkboxes.nth(1).click();
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
