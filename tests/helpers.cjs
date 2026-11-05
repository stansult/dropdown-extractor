async function setItems(page, items) {
  await page.locator('#count').fill(String(items.length));
  await page.locator('#count').dispatchEvent('change');
  for (const [index, item] of items.entries()) {
    for (const [field, value] of [
      ['text', item.text],
      ['value', item.value],
      ['data', item.dataValue],
      ['href', item.href],
    ]) {
      await page.locator(`#${field}-${index}`).evaluate((input, nextValue) => {
        input.value = nextValue || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    }
  }
}

async function selectType(page, type) {
  await page.locator('#type-trigger').click();
  await page.locator(`.type-option[data-value="${type}"]`).click();
}

async function renderFixture(page, { type, items, iframe = false }) {
  await selectType(page, type);
  await setItems(page, items);
  await page.locator('#render-in-iframe').setChecked(iframe);
  await page.locator('#render').click();
}

async function clickNativeSelectAndClosePicker(page, select) {
  await select.click();
  await page.keyboard.press('Escape');
  await select.evaluate(async element => {
    const deadline = Date.now() + 1_500;
    while (element.matches(':open')) {
      if (Date.now() >= deadline) {
        throw new Error('Native select picker remained open after Escape.');
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  });
}

module.exports = { clickNativeSelectAndClosePicker, renderFixture, selectType, setItems };
