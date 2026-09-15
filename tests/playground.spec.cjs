const { test, expect } = require('@playwright/test');
const { renderFixture, selectType } = require('./helpers.cjs');

test('default playground renders five native options without page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dropdown Playground' })).toBeVisible();
  await expect(page.locator('#items tr')).toHaveCount(5);
  await expect(page.locator('#dropdown select option')).toHaveCount(5);
  await expect(page.locator('#dropdown-type')).toContainText('Native <select>');
  expect(errors).toEqual([]);
});

test('playground renders representative ARIA and GitHub fixtures', async ({ page }) => {
  await page.goto('/');
  const items = [
    { text: 'Alpha', value: '101' },
    { text: 'Beta', value: '202' },
    { text: 'Gamma', value: '303' },
  ];

  await renderFixture(page, { type: 'aria', items });
  await page.locator('#dropdown .dropdown-trigger').click();
  await expect(page.locator('#dropdown [role="listbox"] [role="option"]')).toHaveText([
    'Alpha', 'Beta', 'Gamma',
  ]);

  await selectType(page, 'github-selectmenu');
  await page.locator('#render').click();
  await page.locator('#dropdown .gh-selectmenu-summary').click();
  await expect(page.locator('#dropdown .SelectMenu-list [role="listitem"]')).toHaveCount(3);
  await expect(page.locator('#dropdown input[name="list_ids[]"]').nth(0)).toHaveValue('101');
  await expect(page.locator('#dropdown input[name="list_ids[]"]').nth(1)).toHaveValue('202');
  await expect(page.locator('#dropdown input[name="list_ids[]"]').nth(2)).toHaveValue('303');
});
