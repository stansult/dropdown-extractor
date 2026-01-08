const ARM_DURATION_MS = 10000;
let armIntervalId = null;

function resetDebugFlag() {
  chrome.storage.sync.set({ debug: false });
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
  chrome.action.setTitle({ title: "Dropdown Extractor" });
}

function startArmBadge() {
  clearArmBadge();
  chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  chrome.action.setTitle({ title: "Dropdown Extractor: armed" });

  let remaining = Math.ceil(ARM_DURATION_MS / 1000);
  chrome.action.setBadgeText({ text: String(remaining) });

  armIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearArmBadge();
      return;
    }
    chrome.action.setBadgeText({ text: String(remaining) });
  }, 1000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "armed") {
    startArmBadge();
    return;
  }

  if (msg.action === "done" || msg.action === "canceled") {
    clearArmBadge();
    return;
  }

  if (msg.action !== "pick") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) {
      sendResponse && sendResponse({ ok: false, error: "No active tab." });
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"]
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        clearArmBadge();
        chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setTitle({ title: "Dropdown Extractor: can't run on this page" });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
          chrome.action.setTitle({ title: "Dropdown Extractor" });
        }, 2000);
        sendResponse && sendResponse({ ok: false, error: err.message });
        return;
      }
      sendResponse && sendResponse({ ok: true });
    });
  });
  return true;
});
