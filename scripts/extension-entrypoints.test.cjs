const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const popupSource = readFileSync('popup.js', 'utf8');
const backgroundSource = readFileSync('background.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadPopup(sendMessage) {
  const timers = [];
  let closes = 0;
  const runtime = { lastError: null, sendMessage };
  const context = {
    chrome: { runtime },
    setTimeout(callback) { timers.push(callback); },
    window: { close() { closes += 1; } },
  };
  vm.runInNewContext(popupSource, context, { filename: 'popup.js' });
  return { runtime, timers, closes: () => closes };
}

function loadBackground({ tabs = [{ id: 42 }], prefs = {}, injectionError = null } = {}) {
  let messageListener;
  const executeCalls = [];
  const actionCalls = [];
  const runtime = {
    lastError: null,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(listener) { messageListener = listener; } },
  };
  const context = {
    chrome: {
      runtime,
      storage: {
        sync: {
          set() {},
          get(_defaults, callback) { callback(prefs); },
        },
      },
      tabs: {
        query(_query, callback) { callback(tabs); },
        onUpdated: { addListener() {} },
      },
      scripting: {
        executeScript(options, callback) {
          executeCalls.push(options);
          runtime.lastError = injectionError ? { message: injectionError } : null;
          callback();
          runtime.lastError = null;
        },
      },
      action: new Proxy({}, {
        get(_target, property) {
          return options => actionCalls.push([property, options]);
        },
      }),
    },
    clearInterval() {},
    setInterval() { return 1; },
    setTimeout() { return 1; },
  };
  vm.runInNewContext(backgroundSource, context, { filename: 'background.js' });
  return { actionCalls, executeCalls, messageListener };
}

test('popup sends pick once and closes after success', () => {
  let calls = 0;
  const popup = loadPopup((_message, callback) => {
    calls += 1;
    callback({ ok: true });
  });
  assert.equal(calls, 1);
  assert.equal(popup.timers.length, 0);
  assert.equal(popup.closes(), 1);
});

test('popup retries pick once after failure, then closes', () => {
  let calls = 0;
  let popup;
  popup = loadPopup((_message, callback) => {
    calls += 1;
    callback(calls === 1 ? undefined : { ok: true });
  });
  assert.equal(calls, 1);
  assert.equal(popup.timers.length, 1);
  popup.runtime.lastError = null;
  popup.timers.shift()();
  assert.equal(calls, 2);
  assert.equal(popup.closes(), 1);
});

test('background injects content into the active tab and responds successfully', () => {
  const background = loadBackground();
  let response;
  assert.equal(background.messageListener({ action: 'pick' }, {}, value => { response = value; }), true);
  assert.deepEqual(plain(background.executeCalls), [{
    target: { tabId: 42, allFrames: false },
    files: ['content.js'],
  }]);
  assert.deepEqual(plain(response), { ok: true });
});

test('background enables all-frame injection only for all-frame debug mode', () => {
  const background = loadBackground({ prefs: { debugMode: true, debugAllFrames: true } });
  background.messageListener({ action: 'pick' }, {}, () => {});
  assert.equal(background.executeCalls[0].target.allFrames, true);

  const nonDebug = loadBackground({ prefs: { debugMode: false, debugAllFrames: true } });
  nonDebug.messageListener({ action: 'pick' }, {}, () => {});
  assert.equal(nonDebug.executeCalls[0].target.allFrames, false);
});

test('background reports missing tabs and injection failures', () => {
  const noTab = loadBackground({ tabs: [] });
  let noTabResponse;
  noTab.messageListener({ action: 'pick' }, {}, value => { noTabResponse = value; });
  assert.deepEqual(plain(noTabResponse), { ok: false, error: 'No active tab.' });

  const failed = loadBackground({ injectionError: 'Blocked page' });
  let failedResponse;
  failed.messageListener({ action: 'pick' }, {}, value => { failedResponse = value; });
  assert.deepEqual(plain(failedResponse), { ok: false, error: 'Blocked page' });
  assert.equal(failed.actionCalls.some(([method]) => method === 'setBadgeText'), true);
});
