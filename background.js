chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
