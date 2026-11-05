const { test, expect, setPrefs, armExtension, clipboardText } = require('./extension-harness.cjs');
const { clickNativeSelectAndClosePicker, renderFixture } = require('./helpers.cjs');

test.describe.configure({ mode: 'serial' });

async function dispatchMouseDownAtCenter(locator) {
  await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + (rect.height / 2),
    }));
  });
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

async function setExtensionWorldNativePickerOpen(worker, open) {
  return worker.evaluate(async nextOpen => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active test tab unavailable.');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'ISOLATED',
      func: value => {
        window.__dropdownExtractorTestNativePickerOpen = value;
        if (!window.__dropdownExtractorTestFocusOverrideInstalled) {
          Object.defineProperty(document, 'hasFocus', {
            configurable: true,
            value: () => true,
          });
          window.__dropdownExtractorTestFocusOverrideInstalled = true;
        }
        if (!window.__dropdownExtractorTestMatchesOverrideInstalled) {
          const originalMatches = Element.prototype.matches;
          Element.prototype.matches = function (selector) {
            if (selector === ':open' && this instanceof HTMLSelectElement) {
              return window.__dropdownExtractorTestNativePickerOpen ?? originalMatches.call(this, selector);
            }
            return originalMatches.call(this, selector);
          };
          window.__dropdownExtractorTestMatchesOverrideInstalled = true;
        }
        return window.__dropdownExtractorTestNativePickerOpen;
      },
      args: [nextOpen],
    });
    return results.map(result => result.result);
  }, open);
}

async function setExtensionWorldClipboardFailure(worker, shouldFail) {
  return worker.evaluate(async fail => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active test tab unavailable.');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',
      func: value => {
        if (!window.__dropdownExtractorOriginalClipboardWrite) {
          window.__dropdownExtractorOriginalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
        }
        navigator.clipboard.writeText = value
          ? () => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'))
          : window.__dropdownExtractorOriginalClipboardWrite;
      },
      args: [fail],
    });
  }, shouldFail);
}

async function renderSearchableAriaFrame(page, optionCount) {
  await page.evaluate(count => {
    const frame = document.createElement('iframe');
    frame.id = 'searchable-aria-frame';
    frame.src = `/searchable-aria-frame.html?options=${count}`;
    frame.style.width = '800px';
    frame.style.height = '600px';
    document.querySelector('#dropdown').replaceChildren(frame);
  }, optionCount);
  const frame = page.frameLocator('#searchable-aria-frame');
  await expect(frame.locator('.dropdown-select')).toBeVisible();
  await expect(frame.locator('[role="option"]')).toHaveCount(optionCount);
  return frame;
}

async function renderTallSearchableAriaFrame(page, optionCount = 3) {
  await page.evaluate(count => {
    const frame = document.createElement('iframe');
    frame.id = 'tall-searchable-aria-frame';
    frame.src = `/searchable-aria-frame.html?options=${count}&tall=1`;
    frame.style.width = '800px';
    frame.style.height = '1400px';
    document.querySelector('#dropdown').replaceChildren(frame);
  }, optionCount);
  const frame = page.frameLocator('#tall-searchable-aria-frame');
  await expect(frame.locator('.dropdown-select')).toBeVisible();
  await expect(frame.locator('[role="option"]')).toHaveCount(optionCount);
  return frame;
}

async function renderNativeSelectFrame(page) {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'native-select-frame';
    frame.src = '/native-select-frame.html';
    frame.style.width = '800px';
    frame.style.height = '300px';
    document.querySelector('#dropdown').replaceChildren(frame);
  });
  const frame = page.frameLocator('#native-select-frame');
  await expect(frame.locator('#education-start-month')).toBeVisible();
  return frame;
}

async function renderTallNativeSelectFrame(page) {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'tall-native-select-frame';
    frame.src = '/tall-native-select-frame.html';
    frame.style.width = '800px';
    frame.style.height = '1400px';
    document.querySelector('#dropdown').replaceChildren(frame);
  });
  const frame = page.frameLocator('#tall-native-select-frame');
  await expect(frame.locator('#education-start-day')).toBeVisible();
  return frame;
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
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Extracted 3 items' })).toBeVisible();
});

test('normal extraction handles a native select in a same-origin iframe', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderNativeSelectFrame(page);
  const select = frame.locator('#education-start-month');
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: false,
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, select);

  await expect(select).toHaveClass(/dropdown-extractor-flash/);
  await expect.poll(() => clipboardText(page)).toBe('Jan\nFeb\nMar');
  await expect(page.locator('.dropdown-extractor-toast', {
    hasText: 'Extracted 3 items to clipboard:\n\n– Jan\n– Feb\n– Mar',
  })).toBeVisible();
  await expect(select).toHaveValue('02');
});

for (const iframe of [false, true]) {
  test(`native select ${iframe ? 'iframe' : 'top-page'} extraction waits for the native picker to close`, async ({
    extensionContext: context, extensionPage: page, extensionWorker: worker,
  }) => {
    await renderFixture(page, { type: 'native', items, iframe });
    const select = iframe
      ? page.frameLocator('#playground-fixture-frame').locator('select')
      : page.locator('#dropdown select');
    await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
    await setPrefs(worker, {
      extractText: true,
      extractValue: false,
      safeCapture: true,
      debugMode: false,
      debugAllFrames: false,
    });
    await armExtension(worker, page, context);

    const openFrames = await setExtensionWorldNativePickerOpen(worker, true);
    expect(openFrames.length).toBeGreaterThanOrEqual(iframe ? 2 : 1);
    expect(openFrames.every(open => open === true)).toBe(true);
    await select.dispatchEvent('mousedown');
    await page.waitForTimeout(250);

    const success = page.locator('.dropdown-extractor-toast', {
      hasText: 'Extracted 3 items to clipboard:',
    });
    expect(await success.count(), 'success waits until Chrome releases the native picker')
      .toBe(0);

    await select.focus();
    const closedFrames = await setExtensionWorldNativePickerOpen(worker, false);
    expect(closedFrames.every(open => open === false)).toBe(true);
    await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
    await expect(success).toBeVisible();
  });
}

test('native select reports clipboard rejection instead of false success', async ({
  extensionContext: context, extensionPage: page, extensionWorker: worker,
}) => {
  await renderFixture(page, { type: 'native', items });
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  await setExtensionWorldClipboardFailure(worker, true);
  await page.locator('#dropdown select').dispatchEvent('mousedown');

  const error = page.locator('.dropdown-extractor-toast', {
    hasText: 'Could not copy dropdown items to clipboard.',
  });
  await expect(error).toBeVisible();
  expect(await page.locator('.dropdown-extractor-toast', {
    hasText: 'Extracted 3 items to clipboard:',
  }).count()).toBe(0);
  await expect.poll(() => clipboardText(page)).toBe('unchanged');
});

test('iframe extraction shows success feedback in the current top-level viewport', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderTallNativeSelectFrame(page);
  const select = frame.locator('#education-start-day');
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: false,
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, select);

  const expectedFeedback = 'Extracted 3 items to clipboard:\n\n– 1\n– 2\n– 3';
  await expect(select).toHaveClass(/dropdown-extractor-flash/);
  const topSuccess = page.locator('.dropdown-extractor-toast', { hasText: expectedFeedback });
  await expect(topSuccess).toBeVisible();
  await expect(topSuccess).toBeInViewport();
  await expect(topSuccess).toHaveText(expectedFeedback);
  await expect(select).toHaveValue('2');
});

test('iframe extraction error feedback is visible in the current top-level viewport', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderTallNativeSelectFrame(page);
  const select = frame.locator('#education-start-day');
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: false,
    extractValue: false,
    safeCapture: true,
    debugMode: false,
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, select);

  const expectedFeedback = 'No extract option selected.';
  await expect.poll(() => clipboardText(page)).toBe('unchanged');
  const topError = page.locator('.dropdown-extractor-toast', { hasText: expectedFeedback });
  await expect(topError).toBeVisible();
  await expect(topError).toBeInViewport();
  await expect(topError).toHaveText(expectedFeedback);
});

test('iframe supported-debug completion feedback is visible in the current top-level viewport', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderTallNativeSelectFrame(page);
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'supported',
    debugAllFrames: true,
  });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, frame.locator('#education-start-day'));

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: supported dropdown ---');
  const expectedFeedback = 'Debug: copied dropdown HTML';
  const topSuccess = page.locator('.dropdown-extractor-toast', { hasText: expectedFeedback });
  await expect(topSuccess).toBeVisible();
  await expect(topSuccess).toBeInViewport();
  await expect(topSuccess).toHaveText(expectedFeedback);
});

test('iframe Any-two 1/2 feedback is visible in the current top-level viewport', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderTallSearchableAriaFrame(page);
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
    debugAllFrames: true,
  });
  await armExtension(worker, page, context);
  await frame.locator('.dropdown-select').click();

  const expectedFeedback = 'Debug: copied HTML (1/2, menu container)';
  const topProgress = page.locator('.dropdown-extractor-toast', { hasText: expectedFeedback });
  await expect(topProgress).toBeVisible();
  await expect(topProgress).toBeInViewport();
  await expect(topProgress).toHaveText(expectedFeedback);
});

test('iframe Any-two 2/2 feedback is visible in the current top-level viewport', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderTallSearchableAriaFrame(page);
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
    debugAllFrames: true,
  });
  await armExtension(worker, page, context);
  const trigger = frame.locator('.dropdown-select');
  await trigger.click();
  await frame.locator('[role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
  await expect.poll(() => clipboardText(page)).toContain('text: "Beta"');
  const expectedFeedback = 'Debug: copied HTML (2/2, option)';
  const topSuccess = page.locator('.dropdown-extractor-toast', { hasText: expectedFeedback });
  await expect(topSuccess).toBeVisible();
  await expect(topSuccess).toBeInViewport();
  await expect(topSuccess).toHaveText(expectedFeedback);
  await expect(trigger.locator('.dropdown-text')).toHaveText('Alpha');
});

test('safe capture extracts an ARIA list without selecting the clicked option', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria', items });
  await setPrefs(worker, { extractText: true, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const options = page.locator('#dropdown [role="option"]');
  await expect(trigger).toHaveText('Alpha');
  await trigger.click();
  await options.nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger).toHaveText('Alpha');
  await expect(options.nth(1)).not.toHaveClass(/selected/);
  await expect(menu).toHaveClass(/open/);
});

test('normal extraction handles a supported ARIA listbox in a same-origin iframe', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderSearchableAriaFrame(page, 3);
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: false,
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  const trigger = frame.locator('.dropdown-select');
  const container = frame.locator('.dropdown-container');
  await trigger.click();
  await frame.locator('[role="option"]').nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(trigger.locator('.dropdown-text')).toHaveText('Alpha');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(container).not.toHaveClass(/dropdown-invisible/);
});

test('extracts text-only ARIA grid cells without selecting the clicked option', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'aria-grid', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: true,
    format: 'text-brackets-value',
    safeCapture: true,
    debugMode: false,
  });
  await armExtension(worker, page, context);
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  const cells = page.locator('#dropdown [role="gridcell"]');
  await expect(trigger).toHaveText('Alpha');
  await trigger.click();
  await cells.nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Only text extracted, no values found.' })).toBeVisible();
  await expect(trigger).toHaveText('Alpha');
  await expect(cells.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(cells.nth(1)).toHaveAttribute('aria-selected', 'false');
  await expect(menu).toHaveClass(/open/);
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
  const shell = page.locator('#dropdown .gh-selectmenu');
  const summary = page.locator('#dropdown .gh-selectmenu-summary');
  const rows = page.locator('#dropdown [role="listitem"]');
  const checkboxes = page.locator('#dropdown input[name="list_ids[]"]');
  await summary.click();
  await rows.nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha [101]\nBeta [202]\nGamma [303]');
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await expect(summary).toContainText('Select lists');
  await expect(shell).toHaveClass(/open/);
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
  const trigger = page.locator('#dropdown .dropdown-trigger');
  const menu = page.locator('#dropdown .dropdown-menu');
  await trigger.click();
  await options.nth(1).click();

  await expect.poll(() => clipboardText(page)).toBe('Alpha\nBeta\nGamma');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Only text extracted, no values found.' })).toBeVisible();
  await expect(trigger).toHaveText('Alpha');
  await expect(options.nth(1)).not.toHaveClass(/selected/);
  await expect(menu).toHaveClass(/open/);
});

test('extracts native values without text', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, { extractText: false, extractValue: true, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

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
    await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));
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
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));
  await expect.poll(() => clipboardText(page)).toBe('Alpha 101\nBeta 202\nGamma 303');

  await setPrefs(worker, { format: 'text-dash-value' });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

  await expect.poll(() => clipboardText(page)).toBe('Alpha - 101\nBeta - 202\nGamma - 303');
});

test('reports an error when neither text nor value is selected', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, { extractText: false, extractValue: false, safeCapture: true, debugMode: false });
  await armExtension(worker, page, context);
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

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
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

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
  await clickNativeSelectAndClosePicker(page, page.locator('#dropdown select'));

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: supported dropdown ---');
  await expect.poll(() => clipboardText(page)).toContain('tag: SELECT');
  await expect.poll(() => clipboardText(page)).toContain('<option value="202">Beta</option>');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied dropdown HTML' })).toBeVisible();
});

test('Any two debug captures a native select and changed option with Safe Capture on', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  const select = page.locator('#dropdown select');
  await dispatchMouseDownAtCenter(select);

  const firstFeedback = page.locator('.dropdown-extractor-toast', {
    hasText: 'Debug: copied HTML (1/2, menu container)',
  });
  await expect(firstFeedback).toBeVisible();
  await expect(firstFeedback).toBeInViewport();
  await select.selectOption('202');

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 1. menu container ---');
  await expect.poll(() => clipboardText(page)).toContain('tag: SELECT');
  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
  await expect.poll(() => clipboardText(page)).toContain('tag: OPTION');
  await expect.poll(() => clipboardText(page)).toContain('text: "Beta"');
  const secondFeedback = page.locator('.dropdown-extractor-toast', {
    hasText: 'Debug: copied HTML (2/2, option)',
  });
  await expect(secondFeedback).toBeVisible();
  await expect(secondFeedback).toBeInViewport();
  await expect(select).toHaveValue('202');
});

test('Any two progress feedback moves away from the pointer while capture remains active', async ({
  extensionContext: context, extensionPage: page, extensionWorker: worker,
}) => {
  await renderFixture(page, { type: 'native', items });
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
    debugAllFrames: false,
  });
  await armExtension(worker, page, context);
  await dispatchMouseDownAtCenter(page.locator('#dropdown select'));

  const progress = page.locator('.dropdown-extractor-toast', {
    hasText: 'Debug: copied HTML (1/2, menu container)',
  });
  await expectToastMovesFromTopRight(page, progress);
});

test('Any two debug captures a native select and changed option in a same-origin iframe', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  const frame = await renderNativeSelectFrame(page);
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: true,
    debugMode: true,
    debugModeTarget: 'any-two',
    debugAllFrames: true,
  });
  await armExtension(worker, page, context);
  const select = frame.locator('#education-start-month');
  await dispatchMouseDownAtCenter(select);

  const firstFeedback = page.locator('.dropdown-extractor-toast', {
    hasText: 'Debug: copied HTML (1/2, menu container)',
  });
  await expect(firstFeedback).toBeVisible();
  await expect(firstFeedback).toBeInViewport();
  await select.selectOption('03');

  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 1. menu container ---');
  await expect.poll(() => clipboardText(page)).toContain('id: education-start-month');
  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
  await expect.poll(() => clipboardText(page)).toContain('valueAttr: "03"');
  await expect.poll(() => clipboardText(page)).toContain('text: "Mar"');
  const secondFeedback = page.locator('.dropdown-extractor-toast', {
    hasText: 'Debug: copied HTML (2/2, option)',
  });
  await expect(secondFeedback).toBeVisible();
  await expect(secondFeedback).toBeInViewport();
  await expect(select).toHaveValue('03');
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

test('Any two debug completes without an exception when the same fallback element is captured twice', async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
  await renderFixture(page, { type: 'native', items });
  const fallbackTarget = page.locator('#any-two-fallback-target');
  await page.locator('#dropdown').evaluate(container => {
    const target = document.createElement('div');
    target.id = 'any-two-fallback-target';
    target.textContent = 'Uncategorized test target';
    target.style.cssText = 'width: 180px; height: 32px;';
    container.replaceChildren(target);
  });
  await expect(fallbackTarget).toHaveText('Uncategorized test target');
  await expect(fallbackTarget).toBeVisible();
  await setPrefs(worker, {
    extractText: true,
    extractValue: false,
    safeCapture: false,
    debugMode: true,
    debugModeTarget: 'any-two',
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await armExtension(worker, page, context);
  const box = await fallbackTarget.boundingBox();
  if (!box) throw new Error('Any-two fallback target is not visible.');
  const mouseEvent = {
    clientX: box.x + (box.width / 2),
    clientY: box.y + (box.height / 2),
  };
  await fallbackTarget.dispatchEvent('mousedown', mouseEvent);
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied HTML (1/2, uncategorized)' })).toBeVisible();
  await fallbackTarget.dispatchEvent('mousedown', mouseEvent);

  await expect.poll(async () => {
    if (pageErrors.length) return `page error: ${pageErrors.join(' | ')}`;
    return clipboardText(page);
  }).toContain('--- dropdown-extractor: 1. uncategorized ---');
  await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
  await expect.poll(() => clipboardText(page)).toContain('id: any-two-fallback-target');
  await expect(page.locator('.dropdown-extractor-toast', { hasText: 'Debug: copied HTML (2/2, option)' })).toBeVisible();
  expect(pageErrors).not.toContain('optionEl is not defined');
});

for (const { label, optionCount } of [
  { label: 'short', optionCount: 3 },
  { label: 'long', optionCount: 26 },
]) {
  test(`Any two debug captures a ${label} searchable ARIA menu and mouse-selected option`, async ({ extensionContext: context, extensionPage: page, extensionWorker: worker }) => {
    const frame = await renderSearchableAriaFrame(page, optionCount);
    await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
    await setPrefs(worker, {
      extractText: true,
      extractValue: false,
      safeCapture: true,
      debugMode: true,
      debugModeTarget: 'any-two',
      debugAllFrames: true,
    });
    await armExtension(worker, page, context);
    const trigger = frame.locator('.dropdown-select');
    await trigger.click();
    const firstFeedback = page.locator('.dropdown-extractor-toast', {
      hasText: 'Debug: copied HTML (1/2, menu container)',
    });
    await expect(firstFeedback).toBeVisible();
    await expect(firstFeedback).toBeInViewport();
    await frame.locator('[role="option"]').nth(1).click();

    await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 1. menu container ---');
    await expect.poll(() => clipboardText(page)).toContain('--- dropdown-extractor: 2. menu option ---');
    await expect.poll(() => clipboardText(page)).toContain('text: "Beta"');
    const secondFeedback = page.locator('.dropdown-extractor-toast', {
      hasText: 'Debug: copied HTML (2/2, option)',
    });
    await expect(secondFeedback).toBeVisible();
    await expect(secondFeedback).toBeInViewport();
    await expect(trigger.locator('.dropdown-text')).toHaveText('Alpha');
  });
}
