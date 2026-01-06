(function () {
  if (window.__dropdownExtractorActive) return;
  window.__dropdownExtractorActive = true;

  let cancelTimer = null;

  // ===== OPTIONS (EXACT PLACE: here, after active flag) =====
  function getPrefs(callback) {
    chrome.storage.sync.get(
      { extractText: true, extractValue: false },
      callback
    );
  }

  // ===== TOAST =====
  function showToast(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      fontSize: '13px',
      borderRadius: '4px',
      zIndex: 999999,
      opacity: '0',
      transition: 'opacity 0.2s ease'
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  // ===== HELPERS =====
  function getVisibleSelectizeContent() {
    return [...document.querySelectorAll('.selectize-dropdown-content')]
      .find(el => el.offsetParent !== null) || null;
  }

  function cleanup() {
    document.removeEventListener('mousedown', onMouseDown, true);
    window.__dropdownExtractorActive = false;

    if (cancelTimer) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }
  }

  // ===== MAIN HANDLER =====
  function onMouseDown(e) {

    // --- 1) Native <select> support ---
    const selectEl = e.target.closest('select');
    if (selectEl) {
      getPrefs(prefs => {
        const items = [...selectEl.options]
          .map(o => {
            if (prefs.extractText && prefs.extractValue)
              return `${o.text.trim()}\t${o.value}`;
            if (prefs.extractValue)
              return o.value;
            return o.text.trim();
          })
          .filter(Boolean);

        if (items.length) {
          navigator.clipboard.writeText(items.join('\n'));
          showToast(`Extracted ${items.length} items`);
          cleanup();
        }
      });
      return;
    }

    // --- 2) Selectize support ---
    const selectizeContent = getVisibleSelectizeContent();
    if (selectizeContent && selectizeContent.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();

      getPrefs(prefs => {
        const items = [...selectizeContent.querySelectorAll('.option')]
          .map(o => {
            const text = o.textContent.trim();
            const value = o.dataset.value;

            if (prefs.extractText && prefs.extractValue)
              return `${text}\t${value}`;
            if (prefs.extractValue)
              return value;
            return text;
          })
          .filter(Boolean);

        if (items.length) {
          navigator.clipboard.writeText(items.join('\n'));
          showToast(`Extracted ${items.length} items`);
          cleanup();
        }
      });
      return;
    }

    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(el => el.offsetParent !== null);

    if (listbox && listbox.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();

      getPrefs(prefs => {
        const items = [...listbox.querySelectorAll('[role="option"]')]
          .map(o => {
            const text = o.textContent.trim();
            const value = o.dataset.value;

            if (prefs.extractText && prefs.extractValue)
              return `${text}\t${value}`;
            if (prefs.extractValue)
              return value;
            return text;
          })
          .filter(Boolean);

        if (items.length) {
          navigator.clipboard.writeText(items.join('\n'));
          showToast(`Extracted ${items.length} items`);
          cleanup();
        }
      });
      return;
    }

    // otherwise: do nothing, allow normal clicks
  }

  document.addEventListener('mousedown', onMouseDown, true);

  showToast('Dropdown extractor armed');

  cancelTimer = setTimeout(() => {
    cleanup();
    showToast('Dropdown extractor canceled', 1500);
  }, 10000);
})();
