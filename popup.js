function sendPick(attempt = 1) {
  chrome.runtime.sendMessage({ action: "pick" }, (response) => {
    const err = chrome.runtime.lastError;
    const ok = response && response.ok;

    if ((err || !ok) && attempt < 2) {
      setTimeout(() => sendPick(attempt + 1), 200);
      return;
    }

    window.close();
  });
}

sendPick();
