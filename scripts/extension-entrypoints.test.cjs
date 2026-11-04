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
  const tabMessageCalls = [];
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
        sendMessage(tabId, message, options, callback) {
          tabMessageCalls.push({ tabId, message, options });
          callback();
        },
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
  return { actionCalls, executeCalls, messageListener, tabMessageCalls };
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

test('background injects normal extraction into all accessible frames', () => {
  const background = loadBackground();
  let response;
  assert.equal(background.messageListener({ action: 'pick' }, {}, value => { response = value; }), true);
  assert.deepEqual(plain(background.executeCalls), [{
    target: { tabId: 42, allFrames: true },
    files: ['content.js'],
  }]);
  assert.deepEqual(plain(response), { ok: true });
});

test('background follows the iframe preference only in debug mode', () => {
  const topFrameDebug = loadBackground({ prefs: { debugMode: true, debugAllFrames: false } });
  topFrameDebug.messageListener({ action: 'pick' }, {}, () => {});
  assert.equal(topFrameDebug.executeCalls[0].target.allFrames, false);

  const allFrameDebug = loadBackground({ prefs: { debugMode: true, debugAllFrames: true } });
  allFrameDebug.messageListener({ action: 'pick' }, {}, () => {});
  assert.equal(allFrameDebug.executeCalls[0].target.allFrames, true);
});

test('background ignores stale frame cancellation after successful extraction', () => {
  const background = loadBackground();
  const sender = { tab: { id: 42 } };
  background.messageListener({ action: 'armed' }, sender);
  background.messageListener({ action: 'done' }, sender);
  const actionCountAfterDone = background.actionCalls.length;

  background.messageListener({ action: 'canceled' }, sender);

  assert.equal(background.actionCalls.length, actionCountAfterDone);
});

test('background forwards child-frame success feedback to the top frame', () => {
  const background = loadBackground();
  background.messageListener(
    { action: 'done', feedbackMessage: 'Extracted 3 items' },
    { tab: { id: 42 }, frameId: 7 }
  );
  assert.deepEqual(plain(background.tabMessageCalls), [{
    tabId: 42,
    message: { action: 'show-success-feedback', message: 'Extracted 3 items' },
    options: { frameId: 0 },
  }]);

  background.messageListener(
    { action: 'done', feedbackMessage: 'Top-frame result' },
    { tab: { id: 42 }, frameId: 0 }
  );
  assert.equal(background.tabMessageCalls.length, 1);
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
