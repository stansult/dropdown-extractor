const text = document.getElementById('text');
const value = document.getElementById('value');
const formatRow = document.getElementById('format-row');
const formatOptions = document.querySelectorAll('input[name="format"]');
const debug = document.getElementById('debug');
const TOAST_ERROR_BG = 'rgba(120, 30, 30, 0.85)';

chrome.storage.sync.get(
  { extractText: true, extractValue: false, format: 'text-tab-value', debug: false },
  prefs => {
    text.checked = prefs.extractText;
    value.checked = prefs.extractValue;
    debug.checked = prefs.debug;
    const selected = prefs.format || 'text-tab-value';
    formatOptions.forEach(option => {
      option.checked = option.value === selected;
    });
    updateDebugVisibility();
    updateFormatVisibility();
  }
);

function updateFormatVisibility() {
  const show = text.checked && value.checked;
  formatRow.style.display = show ? 'block' : 'none';
}

function updateDebugVisibility() {
  const disabled = debug.checked;
  text.disabled = disabled;
  value.disabled = disabled;
  formatOptions.forEach(option => {
    option.disabled = disabled;
  });
}

function showInlineToast(target, message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  const rect = target.getBoundingClientRect();

  Object.assign(toast.style, {
    position: 'fixed',
    top: `${Math.max(rect.bottom + 6, 8)}px`,
    left: `${Math.max(rect.left + 24, 8)}px`,
    padding: '6px 8px',
    background: TOAST_ERROR_BG,
    color: '#fff',
    fontSize: '13px',
    borderRadius: '4px',
    zIndex: 999999,
    opacity: '0',
    transition: 'opacity 0.15s ease'
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 150);
  }, 1500);
}

function save() {
  const selectedFormat = [...formatOptions].find(option => option.checked)?.value || 'text-tab-value';
  chrome.storage.sync.set({
    extractText: text.checked,
    extractValue: value.checked,
    format: selectedFormat,
    debug: debug.checked
  });
}

text.onchange = () => {
  if (!text.checked && !value.checked) {
    text.checked = true;
    showInlineToast(text, 'Select at least one option.');
    return;
  }
  updateFormatVisibility();
  save();
};
value.onchange = () => {
  if (!text.checked && !value.checked) {
    value.checked = true;
    showInlineToast(value, 'Select at least one option.');
    return;
  }
  updateFormatVisibility();
  save();
};
formatOptions.forEach(option => {
  option.onchange = save;
});
debug.onchange = () => {
  updateDebugVisibility();
  updateFormatVisibility();
  save();
};
