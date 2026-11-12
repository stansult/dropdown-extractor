const test = require('node:test');
const assert = require('node:assert/strict');
const { triggerActionWithPopupConfirmation } = require('../tests/extension-harness.cjs');

test('toolbar activation does not retry after Chrome creates the extension popup target', async () => {
  let attempts = 0;
  await triggerActionWithPopupConfirmation(async () => {
    attempts += 1;
    return true;
  });
  assert.equal(attempts, 1);
});

test('toolbar activation retries once when Chrome accepts CDP without creating a popup target', async () => {
  const results = [false, true];
  let attempts = 0;
  await triggerActionWithPopupConfirmation(async () => {
    attempts += 1;
    return results.shift();
  });
  assert.equal(attempts, 2);
});

test('toolbar activation fails after two missing popup targets', async () => {
  let attempts = 0;
  await assert.rejects(
    triggerActionWithPopupConfirmation(async () => {
      attempts += 1;
      return false;
    }),
    /did not create the extension popup target after 2 attempts/
  );
  assert.equal(attempts, 2);
});
