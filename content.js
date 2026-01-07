(function () {
  function notifyBackground(action) {
    try {
      chrome.runtime.sendMessage({ action });
    } catch (e) {
      // Ignore messaging failures (e.g., if extension context is unavailable).
    }
  }

  const ARM_DURATION_MS = 10000; // Keep in sync with background.js.
  const EXTRACTED_PREVIEW_COUNT = 3;
  const EXTRACTED_PREVIEW_MAX_CHARS = 60;
  const EXTRACTED_TOAST_MS = 5000;
  const ARMED_TOAST_TEXT = 'Click a dropdown, then click any item to copy the full list.';
  const TOAST_INFO_BG = 'rgba(20, 40, 70, 0.75)';
  const TOAST_SUCCESS_BG = 'rgba(20, 70, 40, 0.75)';
  const TOAST_EXPIRED_BG = 'rgba(60, 60, 60, 0.75)';

  // ===== TOAST =====
  function showToast(message, options = {}) {
    const {
      duration = 2000,
      position = 'bottom-right',
      event = null,
      background = TOAST_INFO_BG
    } = options;
    const toast = document.createElement('div');
    toast.textContent = message;

    const baseStyle = {
      position: 'fixed',
      padding: '8px 12px',
      background,
      color: '#fff',
      fontSize: '13px',
      lineHeight: '1.3',
      whiteSpace: 'pre-line',
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

    return toast;
  }

  function closeToast(toast) {
    if (!toast) return;
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }

  function replaceActiveToast(toast) {
    if (window.__dropdownExtractorActiveToast) {
      closeToast(window.__dropdownExtractorActiveToast);
    }
    window.__dropdownExtractorActiveToast = toast;
    return toast;
  }

  function clearArmedToast() {
    if (window.__dropdownExtractorArmedToast) {
      closeToast(window.__dropdownExtractorArmedToast);
      window.__dropdownExtractorArmedToast = null;
    }
  }

  function showArmedToast() {
    clearArmedToast();
    window.__dropdownExtractorArmedToast = replaceActiveToast(showToast(ARMED_TOAST_TEXT, {
      position: 'top-right',
      duration: ARM_DURATION_MS,
      background: TOAST_INFO_BG
    }));
  }

  function handleContextInvalid() {
    clearArmedToast();
    cleanup();
  }

  function buildExtractedMessage(items) {
    const truncateItem = (text) => {
      if (text.length <= EXTRACTED_PREVIEW_MAX_CHARS) return text;
      return `${text.slice(0, EXTRACTED_PREVIEW_MAX_CHARS - 1)}…`;
    };
    const preview = items.slice(0, EXTRACTED_PREVIEW_COUNT);
    const lines = preview.map(item => `– ${truncateItem(item)}`);
    if (items.length > EXTRACTED_PREVIEW_COUNT) {
      lines.push('…');
    }
    return `Extracted ${items.length} items to clipboard:\n\n${lines.join('\n')}`;
  }

  function armTimer() {
    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
    }
    window.__dropdownExtractorCancelTimer = setTimeout(() => {
      clearArmedToast();
      notifyBackground('canceled');
      cleanup();
      replaceActiveToast(showToast('Dropdown extractor canceled', {
        duration: 1500,
        position: 'top-right',
        background: TOAST_EXPIRED_BG
      }));
    }, ARM_DURATION_MS);
  }

  if (window.__dropdownExtractorActive) {
    showArmedToast();
    armTimer();
    notifyBackground('armed');
    return;
  }

  window.__dropdownExtractorActive = true;

  // ===== OPTIONS (EXACT PLACE: here, after active flag) =====
  function getPrefs(callback) {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      handleContextInvalid();
      return;
    }
    try {
      chrome.storage.sync.get(
        { extractText: true, extractValue: false },
        callback
      );
    } catch (e) {
      handleContextInvalid();
    }
  }

  // ===== HELPERS =====
  function getVisibleSelectizeContent() {
    return [...document.querySelectorAll('.selectize-dropdown-content')]
      .find(el => el.offsetParent !== null) || null;
  }

  function getVisibleReactSelectMenuList() {
    return [...document.querySelectorAll('[class*="react-select__menu-list"]')]
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
          clearArmedToast();
          replaceActiveToast(showToast(buildExtractedMessage(items), {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
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
          clearArmedToast();
          replaceActiveToast(showToast(buildExtractedMessage(items), {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          notifyBackground('done');
          cleanup();
        }
      });
      return;
    }

    // --- 3) React Select support ---
    const reactSelectMenuList = getVisibleReactSelectMenuList();
    if (reactSelectMenuList) {
      e.preventDefault();
      e.stopPropagation();

      getPrefs(prefs => {
        const options = [
          ...reactSelectMenuList.querySelectorAll('[class*="react-select__option"]'),
          ...reactSelectMenuList.querySelectorAll('[id^="react-select-"][id*="-option-"]'),
          ...reactSelectMenuList.querySelectorAll('[aria-disabled],[aria-selected]')
        ];
        const uniqueOptions = [...new Set(options)]
          .filter(el => !el.className.includes('react-select__group-heading'));
        const items = uniqueOptions
          .map(o => {
            const text = o.textContent.trim();
            const value = o.dataset.value;

            if (prefs.extractText && prefs.extractValue)
              return `${text}\t${value ?? ''}`.trim();
            if (prefs.extractValue)
              return value || '';
            return text;
          })
          .filter(Boolean);

        if (items.length) {
          navigator.clipboard.writeText(items.join('\n'));
          clearArmedToast();
          replaceActiveToast(showToast(buildExtractedMessage(items), {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
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
          clearArmedToast();
          replaceActiveToast(showToast(buildExtractedMessage(items), {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          notifyBackground('done');
          cleanup();
        }
      });
      return;
    }

    // otherwise: do nothing, allow normal clicks
  }

  document.addEventListener('mousedown', onMouseDown, true);

  showArmedToast();
  notifyBackground('armed');

  armTimer();
})();
