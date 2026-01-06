const text = document.getElementById('text');
const value = document.getElementById('value');

chrome.storage.sync.get(
  { extractText: true, extractValue: false },
  prefs => {
    text.checked = prefs.extractText;
    value.checked = prefs.extractValue;
  }
);

function save() {
  chrome.storage.sync.set({
    extractText: text.checked,
    extractValue: value.checked
  });
}

text.onchange = save;
value.onchange = save;
