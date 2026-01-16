const ARM_DURATION_MS = 10000; // Keep in sync with content.js.
const EXTENSION_TITLE = "Dropdown Extractor";
const FEEDBACK_DURATION_MS = 900;
const ERROR_BADGE_DURATION_MS = 1500;
const STOP_BADGE_DURATION_MS = 1500;
let armIntervalId = null;
let armedTabId = null;

function resetDebugFlag() {
  chrome.storage.sync.set({
    debug: false,
    debugMode: false,
    debugModeTarget: "supported"
  });
}

chrome.runtime.onInstalled.addListener(() => {
  resetDebugFlag();
});

chrome.runtime.onStartup.addListener(() => {
  resetDebugFlag();
});

function clearArmBadge() {
  if (armIntervalId) {
    clearInterval(armIntervalId);
    armIntervalId = null;
  }
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setTitle({ title: EXTENSION_TITLE });
}

function showStoppedBadge() {
  clearArmBadge();
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
  chrome.action.setBadgeBackgroundColor({ color: "#5f6368" });
  chrome.action.setBadgeText({ text: " ■ " });
  chrome.action.setTitle({ title: `${EXTENSION_TITLE}: stopped` });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: EXTENSION_TITLE });
  }, STOP_BADGE_DURATION_MS);
}

function showDoneBadge() {
  clearArmBadge();
  chrome.action.setBadgeBackgroundColor({ color: "#188038" });
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setTitle({ title: `${EXTENSION_TITLE}: extracted` });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: EXTENSION_TITLE });
  }, FEEDBACK_DURATION_MS);
}

function showErrorBadge(titleSuffix) {
  clearArmBadge();
  chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  chrome.action.setBadgeText({ text: "!" });
  const suffix = titleSuffix ? `: ${titleSuffix}` : ": error";
  chrome.action.setTitle({ title: `${EXTENSION_TITLE}${suffix}` });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: EXTENSION_TITLE });
  }, ERROR_BADGE_DURATION_MS);
}

function startArmBadge() {
  clearArmBadge();
  chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  chrome.action.setTitle({ title: `${EXTENSION_TITLE}: armed` });

  let remaining = Math.ceil(ARM_DURATION_MS / 1000);
  chrome.action.setBadgeText({ text: String(remaining) });

  armIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      showStoppedBadge();
      return;
    }
    chrome.action.setBadgeText({ text: String(remaining) });
  }, 1000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "armed") {
    armedTabId = _sender?.tab?.id || null;
    startArmBadge();
    return;
  }

  if (msg.action === "done") {
    armedTabId = null;
    showDoneBadge();
    return;
  }

  if (msg.action === "error") {
    armedTabId = null;
    showErrorBadge("error");
    return;
  }

  if (msg.action === "canceled") {
    armedTabId = null;
    showStoppedBadge();
    return;
  }

  if (msg.action !== "pick") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) {
      sendResponse && sendResponse({ ok: false, error: "No active tab." });
      return;
    }

    chrome.storage.sync.get({ debugMode: false, debugAllFrames: false }, prefs => {
      const allFrames = !!(prefs.debugMode && prefs.debugAllFrames);
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id, allFrames },
        files: ["content.js"]
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          showErrorBadge("can't run on this page");
          sendResponse && sendResponse({ ok: false, error: err.message });
          return;
        }
        sendResponse && sendResponse({ ok: true });
      });
    });
  });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (armedTabId && tabId === armedTabId && changeInfo.status === "loading") {
    armedTabId = null;
    showStoppedBadge();
    return;
  }
});
