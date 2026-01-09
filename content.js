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
  const NO_ITEMS_FOUND_TEXT = 'No items found to extract.';
  const TOAST_INFO_BG = 'rgba(20, 40, 70, 0.75)';
  const TOAST_SUCCESS_BG = 'rgba(20, 70, 40, 0.75)';
  const TOAST_EXPIRED_BG = 'rgba(60, 60, 60, 0.75)';
  const TOAST_ERROR_BG = 'rgba(120, 30, 30, 0.85)';

  // ===== TOAST =====
  function moveToastToCorner(toast, corner) {
    const rect = toast.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    let left = 16;
    let top = 16;

    if (corner === 'top-right') {
      left = Math.max(16, window.innerWidth - width - 16);
      top = 16;
    } else if (corner === 'top-left') {
      left = 16;
      top = 16;
    } else if (corner === 'bottom-left') {
      left = 16;
      top = Math.max(16, window.innerHeight - height - 16);
    } else {
      left = Math.max(16, window.innerWidth - width - 16);
      top = Math.max(16, window.innerHeight - height - 16);
    }

    Object.assign(toast.style, {
      right: '',
      bottom: '',
      left: `${left}px`,
      top: `${top}px`
    });
    toast.dataset.corner = corner;
  }

  function getOppositeCorner(corner) {
    if (corner === 'top-right') return 'top-left';
    if (corner === 'top-left') return 'top-right';
    if (corner === 'bottom-right') return 'bottom-left';
    return 'bottom-right';
  }

  function showToast(message, options = {}) {
    const {
      duration = 2000,
      position = 'bottom-right',
      event = null,
      background = TOAST_INFO_BG,
      allowMove = false
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
      transition: 'opacity 0.2s ease, top 0.35s ease, right 0.35s ease, bottom 0.35s ease, left 0.35s ease'
    };

    let pendingCorner = null;
    if (position === 'top-right') {
      pendingCorner = 'top-right';
    } else if (position === 'top-left') {
      pendingCorner = 'top-left';
    } else if (position === 'bottom-left') {
      pendingCorner = 'bottom-left';
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
      pendingCorner = 'bottom-right';
    }

    Object.assign(toast.style, baseStyle);
    if (allowMove) {
      if (position === 'cursor') {
        toast.dataset.corner = 'cursor';
      }

      toast.addEventListener('mouseenter', () => {
        if (toast.dataset.hoverTimeoutId) return;
        const timeoutId = setTimeout(() => {
          const corner = toast.dataset.corner || 'bottom-right';
          if (corner === 'cursor') {
            moveToastToCorner(toast, 'top-left');
            return;
          }
          moveToastToCorner(toast, getOppositeCorner(corner));
          toast.dataset.hoverTimeoutId = '';
        }, 1000);
        toast.dataset.hoverTimeoutId = String(timeoutId);
      });

      toast.addEventListener('mouseleave', () => {
        const timeoutId = Number(toast.dataset.hoverTimeoutId);
        if (timeoutId) clearTimeout(timeoutId);
        toast.dataset.hoverTimeoutId = '';
      });
    }

    document.body.appendChild(toast);

    if (allowMove && pendingCorner) {
      const originalTransition = toast.style.transition;
      toast.style.transition = 'none';
      moveToastToCorner(toast, pendingCorner);
      toast.offsetHeight;
      toast.style.transition = originalTransition;
    }

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
      background: TOAST_INFO_BG,
      allowMove: true
    }));
  }

  function handleContextInvalid() {
    clearArmedToast();
    cleanup();
  }

  function buildExtractedMessage(items, note) {
    const truncateItem = (text) => {
      if (text.length <= EXTRACTED_PREVIEW_MAX_CHARS) return text;
      return `${text.slice(0, EXTRACTED_PREVIEW_MAX_CHARS - 1)}…`;
    };
    const preview = items.slice(0, EXTRACTED_PREVIEW_COUNT);
    const lines = preview.map(item => `– ${truncateItem(item)}`);
    if (items.length > EXTRACTED_PREVIEW_COUNT) {
      lines.push('…');
    }
    const message = `Extracted ${items.length} items to clipboard:\n\n${lines.join('\n')}`;
    return note ? `${message}\n\n${note}` : message;
  }

  function formatTextValue(text, value, format) {
    const safeText = text ?? '';
    const safeValue = value ?? '';
    switch (format) {
      case 'text-space-value':
        return `${safeText} ${safeValue}`.trim();
      case 'text-dash-value':
        return `${safeText} - ${safeValue}`.trim();
      case 'text-pipe-value':
        return `${safeText} | ${safeValue}`.trim();
      case 'text-linebreak-value':
        return `${safeText}\n${safeValue}`.trim();
      case 'text-parens-value':
        return safeValue ? `${safeText} (${safeValue})` : safeText;
      case 'text-brackets-value':
        return safeValue ? `${safeText} [${safeValue}]` : safeText;
      case 'text-tab-value':
      default:
        return `${safeText}\t${safeValue}`.trim();
    }
  }

  function normalizeField(value) {
    return value == null ? '' : String(value).trim();
  }

  function getValueField(el) {
    if (!el || !el.getAttribute) return '';
    const attr = el.getAttribute('value');
    if (el.tagName === 'OPTION' && attr === null) {
      return '';
    }
    return el.value || attr;
  }

  function getOptionLabelText(optionEl) {
    if (!optionEl || optionEl.nodeType !== Node.ELEMENT_NODE) return '';
    const clone = optionEl.cloneNode(true);
    clone.querySelectorAll('svg, title').forEach(el => el.remove());
    return clone.textContent;
  }

  function resolveFields(items, getText, valueGetters) {
    const texts = items.map(item => normalizeField(getText(item)));
    let values = [];
    let valuesFound = false;

    for (const getter of valueGetters) {
      const candidate = items.map(item => normalizeField(getter(item)));
      if (candidate.some(Boolean)) {
        values = candidate;
        valuesFound = true;
        break;
      }
    }

    if (!valuesFound) {
      values = items.map(() => '');
    }

    const textsFound = texts.some(Boolean);
    return { texts, values, textsFound, valuesFound };
  }

  function buildOutput(fields, prefs) {
    const { texts, values, textsFound, valuesFound } = fields;
    const wantsBoth = prefs.extractText && prefs.extractValue;

    if (wantsBoth) {
      if (!textsFound && !valuesFound) {
        return { items: [], note: null, error: 'No text or values found.' };
      }
      if (!valuesFound && textsFound) {
        return {
          items: texts.filter(Boolean),
          note: 'Only text extracted, no values found.',
          error: null
        };
      }
      if (!textsFound && valuesFound) {
        return {
          items: values.filter(Boolean),
          note: 'Only values extracted, no text found.',
          error: null
        };
      }
      return {
        items: texts.map((text, i) => formatTextValue(text, values[i], prefs.format)).filter(Boolean),
        note: null,
        error: null
      };
    }

    if (prefs.extractText) {
      return { items: texts.filter(Boolean), note: null, error: null };
    }

    if (prefs.extractValue) {
      return { items: values.filter(Boolean), note: null, error: null };
    }

    return { items: [], note: null, error: 'No extract option selected.' };
  }

  function showErrorToast(message) {
    clearArmedToast();
    replaceActiveToast(showToast(message, {
      position: 'top-right',
      duration: 2000,
      background: TOAST_ERROR_BG
    }));
  }

  function formatDebugText(value) {
    return value ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function getElementClassName(element) {
    if (!element) return '';
    if (typeof element.className === 'string') return element.className.trim();
    return (element.getAttribute('class') || '').trim();
  }

  function getAttributesByPrefix(element, prefix) {
    const attrs = {};
    if (!element || !element.attributes) return attrs;
    for (const attr of element.attributes) {
      if (attr.name.startsWith(prefix)) {
        attrs[attr.name.slice(prefix.length)] = attr.value;
      }
    }
    return attrs;
  }

  function getDataAttributes(element) {
    if (!element || !element.dataset) return {};
    return Object.keys(element.dataset).reduce((acc, key) => {
      acc[key] = element.dataset[key];
      return acc;
    }, {});
  }

  function buildDebugBlock(element, label) {
    if (!element) return '';
    const html = element.outerHTML;
    if (!html || !html.trim()) return '';
    const tag = element.tagName || '';
    const id = element.id || '';
    const className = getElementClassName(element);
    const role = element.getAttribute?.('role') || '';
    const valueProp = 'value' in element ? element.value : '';
    const valueAttr = element.getAttribute?.('value') || '';
    const aria = getAttributesByPrefix(element, 'aria-');
    const data = getDataAttributes(element);
    const text = formatDebugText(element.textContent || '');
    return [
      `--- dropdown-extractor: ${label} ---`,
      `tag: ${tag}`,
      `id: ${id}`,
      `class: ${className}`,
      `role: ${role}`,
      `valueProp: ${JSON.stringify(valueProp)}`,
      `valueAttr: ${JSON.stringify(valueAttr)}`,
      `aria: ${JSON.stringify(aria)}`,
      `data: ${JSON.stringify(data)}`,
      `text: ${JSON.stringify(text)}`,
      'outerHTML:',
      html
    ].join('\n');
  }

  function copyDebugHtml(element, label) {
    const block = buildDebugBlock(element, label);
    if (!block) return false;
    navigator.clipboard.writeText(block);
    clearArmedToast();
    replaceActiveToast(showToast('Debug: copied dropdown HTML', {
      position: 'top-right',
      duration: EXTRACTED_TOAST_MS,
      background: TOAST_SUCCESS_BG
    }));
    notifyBackground('done');
    cleanup();
    return true;
  }

  function resetDebugCapture() {
    window.__dropdownExtractorDebugBlocks = null;
  }

  function findDebugContainer(element) {
    if (!element || !element.closest) return null;
    return (
      element.closest('[role="listbox"]') ||
      element.closest('[role="menu"]') ||
      element.closest('[role="list"]') ||
      element.closest('ul,ol')
    );
  }

  function captureDebugElement(target) {
    if (!target) return false;
    const element = target.nodeType === 1 ? target : target.parentElement;
    if (!element) return false;
    const blocks = window.__dropdownExtractorDebugBlocks || [];
    const toCapture = [];

    if (element.matches('[role="option"], [role="listitem"]')) {
      const container = findDebugContainer(element);
      if (container && container !== element) {
        toCapture.push(container);
      }
    }
    toCapture.push(element);

    for (const el of toCapture) {
      if (blocks.length >= 2) break;
      const block = buildDebugBlock(el, `element ${blocks.length + 1}`);
      if (!block) continue;
      blocks.push(block);
    }

    window.__dropdownExtractorDebugBlocks = blocks;
    clearArmedToast();

    if (blocks.length === 1) {
      replaceActiveToast(showToast('Debug: copied HTML (1/2)', {
        position: 'top-right',
        duration: EXTRACTED_TOAST_MS,
        background: TOAST_SUCCESS_BG
      }));
      return true;
    }

    navigator.clipboard.writeText(blocks.join('\n\n'));
    replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
      position: 'top-right',
      duration: EXTRACTED_TOAST_MS,
      background: TOAST_SUCCESS_BG
    }));
    notifyBackground('done');
    cleanup();
    return true;
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
  getPrefs(prefs => {
    window.__dropdownExtractorPrefs = prefs;
  });

  // ===== OPTIONS (EXACT PLACE: here, after active flag) =====
  function normalizePrefs(prefs) {
    const normalized = { ...prefs };
    if (normalized.debugMode === undefined) {
      normalized.debugMode = !!normalized.debug;
    }
    if (!normalized.debugModeTarget) {
      normalized.debugModeTarget = 'supported';
    }
    return normalized;
  }

  function getPrefs(callback) {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      handleContextInvalid();
      return;
    }
    try {
      chrome.storage.sync.get(
        {
          extractText: true,
          extractValue: false,
          format: 'text-tab-value',
          debug: false,
          debugMode: false,
          debugModeTarget: 'supported'
        },
        prefs => callback(normalizePrefs(prefs))
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
    const candidates = [
      ...document.querySelectorAll('[class*="react-select__menu-list"]'),
      ...document.querySelectorAll('[id^="react-select-"][id$="-listbox"]'),
      ...document.querySelectorAll('[class*="-MenuList"]')
    ];
    return candidates.find(el => {
      if (!el || el.offsetParent === null) return false;
      if (el.querySelector('[class*="react-select__option"], [role="listitem"]')) return true;
      return false;
    }) || null;
  }

  function cleanup() {
    document.removeEventListener('mousedown', onMouseDown, true);
    window.__dropdownExtractorActive = false;
    resetDebugCapture();

    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
      window.__dropdownExtractorCancelTimer = null;
    }
  }

  function shouldDebugSupported(prefs) {
    return prefs.debugMode && prefs.debugModeTarget === 'supported';
  }

  function shouldDebugAnyTwo(prefs) {
    return prefs.debugMode && prefs.debugModeTarget === 'any-two';
  }

  function handleSupportedClick(e, prefs) {
    // --- 1) Native <select> support ---
    const selectEl = e.target.closest('select');
    if (selectEl) {
      if (shouldDebugSupported(prefs) && copyDebugHtml(selectEl, 'supported dropdown')) return;
      const options = [...selectEl.options];
      const fields = resolveFields(
        options,
        o => getOptionLabelText(o),
        [
          o => getValueField(o),
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        navigator.clipboard.writeText(items.join('\n'));
        clearArmedToast();
        replaceActiveToast(showToast(buildExtractedMessage(items, note), {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        cleanup();
        return;
      }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 2) Selectize support ---
    const selectizeContent = getVisibleSelectizeContent();
    if (selectizeContent && selectizeContent.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(selectizeContent, 'supported dropdown')) return;
      const options = [...selectizeContent.querySelectorAll('.option')];
      const fields = resolveFields(
        options,
        o => getOptionLabelText(o),
        [
          o => o.value || o.getAttribute('value'),
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        navigator.clipboard.writeText(items.join('\n'));
        clearArmedToast();
        replaceActiveToast(showToast(buildExtractedMessage(items, note), {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        cleanup();
        return;
      }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 3) React Select support ---
    const reactSelectMenuList = getVisibleReactSelectMenuList();
    if (reactSelectMenuList) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(reactSelectMenuList, 'supported dropdown')) return;
        const options = [
          ...reactSelectMenuList.querySelectorAll('[class*="react-select__option"]'),
          ...reactSelectMenuList.querySelectorAll('[id^="react-select-"][id*="-option-"]'),
          ...reactSelectMenuList.querySelectorAll('[role="listitem"]'),
          ...reactSelectMenuList.querySelectorAll('[aria-disabled],[aria-selected]')
        ];
        const uniqueOptions = [...new Set(options)]
          .filter(el => !el.className.includes('react-select__group-heading'));
      const fields = resolveFields(
        uniqueOptions,
        o => getOptionLabelText(o),
        [
          o => o.value || o.getAttribute('value'),
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        navigator.clipboard.writeText(items.join('\n'));
        clearArmedToast();
        replaceActiveToast(showToast(buildExtractedMessage(items, note), {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        cleanup();
        return;
      }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(el => el.offsetParent !== null);

    if (listbox && listbox.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(listbox, 'supported dropdown')) return;
      const options = [...listbox.querySelectorAll('[role="option"]')];
      const fields = resolveFields(
        options,
        o => getOptionLabelText(o),
        [
          o => o.value || o.getAttribute('value'),
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        navigator.clipboard.writeText(items.join('\n'));
        clearArmedToast();
        replaceActiveToast(showToast(buildExtractedMessage(items, note), {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        cleanup();
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }
  }

  // ===== MAIN HANDLER =====
  function onMouseDown(e) {
    const prefs = window.__dropdownExtractorPrefs;
    if (prefs) {
      if (shouldDebugAnyTwo(prefs) && captureDebugElement(e.target)) return;
      handleSupportedClick(e, prefs);
      return;
    }

    getPrefs(loadedPrefs => {
      window.__dropdownExtractorPrefs = loadedPrefs;
      if (shouldDebugAnyTwo(loadedPrefs) && captureDebugElement(e.target)) return;
      handleSupportedClick(e, loadedPrefs);
    });
  }

  document.addEventListener('mousedown', onMouseDown, true);

  showArmedToast();
  notifyBackground('armed');

  armTimer();
})();
