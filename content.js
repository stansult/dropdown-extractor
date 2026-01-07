(function () {
  function notifyBackground(action) {
    try {
      chrome.runtime.sendMessage({ action });
    } catch (e) {
      // Ignore messaging failures (e.g., if extension context is unavailable).
    }
  }

  // ===== TOAST =====
  function showToast(message, options = {}) {
    const {
      duration = 2000,
      position = 'bottom-right',
      event = null
    } = options;
    const toast = document.createElement('div');
    toast.textContent = message;

    const baseStyle = {
      position: 'fixed',
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      fontSize: '13px',
      borderRadius: '4px',
      zIndex: 999999,
      opacity: '0',
      transition: 'opacity 0.2s ease'
    };

    if (position === 'top-right') {
      Object.assign(baseStyle, { top: '16px', right: '16px' });
    } else if (position === 'cursor' && event) {
      const offset = 12;
      const toastMaxWidth = 240;
      const x = Math.min(
        Math.max(event.clientX + offset, 8),
        window.innerWidth - toastMaxWidth - 8
      );
      const y = Math.min(
        Math.max(event.clientY + offset, 8),
        window.innerHeight - 40
      );
      Object.assign(baseStyle, { left: `${x}px`, top: `${y}px`, maxWidth: `${toastMaxWidth}px` });
    } else {
      Object.assign(baseStyle, { bottom: '16px', right: '16px' });
    }

    Object.assign(toast.style, baseStyle);

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  function armTimer() {
    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
    }
    window.__dropdownExtractorCancelTimer = setTimeout(() => {
      notifyBackground('canceled');
      cleanup();
      showToast('Dropdown extractor canceled', { duration: 1500, position: 'top-right' });
    }, 10000);
  }

  if (window.__dropdownExtractorActive) {
    showToast('Dropdown extractor armed', { position: 'top-right' });
    armTimer();
    notifyBackground('armed');
    return;
  }

  window.__dropdownExtractorActive = true;

  // ===== OPTIONS (EXACT PLACE: here, after active flag) =====
  function getPrefs(callback) {
    chrome.storage.sync.get(
      { extractText: true, extractValue: false },
      callback
    );
  }

  // ===== HELPERS =====
  function getVisibleSelectizeContent() {
    return [...document.querySelectorAll('.selectize-dropdown-content')]
      .find(el => el.offsetParent !== null) || null;
  }

  function cleanup() {
    document.removeEventListener('mousedown', onMouseDown, true);
    window.__dropdownExtractorActive = false;

    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
      window.__dropdownExtractorCancelTimer = null;
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
          showToast(`Extracted ${items.length} items`, { position: 'cursor', event: e });
          notifyBackground('done');
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
          showToast(`Extracted ${items.length} items`, { position: 'cursor', event: e });
          notifyBackground('done');
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
          showToast(`Extracted ${items.length} items`, { position: 'cursor', event: e });
          notifyBackground('done');
          cleanup();
        }
      });
      return;
    }

    // otherwise: do nothing, allow normal clicks
  }

  document.addEventListener('mousedown', onMouseDown, true);

  showToast('Dropdown extractor armed', { position: 'top-right' });
  notifyBackground('armed');

  armTimer();
})();
