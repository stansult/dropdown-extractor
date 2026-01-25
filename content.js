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
  const EXTRACTED_TOAST_MS = 3000;
  const ARMED_TOAST_TEXT = 'Click a dropdown, then click any item to copy the full list.';
  const NO_ITEMS_FOUND_TEXT = 'No items found to extract.';
  const STOPPED_TOAST_TEXT = 'Dropdown extractor stopped';
  const TOAST_INFO_BG = 'rgba(20, 40, 70, 0.75)';
  const TOAST_SUCCESS_BG = 'rgba(20, 70, 40, 0.75)';
  const TOAST_EXPIRED_BG = 'rgba(60, 60, 60, 0.75)';
  const TOAST_ERROR_BG = 'rgba(120, 30, 30, 0.85)';
  var deferCleanup = false;
  var pendingSafeCleanup = false;
  var extractionPending = false;
  var skipMouseDown = false;

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

  const TOAST_CLASS = 'dropdown-extractor-toast';

  function showToast(message, options = {}) {
    const {
      duration = 2000,
      position = 'bottom-right',
      event = null,
      background = TOAST_INFO_BG,
      allowMove = false
    } = options;
    const toast = document.createElement('div');
    toast.className = TOAST_CLASS;
    toast.textContent = message;

    const baseStyle = {
      position: 'fixed',
      padding: '8px 12px',
      background,
      color: '#fff',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
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
      if (allowMove) {
        pendingCorner = 'top-right';
      } else {
        Object.assign(baseStyle, { top: '16px', right: '16px' });
      }
    } else if (position === 'top-left') {
      if (allowMove) {
        pendingCorner = 'top-left';
      } else {
        Object.assign(baseStyle, { top: '16px', left: '16px' });
      }
    } else if (position === 'bottom-left') {
      if (allowMove) {
        pendingCorner = 'bottom-left';
      } else {
        Object.assign(baseStyle, { bottom: '16px', left: '16px' });
      }
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
      if (allowMove) {
        pendingCorner = 'bottom-right';
      } else {
        Object.assign(baseStyle, { bottom: '16px', right: '16px' });
      }
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
        }, 500);
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

  function showStoppedToast(reason) {
    const suffix = reason ? ` (${reason})` : '';
    replaceActiveToast(showToast(`${STOPPED_TOAST_TEXT}${suffix}`, {
      duration: 2000,
      position: 'top-right',
      background: TOAST_EXPIRED_BG
    }));
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
    cleanup(true);
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
    const textNodes = [];
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue;
      if (text) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (normalized) textNodes.push(normalized);
      }
      node = walker.nextNode();
    }
    return textNodes.join(' ').trim();
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
    notifyBackground('error');
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

  function buildDebugPlaceholder(label, status) {
    return [
      `--- dropdown-extractor: ${label} ---`,
      status
    ].join('\n');
  }

  function buildDebugAnyTwoPayloadFromStored(optionEl) {
    const firstElement = window.__dropdownExtractorDebugFirstElement;
    const firstLabel = window.__dropdownExtractorDebugFirstLabel || '1. uncategorized';
    const firstBlock = firstElement
      ? buildDebugBlock(firstElement, firstLabel)
      : buildDebugPlaceholder(firstLabel, 'failed');
    const optionBlock = optionEl
      ? buildDebugBlock(optionEl, '2. menu option')
      : buildDebugPlaceholder('2. menu option', 'not extracted yet');
    return [firstBlock, optionBlock].join('\n\n');
  }

  function getDebugAnyTwoFirstLabel(triggerEl, containerEl, fallbackEl) {
    if (containerEl) return 'menu container';
    if (triggerEl) return 'trigger';
    if (fallbackEl) return 'uncategorized';
    return 'unknown';
  }

  function getDebugAnyTwoSecondLabel(optionEl) {
    return optionEl ? 'option' : 'uncategorized';
  }

  function copyDebugHtml(element, label) {
    const block = buildDebugBlock(element, label);
    if (!block) return false;
    const writeBlock = () => {
      navigator.clipboard.writeText(block);
    };
    flashElement(element);
    setTimeout(writeBlock, 120);
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
    window.__dropdownExtractorDebugContainer = null;
    window.__dropdownExtractorLastHover = null;
    window.__dropdownExtractorDebugFirstElement = null;
    window.__dropdownExtractorDebugFirstLabel = null;
    window.__dropdownExtractorDebugTrigger = null;
    window.__dropdownExtractorDebugOptionCandidate = null;
    window.__dropdownExtractorDebugSuppressClick = false;
    window.__dropdownExtractorDebugPendingTrigger = null;
    if (window.__dropdownExtractorDebugPendingTriggerTimer) {
      clearTimeout(window.__dropdownExtractorDebugPendingTriggerTimer);
      window.__dropdownExtractorDebugPendingTriggerTimer = null;
    }
    if (window.__dropdownExtractorDebugCleanupTimer) {
      clearTimeout(window.__dropdownExtractorDebugCleanupTimer);
      window.__dropdownExtractorDebugCleanupTimer = null;
    }
    if (window.__dropdownExtractorDebugPendingTimeout) {
      clearTimeout(window.__dropdownExtractorDebugPendingTimeout);
      window.__dropdownExtractorDebugPendingTimeout = null;
    }
  }

  function findDebugContainer(element) {
    if (!element || !element.closest) return null;
    const id = element.id || '';
    const match = id.match(/^(react-select-\d+)-option/);
    if (match) {
      const base = match[1];
      const byId = document.getElementById(`${base}-listbox`);
      if (byId && byId.offsetParent !== null) return byId;
      const byPrefix = document.querySelector(`[id^="${base}-"][id$="listbox"]`);
      if (byPrefix && byPrefix.offsetParent !== null) return byPrefix;
      const menuList = [...document.querySelectorAll('[class*="react-select__menu-list"], [class*="-MenuList"]')]
        .find(el => el.offsetParent !== null);
      if (menuList) return menuList;
    }
    return (
      element.closest('[role="listbox"]') ||
      element.closest('[role="menu"]') ||
      element.closest('[role="list"]') ||
      element.closest('ul,ol')
    );
  }

  function findSuggestionContainer(optionEl) {
    if (!optionEl || !optionEl.closest) return null;
    const classSelector = getStableClassSelector(getElementClassName(optionEl));
    let current = optionEl.parentElement;
    let depth = 0;
    while (current && depth < 10) {
      if (current.matches && current.matches('[role="listbox"],[role="menu"],[role="list"],ul,ol')) {
        return current;
      }
      if (classSelector) {
        const count = current.querySelectorAll(classSelector).length;
        if (count >= 2) return current;
      }
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function isLikelyContainer(element) {
    if (!element || !element.matches) return false;
    if (element.matches('[role="listbox"],[role="menu"],[role="list"],ul,ol')) return true;
    const option = element.querySelector(OPTION_LIKE_SELECTOR);
    if (!option) return false;
    const classSelector = getStableClassSelector(getElementClassName(option));
    if (!classSelector) return false;
    return element.querySelectorAll(classSelector).length >= 2;
  }

  function getVisibleMenuContainer(point = null) {
    const candidates = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="list"]')]
      .filter(el => el && el.offsetParent !== null);
    if (!candidates.length) return null;

    const viewportArea = window.innerWidth * window.innerHeight;
    const scored = candidates
      .map(el => {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (!rect.width || !rect.height) return null;
        if (area > viewportArea * 0.45) return null;
        let distance = 0;
        if (point) {
          const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
          const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
          distance = Math.hypot(dx, dy);
        }
        return { el, distance };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    return scored[0]?.el || null;
  }

  function getMenuContainerFromTrigger(element) {
    if (!element || !element.getAttribute) return null;
    const target =
      element.getAttribute('data-bs-target')
      || element.getAttribute('data-target')
      || element.getAttribute('aria-controls')
      || element.getAttribute('aria-owns');
    if (!target) return null;
    const selector = target.startsWith('#') ? target : `#${target}`;
    const container = document.querySelector(selector);
    return container || null;
  }

  function isReasonableDebugElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const area = rect.width * rect.height;
    const viewportArea = window.innerWidth * window.innerHeight;
    if (area > viewportArea * 0.25) return false;
    const text = element.textContent ? element.textContent.trim() : '';
    if (text.length > 120) return false;
    return true;
  }

  function isDebugTriggerCandidate(element) {
    if (!isReasonableDebugElement(element)) return false;
    const role = element.getAttribute('role');
    const hasPopup = element.getAttribute('aria-haspopup');
    const hasMenuTarget = !!getMenuContainerFromTrigger(element);
    return role === 'button' || role === 'combobox' || !!hasPopup || hasMenuTarget;
  }

  function isDebugFirstCandidate(element) {
    return isDebugTriggerCandidate(element) || isReasonableDebugElement(element);
  }

  function finalizeDebugCapture() {
    const prefs = window.__dropdownExtractorPrefs;
    if (prefs && prefs.safeCapture && prefs.debugMode && prefs.debugModeTarget === 'any-two') {
      window.__dropdownExtractorDebugJustCompleted = true;
      window.setTimeout(() => {
        window.__dropdownExtractorDebugJustCompleted = false;
      }, 200);
      deferCleanup = true;
      pendingSafeCleanup = true;
      window.__dropdownExtractorDebugSuppressClick = true;
      window.__dropdownExtractorDebugCleanupTimer = setTimeout(() => {
        if (window.__dropdownExtractorActive) cleanup(true);
      }, 250);
      return;
    }
    cleanup(true);
  }

  function captureDebugElement(target) {
    if (!target) return false;
    let element = target.nodeType === 1 ? target : target.parentElement;
    if (!element) return false;
    const blocks = window.__dropdownExtractorDebugBlocks || [];
    const toCapture = [];
    const storedContainer = window.__dropdownExtractorDebugContainer;
    const optionCandidate = window.__dropdownExtractorDebugOptionCandidate;
    if (blocks.length === 1 && storedContainer && optionCandidate && storedContainer.contains(optionCandidate)) {
      if (!storedContainer.contains(element) || element === storedContainer) {
        element = optionCandidate;
      }
    }
    if (blocks.length === 1 && !window.__dropdownExtractorDebugFirstElement) {
      window.__dropdownExtractorDebugFirstElement = element;
      window.__dropdownExtractorDebugFirstLabel = getDebugAnyTwoFirstLabel(
        window.__dropdownExtractorDebugTrigger,
        window.__dropdownExtractorDebugContainer,
        element
      );
    }
    if (blocks.length === 1 && storedContainer) {
      const hover = window.__dropdownExtractorLastHover;
      if (hover && hover.nodeType === Node.ELEMENT_NODE && !hover.closest(`.${TOAST_CLASS}`)) {
        const hoverInside = storedContainer.contains(hover);
        const elementInside = storedContainer.contains(element);
        if (hoverInside && (element === storedContainer || !elementInside)) {
          element = hover;
        }
      }
    }
    if (blocks.length === 0 && !window.__dropdownExtractorDebugTrigger && isDebugTriggerCandidate(element)) {
      window.__dropdownExtractorDebugTrigger = element;
    }

    if (blocks.length === 0) {
      if (!isDebugFirstCandidate(element)) return false;
      const isTriggerButton = element.matches('button,[role="button"]');
      const isTriggerLike = isTriggerButton || !!getMenuContainerFromTrigger(element);
      if (isTriggerLike) {
        if (window.__dropdownExtractorDebugPendingTrigger) {
          window.__dropdownExtractorDebugPendingTrigger = null;
          if (window.__dropdownExtractorDebugPendingTriggerTimer) {
            clearTimeout(window.__dropdownExtractorDebugPendingTriggerTimer);
            window.__dropdownExtractorDebugPendingTriggerTimer = null;
          }
        }
        const point = window.__dropdownExtractorLastPointer || null;
        const triggerContainer = getMenuContainerFromTrigger(element);
        const openMenu = getVisibleDropdownContainer('[role="menu"], [role="listbox"], [role="list"]', element)
          || triggerContainer
          || getVisibleMenuContainer(point);
        if (openMenu && openMenu !== element) {
          window.__dropdownExtractorDebugBlocks = ['element-1'];
          window.__dropdownExtractorDebugContainer = openMenu;
          window.__dropdownExtractorDebugFirstElement = openMenu;
          window.__dropdownExtractorDebugFirstLabel = 'menu container';
          clearArmedToast();
          flashElement(openMenu);
          const triggerEl = window.__dropdownExtractorDebugTrigger || element;
          const fallbackEl = (!openMenu && !triggerEl) ? element : null;
          const firstLabel = getDebugAnyTwoFirstLabel(triggerEl, openMenu, fallbackEl);
          window.__dropdownExtractorDebugFirstElement = openMenu || triggerEl || fallbackEl || element;
          window.__dropdownExtractorDebugFirstLabel = `1. ${firstLabel}`;
          navigator.clipboard.writeText(buildDebugAnyTwoPayloadFromStored(null));
          replaceActiveToast(showToast(`Debug: copied HTML (1/2, ${firstLabel})`, {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          return true;
        } else if (!window.__dropdownExtractorDebugPendingTimeout) {
          if (window.__dropdownExtractorDebugPendingTrigger) {
            window.__dropdownExtractorDebugPendingTrigger = null;
            if (window.__dropdownExtractorDebugPendingTriggerTimer) {
              clearTimeout(window.__dropdownExtractorDebugPendingTriggerTimer);
              window.__dropdownExtractorDebugPendingTriggerTimer = null;
            }
          }
          const triggerFallback = element;
          window.__dropdownExtractorDebugPendingTimeout = setTimeout(() => {
            if (window.__dropdownExtractorDebugBlocks && window.__dropdownExtractorDebugBlocks.length) return;
            const delayedMenu = getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
            const triggerEl = window.__dropdownExtractorDebugTrigger || triggerFallback || null;
            const resolvedContainer = triggerEl ? getMenuContainerFromTrigger(triggerEl) : null;
            if (triggerEl) window.__dropdownExtractorDebugTrigger = triggerEl;
            const containerEl = delayedMenu || resolvedContainer || null;
            const element1 = containerEl || triggerEl;
            if (!element1) return;
            window.__dropdownExtractorDebugBlocks = ['element-1'];
            window.__dropdownExtractorDebugContainer = containerEl;
            window.__dropdownExtractorDebugFirstElement = element1;
            window.__dropdownExtractorDebugFirstLabel = getDebugAnyTwoFirstLabel(triggerEl, containerEl, element1);
            clearArmedToast();
            flashElement(element1);
            const fallbackEl = (!containerEl && !triggerEl) ? element1 : null;
            const firstLabel = getDebugAnyTwoFirstLabel(triggerEl, containerEl, fallbackEl);
            window.__dropdownExtractorDebugFirstElement = containerEl || triggerEl || fallbackEl || element1;
            window.__dropdownExtractorDebugFirstLabel = `1. ${firstLabel}`;
            navigator.clipboard.writeText(buildDebugAnyTwoPayloadFromStored(null));
            replaceActiveToast(showToast(`Debug: copied HTML (1/2, ${firstLabel})`, {
              position: 'top-right',
              duration: EXTRACTED_TOAST_MS,
              background: TOAST_SUCCESS_BG
            }));
          }, 80);
        }
      }
    }

    if (blocks.length === 1) {
      if (isLikelyContainer(element) && optionCandidate) {
        window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
        clearArmedToast();
        flashElement(element);
        const payload = buildDebugAnyTwoPayloadFromStored(optionCandidate);
        setTimeout(() => {
          navigator.clipboard.writeText(payload);
        }, 120);
        const secondLabel = getDebugAnyTwoSecondLabel(optionCandidate);
        replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        finalizeDebugCapture();
        return true;
      }
      const activeContainer = storedContainer || getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
      if (activeContainer && activeContainer !== element) {
        const optionBlock = buildDebugBlock(element, 'element 2');
        if (optionBlock) {
          window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
          clearArmedToast();
          flashElement(activeContainer);
          const payload = buildDebugAnyTwoPayloadFromStored(element);
          setTimeout(() => {
            navigator.clipboard.writeText(payload);
          }, 120);
          const secondLabel = getDebugAnyTwoSecondLabel(element);
          replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          notifyBackground('done');
          finalizeDebugCapture();
          return true;
        }
      }
    }

    if (blocks.length === 1 && element && element !== window.__dropdownExtractorDebugFirstElement) {
      const optionBlock = buildDebugBlock(element, 'element 2');
      if (optionBlock) {
        window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
        clearArmedToast();
        flashElement(element);
        const payload = buildDebugAnyTwoPayloadFromStored(element);
        setTimeout(() => {
          navigator.clipboard.writeText(payload);
        }, 120);
        const secondLabel = getDebugAnyTwoSecondLabel(element);
        replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        finalizeDebugCapture();
        return true;
      }
    }

    if (blocks.length === 1 && storedContainer && storedContainer.contains(element) && storedContainer !== element) {
      const optionBlock = buildDebugBlock(element, 'element 2');
      if (optionBlock) {
        window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
        clearArmedToast();
        flashElement(storedContainer);
        const payload = buildDebugAnyTwoPayloadFromStored(element);
        setTimeout(() => {
          navigator.clipboard.writeText(payload);
        }, 120);
        const secondLabel = getDebugAnyTwoSecondLabel(element);
        replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
          position: 'top-right',
          duration: EXTRACTED_TOAST_MS,
          background: TOAST_SUCCESS_BG
        }));
        notifyBackground('done');
        finalizeDebugCapture();
        return true;
      }
    }

    if (blocks.length === 1) {
      const container = findDebugContainer(element);
      if (container && container !== element) {
        const optionBlock = buildDebugBlock(element, 'element 2');
        if (optionBlock) {
          window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
          clearArmedToast();
          flashElement(container);
          const payload = buildDebugAnyTwoPayloadFromStored(element);
          setTimeout(() => {
            navigator.clipboard.writeText(payload);
          }, 120);
          const secondLabel = getDebugAnyTwoSecondLabel(element);
          replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          notifyBackground('done');
          finalizeDebugCapture();
          return true;
        }
      }
    }

    const optionContext = getOptionContext(element);
    const isOption = !!optionContext
      || element.hasAttribute('aria-selected')
      || (element.id && /react-select-\d+-option-\d+/.test(element.id));
    if (isOption) {
      const optionEl = optionContext ? optionContext.option : element;
      const container = optionContext ? optionContext.container : findDebugContainer(element);
      if (container && container !== optionEl) {
        if (blocks.length === 1) {
          const optionBlock = buildDebugBlock(optionEl, 'element 2');
          if (optionBlock) {
            window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
            clearArmedToast();
            flashElement(container);
            const payload = buildDebugAnyTwoPayloadFromStored(optionEl);
            setTimeout(() => {
              navigator.clipboard.writeText(payload);
            }, 120);
            const secondLabel = getDebugAnyTwoSecondLabel(optionEl);
            replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
              position: 'top-right',
              duration: EXTRACTED_TOAST_MS,
              background: TOAST_SUCCESS_BG
            }));
            notifyBackground('done');
            finalizeDebugCapture();
            return true;
          }
        } else if (blocks.length === 0) {
          toCapture.push(container);
          window.__dropdownExtractorDebugContainer = container;
          window.__dropdownExtractorDebugBlocks = null;
          window.__dropdownExtractorDebugOptionCandidate = optionEl;
        }
      }
    }
    if (!(blocks.length === 0 && optionContext && optionContext.container)) {
      toCapture.push(optionContext ? optionContext.option : element);
    }

    for (const el of toCapture) {
      if (blocks.length >= 2) break;
      const block = buildDebugBlock(el, `element ${blocks.length + 1}`);
      if (!block) continue;
      blocks.push(block);
    }

    window.__dropdownExtractorDebugBlocks = blocks;
    clearArmedToast();

    if (blocks.length === 1) {
      const triggerEl = window.__dropdownExtractorDebugTrigger;
      const containerEl = window.__dropdownExtractorDebugContainer
        || (optionContext ? optionContext.container : null)
        || (toCapture[0] && toCapture[0].matches && toCapture[0].matches('[role="listbox"],[role="menu"],[role="list"],ul,ol')
          ? toCapture[0]
          : null);
      const element1 = containerEl || toCapture[0] || element;
      if (element1) flashElement(element1);
      window.__dropdownExtractorDebugFirstElement = element1;
      const fallbackEl = (!containerEl && !triggerEl) ? element1 : null;
      const firstLabel = getDebugAnyTwoFirstLabel(triggerEl, containerEl, fallbackEl);
      window.__dropdownExtractorDebugFirstLabel = `1. ${firstLabel}`;
      navigator.clipboard.writeText(buildDebugAnyTwoPayloadFromStored(null));
      replaceActiveToast(showToast(`Debug: copied HTML (1/2, ${firstLabel})`, {
        position: 'top-right',
        duration: EXTRACTED_TOAST_MS,
        background: TOAST_SUCCESS_BG
      }));
      return true;
    }

    {
      const triggerEl = window.__dropdownExtractorDebugTrigger;
      const containerEl = window.__dropdownExtractorDebugContainer
        || (optionContext ? optionContext.container : null)
        || (toCapture[0] && toCapture[0].matches && toCapture[0].matches('[role="listbox"],[role="menu"],[role="list"],ul,ol')
          ? toCapture[0]
          : null);
      const optionEl = optionContext
        ? optionContext.option
        : (toCapture.find(el => el && el !== containerEl) || element);
      flashElement(containerEl || optionEl || element);
      const payload = buildDebugAnyTwoPayloadFromStored(optionEl);
      setTimeout(() => {
        navigator.clipboard.writeText(payload);
      }, 120);
    }
    const secondLabel = getDebugAnyTwoSecondLabel(optionEl);
    replaceActiveToast(showToast(`Debug: copied HTML (2/2, ${secondLabel})`, {
      position: 'top-right',
      duration: EXTRACTED_TOAST_MS,
      background: TOAST_SUCCESS_BG
    }));
    notifyBackground('done');
    finalizeDebugCapture();
    return true;
  }

  function armTimer() {
    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
    }
    window.__dropdownExtractorCancelTimer = setTimeout(() => {
      clearArmedToast();
      notifyBackground('canceled');
      cleanup(true);
      showStoppedToast('timeout');
    }, ARM_DURATION_MS);
  }

  if (window.__dropdownExtractorActive) {
    showArmedToast();
    armTimer();
    notifyBackground('armed');
    return;
  }

  window.__dropdownExtractorActive = true;
  window.__dropdownExtractorPageHideHandler = () => {
    if (!window.__dropdownExtractorActive) return;
    clearArmedToast();
    showStoppedToast('page navigated');
    notifyBackground('canceled');
    cleanup(true);
  };
  window.addEventListener('pagehide', window.__dropdownExtractorPageHideHandler, true);
  if (chrome?.storage?.onChanged?.addListener) {
    window.__dropdownExtractorStorageHandler = () => {
      if (!window.__dropdownExtractorActive) return;
      clearArmedToast();
      showStoppedToast('options changed');
      notifyBackground('canceled');
      cleanup(true);
    };
    chrome.storage.onChanged.addListener(window.__dropdownExtractorStorageHandler);
  }
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
          debugModeTarget: 'supported',
          safeCapture: false
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
      ...document.querySelectorAll('[class*="react-select__menu"]'),
      ...document.querySelectorAll('[id^="react-select-"][id$="-listbox"]'),
      ...document.querySelectorAll('[class*="-MenuList"]')
    ];
    return candidates.find(el => {
      if (!el || el.offsetParent === null) return false;
      if (el.querySelector('[class*="react-select__option"], [role="listitem"], [id^="react-select-"][id*="-option-"]')) {
        return true;
      }
      return false;
    }) || null;
  }

  function getVisibleDropdownContainer(selectors, target) {
    if (target && target.closest) {
      const containing = target.closest(selectors);
      if (containing && containing.offsetParent !== null) return containing;
    }
    return [...document.querySelectorAll(selectors)]
      .find(el => el && el.offsetParent !== null) || null;
  }

  function getVisibleSallieMaeModal(target) {
    if (target && target.closest) {
      const containing = target.closest('.slm-dropdown-modal');
      if (containing && isSallieMaeModalVisible(containing)) return containing;
    }
    return [...document.querySelectorAll('.slm-dropdown-modal')]
      .find(el => el && isSallieMaeModalVisible(el)) || null;
  }

  function isSallieMaeModalVisible(modal) {
    if (!modal || !modal.getBoundingClientRect) return false;
    if (modal.getAttribute('aria-hidden') === 'true') return false;
    const rect = modal.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = window.getComputedStyle(modal);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return true;
  }

  const OPTION_LIKE_SELECTOR = [
    '[role="option"]',
    '[role="listitem"]',
    '.option',
    '.mock-option',
    '.react-select__option',
    '.react-select-variant-option',
    '.mui-option',
    '.ant-option',
    '.select2-results__option',
    '.chosen-option',
    '.downshift-option',
    '[class*="src--listTitle--"]',
    '[class*="src--hisItem--"] a',
    '[class*="src--autoItem--"]',
    '[role="menuitem"]',
    '[role^="menuitem"]',
    '.menuitem',
    '[id^="react-select-"][id*="-option-"]'
  ].join(',');

  const FLASH_CLASS = 'dropdown-extractor-flash';
  const FLASH_STYLE_ID = 'dropdown-extractor-flash-style';
  const FEEDBACK_DURATION_MS = 900;

  function getStableClassSelector(className) {
    if (!className) return null;
    const classes = className.split(/\s+/).filter(Boolean).filter(cls => cls !== FLASH_CLASS);
    if (!classes.length) return null;
    return `.${classes.join('.')}`;
  }

  function getOptionContext(target) {
    if (!target || !target.closest) return null;
    const aliAutoItemAnchor = target.closest('a');
    if (aliAutoItemAnchor && aliAutoItemAnchor.querySelector('[class*="src--autoItem--"]')) {
      return { option: aliAutoItemAnchor, container: getAliExpressSuggestionContainer(aliAutoItemAnchor) };
    }
    const optionEl = target.closest(OPTION_LIKE_SELECTOR);
    if (optionEl) {
      const container = findDebugContainer(optionEl) || findSuggestionContainer(optionEl);
      return { option: optionEl, container };
    }
    const sallieOption = target.closest('.slm-dropdown-modal [role="button"]');
    if (sallieOption && sallieOption.querySelector('input.slm-btngroup-radio')) {
      const modal = sallieOption.closest('.slm-dropdown-modal');
      if (modal) {
        return { option: sallieOption, container: modal };
      }
    }
    const buttonEl = target.closest('button,[role="button"]');
    if (!buttonEl) return null;
    const container = findDebugContainer(buttonEl);
    if (container && container.contains(buttonEl) && container.offsetParent !== null) {
      return { option: buttonEl, container };
    }
    return null;
  }

  function getAliExpressSuggestionContainer(target) {
    const selector = '[class*="src--active--"]';
    const hasSuggestions = el => {
      if (!el || !el.querySelectorAll) return false;
      const count = el.querySelectorAll('[class*="src--hisItem--"] a, [class*="src--listTitle--"]').length;
      return count >= 2;
    };
    if (target && target.closest) {
      const containing = target.closest(selector);
      if (containing && containing.offsetParent !== null && hasSuggestions(containing)) {
        return containing;
      }
    }
    const activeMatch = [...document.querySelectorAll(selector)]
      .find(el => el && el.offsetParent !== null && hasSuggestions(el)) || null;
    if (activeMatch) return activeMatch;

    if (target && target.closest) {
      let current = target.parentElement;
      let depth = 0;
      while (current && depth < 8) {
        const autoCount = current.querySelectorAll('[class*="src--autoItem--"]').length;
        if (autoCount >= 2 && current.offsetParent !== null) return current;
        current = current.parentElement;
        depth += 1;
      }
    }

    return [...document.querySelectorAll('[class*="src--autoItem--"]')]
      .map(el => el.closest('div'))
      .find(el => el && el.offsetParent !== null
        && el.querySelectorAll('[class*="src--autoItem--"]').length >= 2) || null;
  }

  function getAliExpressSuggestionLinks(container) {
    if (!container) return [];
    const listTitleAnchors = [...container.querySelectorAll('a [class*="src--listTitle--"]')]
      .map(span => span.closest('a'))
      .filter(Boolean);
    const autoItemAnchors = [...container.querySelectorAll('a [class*="src--autoItem--"]')]
      .map(span => span.closest('a'))
      .filter(Boolean);
    const links = [
      ...container.querySelectorAll('[class*="src--hisItem--"] a'),
      ...listTitleAnchors,
      ...autoItemAnchors
    ].filter(Boolean);
    const uniqueLinks = [...new Set(links)];
    return uniqueLinks.filter(link => getOptionLabelText(link));
  }

  function findListItemContainer(listItem) {
    if (!listItem || !listItem.closest) return null;
    const roleContainer = listItem.closest('[role="list"],[role="listbox"],[role="menu"],ul,ol');
    if (roleContainer && isElementVisible(roleContainer)) return roleContainer;
    let current = listItem.parentElement;
    let depth = 0;
    while (current && depth < 6) {
      const items = current.querySelectorAll('[role="listitem"]');
      if (items.length >= 2 && isElementVisible(current)) return current;
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function isElementVisible(element) {
    if (!element || !element.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = window.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return true;
  }

  function isOptionLike(target) {
    return !!getOptionContext(target);
  }

  function ensureFlashStyles() {
    if (document.getElementById(FLASH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FLASH_STYLE_ID;
    style.textContent = `
      @keyframes dropdownExtractorFlash {
        0%, 60% {
          box-shadow: 0 0 0 3px rgba(46, 140, 90, 0.55),
            inset 0 0 0 9999px rgba(46, 140, 90, 0.12);
        }
        100% {
          box-shadow: 0 0 0 3px rgba(46, 140, 90, 0),
            inset 0 0 0 9999px rgba(46, 140, 90, 0);
        }
      }
      .${FLASH_CLASS} {
        animation: dropdownExtractorFlash ${FEEDBACK_DURATION_MS}ms linear;
        border-radius: var(--dropdown-extractor-flash-radius, inherit);
      }
    `;
    document.head.appendChild(style);
  }

  function getNearestBorderRadius(element) {
    let current = element;
    while (current) {
      const radius = getComputedStyle(current).borderRadius;
      if (radius && radius !== '0px' && radius !== '0px 0px 0px 0px') return radius;
      current = current.parentElement;
    }
    return '';
  }

  function flashElement(element) {
    if (!element) return;
    ensureFlashStyles();
    const radius = getNearestBorderRadius(element);
    const previousRadius = element.style.getPropertyValue('--dropdown-extractor-flash-radius');
    if (radius) {
      element.style.setProperty('--dropdown-extractor-flash-radius', radius);
    } else {
      element.style.removeProperty('--dropdown-extractor-flash-radius');
    }
    const timeoutId = element.dataset.dropdownExtractorFlashTimeout;
    if (timeoutId) clearTimeout(Number(timeoutId));
    element.classList.remove(FLASH_CLASS);
    element.offsetHeight;
    element.classList.add(FLASH_CLASS);
    const newTimeoutId = window.setTimeout(() => {
      element.classList.remove(FLASH_CLASS);
      element.dataset.dropdownExtractorFlashTimeout = '';
      if (previousRadius) {
        element.style.setProperty('--dropdown-extractor-flash-radius', previousRadius);
      } else {
        element.style.removeProperty('--dropdown-extractor-flash-radius');
      }
    }, FEEDBACK_DURATION_MS);
    element.dataset.dropdownExtractorFlashTimeout = String(newTimeoutId);
  }

  function shouldBlockOptionClick(prefs, target) {
    if (!prefs || !prefs.safeCapture) return false;
    if (target && target.closest && target.closest('select')) return false;
    if (isMenuTriggerLike(target)) return false;
    const triggerEl = target && target.closest
      ? target.closest('button,[role="button"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
      : null;
    const triggerExpanded = triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('aria-expanded');
    const triggerHasPopup = triggerEl && triggerEl.getAttribute && triggerEl.getAttribute('aria-haspopup');
    const isMenuTrigger = !!(triggerExpanded || triggerHasPopup);
    const isSallieOption = triggerEl && triggerEl.querySelector
      ? !!triggerEl.querySelector('input.slm-btngroup-radio')
      : false;
    const optionContext = getOptionContext(target);
    if (isMenuTrigger && !isSallieOption) {
      if (!optionContext || !optionContext.container || !isElementVisible(optionContext.container)) {
        return false;
      }
    }

    const menuItem = target && target.closest
      ? target.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
      : null;
    if (menuItem && isElementVisible(menuItem)) {
      return true;
    }

    const aliContainer = getAliExpressSuggestionContainer(target);
    if (aliContainer && isElementVisible(aliContainer)) return true;

    if (optionContext && optionContext.container && isElementVisible(optionContext.container)) {
      return true;
    }

    const menuContainer = getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
    if (isOptionLike(target)) {
      return !!menuContainer;
    }
    return !!(menuContainer && menuContainer.contains(target));
  }

  function isMenuTriggerLike(target) {
    if (!target || !target.closest) return false;
    const trigger = target.closest('button,[role="button"],[role="combobox"]');
    if (trigger) {
      const expanded = trigger.getAttribute('aria-expanded');
      const hasPopup = trigger.getAttribute('aria-haspopup');
      if (expanded !== null || hasPopup) return true;
    }
    const triggerContainer = target.closest('[role="menu"],[role="listbox"],[role="list"]');
    if (triggerContainer) {
      const triggerButton = triggerContainer.querySelector(
        'button[aria-haspopup],button[aria-expanded],[role="button"][aria-haspopup],[role="button"][aria-expanded]'
      );
      const nestedMenu = Array.from(
        triggerContainer.querySelectorAll('[role="menu"],[role="listbox"],[role="list"]')
      ).find(el => el !== triggerContainer);
      if (triggerButton && nestedMenu && !isElementVisible(nestedMenu)) {
        return true;
      }
    }
    const menuItem = target.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]');
    if (!menuItem) return false;
    const nestedMenu = menuItem.querySelector('[role="menu"],[role="listbox"],[role="list"]');
    if (nestedMenu) return true;
    const nestedTrigger = menuItem.querySelector(
      'button[aria-haspopup],button[aria-expanded],[role="button"][aria-haspopup],[role="button"][aria-expanded]'
    );
    return !!nestedTrigger;
  }

  function cleanup(force = false) {
    if (!force && deferCleanup) {
      pendingSafeCleanup = true;
      extractionPending = false;
      return;
    }
    deferCleanup = false;
    pendingSafeCleanup = false;
    extractionPending = false;
    if (window.__dropdownExtractorSafeCleanupTimer) {
      clearTimeout(window.__dropdownExtractorSafeCleanupTimer);
      window.__dropdownExtractorSafeCleanupTimer = null;
    }
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('pointerdown', onWindowPointerDown, true);
    window.removeEventListener('mousedown', onWindowMouseDown, true);
    window.removeEventListener('click', onWindowClick, true);
    if (window.__dropdownExtractorPageHideHandler) {
      window.removeEventListener('pagehide', window.__dropdownExtractorPageHideHandler, true);
      window.__dropdownExtractorPageHideHandler = null;
    }
    if (window.__dropdownExtractorStorageHandler && chrome?.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(window.__dropdownExtractorStorageHandler);
      window.__dropdownExtractorStorageHandler = null;
    }
    window.__dropdownExtractorActive = false;
    resetDebugCapture();

    if (window.__dropdownExtractorCancelTimer) {
      clearTimeout(window.__dropdownExtractorCancelTimer);
      window.__dropdownExtractorCancelTimer = null;
    }
  }

  function completeExtraction(items, note, flashTarget, prefs) {
    if (!items.length || extractionPending) return;
    extractionPending = true;
    if (flashTarget) flashElement(flashTarget);

    const finish = () => {
      navigator.clipboard.writeText(items.join('\n'));
      clearArmedToast();
      if (window.__dropdownExtractorCancelTimer) {
        clearTimeout(window.__dropdownExtractorCancelTimer);
        window.__dropdownExtractorCancelTimer = null;
      }
      replaceActiveToast(showToast(buildExtractedMessage(items, note), {
        position: 'top-right',
        duration: EXTRACTED_TOAST_MS,
        background: TOAST_SUCCESS_BG
      }));
      notifyBackground('done');
      cleanup();
    };

    const delay = prefs && !prefs.safeCapture ? 120 : 0;
    if (delay) {
      setTimeout(finish, delay);
      return;
    }
    finish();
  }

  function shouldDebugSupported(prefs) {
    return prefs.debugMode && prefs.debugModeTarget === 'supported';
  }

  function shouldDebugAnyTwo(prefs) {
    return prefs.debugMode && prefs.debugModeTarget === 'any-two';
  }

  function handleSupportedClick(e, prefs) {
    let target = e._dropdownExtractorTarget || e.target;
    const elementTarget = target && target.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (elementTarget && elementTarget.closest) {
      const ghList = elementTarget.closest('.SelectMenu-list');
      if (ghList) {
        target = elementTarget.closest('[role="listitem"]') || ghList || elementTarget;
      } else {
        target = elementTarget;
      }
    }
    // --- 1) Native <select> support ---
    const selectEl = target.closest('select');
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
        completeExtraction(items, note, selectEl, prefs);
        return;
      }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 2) Selectize support ---
    const selectizeContent = getVisibleSelectizeContent();
    if (selectizeContent && selectizeContent.contains(target)) {
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
        completeExtraction(items, note, selectizeContent, prefs);
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
        completeExtraction(items, note, reactSelectMenuList, prefs);
        return;
      }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 4) AliExpress search suggestions ---
    const aliSuggestions = getAliExpressSuggestionContainer(target);
    if (aliSuggestions && aliSuggestions.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(aliSuggestions, 'supported dropdown')) return;
      const links = getAliExpressSuggestionLinks(aliSuggestions);
      const fields = resolveFields(
        links,
        link => getOptionLabelText(link),
        [
          link => link.getAttribute('href')
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        completeExtraction(items, note, aliSuggestions, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 4) Radix / role="menu" support ---
    const menu = getVisibleDropdownContainer('[role="menu"]', target);
    const isGitHubMenu = !!(
      menu
      && (
        (menu.classList && menu.classList.contains('SelectMenu-list'))
        || (menu.closest && menu.closest('.SelectMenu'))
      )
    );
    if (!isGitHubMenu && menu && menu.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(menu, 'supported dropdown')) return;
      const options = [
        ...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')
      ];
      const fields = resolveFields(
        options,
        o => getOptionLabelText(o),
        [
          o => o.value || o.getAttribute('value'),
          o => o.dataset.value,
          o => o.getAttribute('href')
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        completeExtraction(items, note, menu, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 4) Ant Design support ---
    const antDropdown = getVisibleDropdownContainer('.ant-select-dropdown', target);
    if (antDropdown && antDropdown.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(antDropdown, 'supported dropdown')) return;
      const options = [
        ...antDropdown.querySelectorAll('.ant-option'),
        ...antDropdown.querySelectorAll('.ant-select-item-option')
      ];
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
        completeExtraction(items, note, antDropdown, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 5) Select2 support ---
    const select2Results = getVisibleDropdownContainer('.select2-results__options, .select2-results', target);
    if (select2Results && select2Results.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(select2Results, 'supported dropdown')) return;
      const options = [...select2Results.querySelectorAll('.select2-results__option')];
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
        completeExtraction(items, note, select2Results, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 7) Sallie Mae modal dropdowns ---
    const sallieModal = getVisibleSallieMaeModal(target);
    if (sallieModal && sallieModal.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(sallieModal, 'supported dropdown')) return;
      const optionButtons = [...sallieModal.querySelectorAll('input.slm-btngroup-radio')]
        .map(input => input.closest('[role="button"]'))
        .filter(Boolean);
      const uniqueOptions = [...new Set(optionButtons)];
      const fields = resolveFields(
        uniqueOptions,
        o => getOptionLabelText(o),
        [
          o => o.querySelector('input.slm-btngroup-radio')?.value || '',
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        completeExtraction(items, note, sallieModal, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 6) Chosen support ---
    const chosenResults = getVisibleDropdownContainer('.chosen-results', target);
    if (chosenResults && chosenResults.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(chosenResults, 'supported dropdown')) return;
      const options = [...chosenResults.querySelectorAll('.chosen-option')];
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
        completeExtraction(items, note, chosenResults, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    // --- 7) Generic listitem menus ---
    const genericListItem = target.closest && target.closest('[role="listitem"]');
    if (genericListItem && !genericListItem.closest('.SelectMenu')) {
      const listContainer = findListItemContainer(genericListItem);
      if (listContainer) {
        e.preventDefault();
        e.stopPropagation();

        if (shouldDebugSupported(prefs) && copyDebugHtml(listContainer, 'supported dropdown')) return;
        const options = [...listContainer.querySelectorAll('[role="listitem"]')];
        const fields = resolveFields(
          options,
          o => getOptionLabelText(o),
          [
            o => o.querySelector('input[type="checkbox"], input[type="radio"]')?.value || '',
            o => o.dataset.value,
            o => o.getAttribute('value') || ''
          ]
        );
        const { items, note, error } = buildOutput(fields, prefs);

        if (items.length) {
          completeExtraction(items, note, listContainer, prefs);
          return;
        }

        showErrorToast(error || NO_ITEMS_FOUND_TEXT);
        cleanup();
        return;
      }
    }

    // --- 7) GitHub SelectMenu lists ---
    const ghRoot = target.getRootNode && target.getRootNode();
    const ghListItem = target.closest && target.closest('[role="listitem"]');
    const ghMenuFromTarget = (ghListItem && ghListItem.closest && ghListItem.closest('[role="list"]'))
      || (ghListItem && ghListItem.closest && ghListItem.closest('.SelectMenu-list'))
      || (target.closest && target.closest('.SelectMenu-list'));
    const ghMenu = ghMenuFromTarget
      || (ghRoot && ghRoot.querySelector && ghRoot.querySelector('.SelectMenu-list'))
      || [...document.querySelectorAll('.SelectMenu-list')].find(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        return true;
      });
    if (ghMenu && (ghMenuFromTarget || (ghMenu.contains && ghMenu.contains(target)))) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(ghMenu, 'supported dropdown')) return;
      const options = [...ghMenu.querySelectorAll('[role="listitem"]')];
      const fields = resolveFields(
        options,
        o => getOptionLabelText(o),
        [
          o => o.querySelector('input[type="checkbox"], input[type="radio"]')?.value || '',
          o => o.dataset.value
        ]
      );
      const { items, note, error } = buildOutput(fields, prefs);

      if (items.length) {
        completeExtraction(items, note, ghMenu, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }

    const listbox = [...document.querySelectorAll('[role="listbox"]')]
      .find(el => el.offsetParent !== null);

    if (listbox && listbox.contains(target)) {
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
        completeExtraction(items, note, listbox, prefs);
        return;
      }

      showErrorToast(error || NO_ITEMS_FOUND_TEXT);
      cleanup();
      return;
    }
  }

  // ===== MAIN HANDLER =====
  function onMouseDown(e) {
    if (skipMouseDown) {
      skipMouseDown = false;
      return;
    }
    if (extractionPending) return;
    window.__dropdownExtractorLastPointer = { x: e.clientX, y: e.clientY };
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const rawTarget = pathTarget || e.target;
    let target = rawTarget;
    if (rawTarget && rawTarget.closest) {
      const ghList = rawTarget.closest('.SelectMenu-list');
      if (ghList) {
        target = rawTarget.closest('[role="listitem"]') || ghList || rawTarget;
      }
    }
    const prefs = window.__dropdownExtractorPrefs;
    if (prefs) {
      e._dropdownExtractorTarget = target;
      if (isMenuTriggerLike(target) && !shouldDebugAnyTwo(prefs)) {
        return;
      }
      if (shouldDebugAnyTwo(prefs) && isMenuTriggerLike(target)) {
        const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
        if (prefs.safeCapture && debugBlocks.length === 0) {
          return;
        }
        captureDebugElement(target);
        skipMouseDown = true;
        return;
      }
      const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
      if (shouldDebugAnyTwo(prefs) && debugBlocks.length === 0) {
        // Allow 1/2 to open the menu even if it looks option-like.
      } else if (shouldBlockOptionClick(prefs, target)) {
        deferCleanup = true;
        e.preventDefault();
        e.stopPropagation();
        if (!prefs.debugMode) {
          handleSupportedClick(e, prefs);
          return;
        }
      }
      if (shouldDebugAnyTwo(prefs)) {
        const debugTarget = document.elementFromPoint(e.clientX, e.clientY) || target;
        const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
        if (prefs.safeCapture && debugBlocks.length === 0) {
          return;
        }
        if (
          prefs.safeCapture
          && window.__dropdownExtractorDebugBlocks?.length === 1
          && !debugTarget.closest(`.${TOAST_CLASS}`)
        ) {
          deferCleanup = true;
          e.preventDefault();
          e.stopPropagation();
          window.__dropdownExtractorDebugSuppressClick = true;
        }
        captureDebugElement(debugTarget);
        return;
      }
      handleSupportedClick(e, prefs);
      return;
    }

    getPrefs(loadedPrefs => {
      window.__dropdownExtractorPrefs = loadedPrefs;
      e._dropdownExtractorTarget = target;
      if (shouldBlockOptionClick(loadedPrefs, target)) {
        deferCleanup = true;
        e.preventDefault();
        e.stopPropagation();
      }
      if (shouldDebugAnyTwo(loadedPrefs)) {
        const debugTarget = document.elementFromPoint(e.clientX, e.clientY) || target;
        const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
        if (loadedPrefs.safeCapture && debugBlocks.length === 0) {
          return;
        }
        if (
          loadedPrefs.safeCapture
          && window.__dropdownExtractorDebugBlocks?.length === 1
          && !debugTarget.closest(`.${TOAST_CLASS}`)
        ) {
          deferCleanup = true;
          e.preventDefault();
          e.stopPropagation();
          window.__dropdownExtractorDebugSuppressClick = true;
        }
        captureDebugElement(debugTarget);
        return;
      }
      handleSupportedClick(e, loadedPrefs);
    });
  }

  function onMouseMove(e) {
    if (!window.__dropdownExtractorActive) return;
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs || !shouldDebugAnyTwo(prefs)) return;
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    if (hovered && hovered.nodeType === Node.ELEMENT_NODE && !hovered.closest(`.${TOAST_CLASS}`)) {
      window.__dropdownExtractorLastHover = hovered;
    }
  }

  function onClick(e) {
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs) return;
    if (shouldDebugAnyTwo(prefs)) {
      if (window.__dropdownExtractorDebugSuppressClick) {
        window.__dropdownExtractorDebugSuppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        if (pendingSafeCleanup) cleanup(true);
      }
      const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
      if (prefs.safeCapture && debugBlocks.length === 0 && !window.__dropdownExtractorDebugJustCompleted) {
        const point = { x: e.clientX, y: e.clientY };
        const triggerTarget = e._dropdownExtractorTarget || e.target;
        scheduleAnyTwoFirstCapture(point, triggerTarget);
      }
      return;
    }
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const rawTarget = pathTarget || e.target;
    let target = rawTarget;
    if (rawTarget && rawTarget.closest && rawTarget.closest('.SelectMenu-list')) {
      target = rawTarget.closest('[role="listitem"]') || rawTarget.closest('.SelectMenu-list') || rawTarget;
    }
    if (shouldBlockOptionClick(prefs, target)) {
      e.preventDefault();
      e.stopPropagation();
      if (pendingSafeCleanup) cleanup(true);
      return;
    }
    if (pendingSafeCleanup) cleanup(true);
  }

  function scheduleAnyTwoFirstCapture(point, triggerTarget) {
    if (window.__dropdownExtractorDebugDeferredCapture) return;
    window.__dropdownExtractorDebugDeferredCapture = true;
    window.setTimeout(() => {
      window.__dropdownExtractorDebugDeferredCapture = false;
      if (window.__dropdownExtractorDebugBlocks?.length) return;
      const startTime = Date.now();
      const findVisibleNestedMenu = menuRoot => {
        if (!menuRoot || !menuRoot.querySelectorAll) return null;
        const nested = [...menuRoot.querySelectorAll('[role="menu"], [role="listbox"], [role="list"]')]
          .filter(el => el !== menuRoot && isElementVisible(el));
        return nested.find(el =>
          [...el.querySelectorAll(OPTION_LIKE_SELECTOR)].some(opt => opt && opt.offsetParent !== null)
        ) || null;
      };
      const pollForMenu = () => {
        if (window.__dropdownExtractorDebugBlocks?.length) return;
        const menu =
          getVisibleMenuContainer(point) ||
          getVisibleDropdownContainer('[role="menu"], [role="listbox"], [role="list"]', triggerTarget);
        const hasVisibleOption = menu
          ? [...menu.querySelectorAll(OPTION_LIKE_SELECTOR)].some(el => el && el.offsetParent !== null)
          : false;
        if (menu && hasVisibleOption) {
          const candidateMenu = findVisibleNestedMenu(menu) || menu;
          if (captureDebugElement(candidateMenu)) return;
          return;
        }
        if (Date.now() - startTime >= 500) {
          captureDebugElement(triggerTarget);
          return;
        }
        window.__dropdownExtractorDebugPendingTriggerTimer = window.setTimeout(pollForMenu, 50);
      };
      pollForMenu();
    }, 50);
  }

  function onMouseUp(e) {
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs) return;
    if (shouldDebugAnyTwo(prefs)) {
      const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
      if (prefs.safeCapture && debugBlocks.length === 0) {
        const point = { x: e.clientX, y: e.clientY };
        const triggerTarget = e._dropdownExtractorTarget || e.target;
        scheduleAnyTwoFirstCapture(point, triggerTarget);
      }
      return;
    }
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const target = pathTarget || e.target;
    if (shouldBlockOptionClick(prefs, target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPointerUp(e) {
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs) return;
    if (shouldDebugAnyTwo(prefs)) return;
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const target = pathTarget || e.target;
    if (shouldBlockOptionClick(prefs, target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPointerDown(e) {
    if (!window.__dropdownExtractorActive) return;
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs) return;
    if (prefs.safeCapture && !prefs.debugMode) {
      const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
      const rawTarget = pathTarget || e.target;
      const menuItem = rawTarget && rawTarget.closest
        ? rawTarget.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
        : null;
      if (menuItem && shouldBlockOptionClick(prefs, menuItem)) {
        deferCleanup = true;
        e.preventDefault();
        e.stopPropagation();
        e._dropdownExtractorTarget = menuItem;
        handleSupportedClick(e, prefs);
        skipMouseDown = true;
        return;
      }
    }
    if (!shouldDebugAnyTwo(prefs)) return;
    if (window.__dropdownExtractorDebugBlocks?.length !== 1) return;
    const path = e.composedPath ? e.composedPath() : [];
    const storedContainer = window.__dropdownExtractorDebugContainer;
    if (storedContainer) {
      const pathInside = path.find(el =>
        el && el.nodeType === Node.ELEMENT_NODE && storedContainer.contains(el) && el !== storedContainer
      );
      if (pathInside) {
        window.__dropdownExtractorDebugOptionCandidate = pathInside;
      }
    }
    const pathOption = path.find(el =>
      el && el.nodeType === Node.ELEMENT_NODE && el.matches && el.matches(OPTION_LIKE_SELECTOR)
    );
    const target = pathOption || document.elementFromPoint(e.clientX, e.clientY) || e.target;
    if (target && target.closest && target.closest(`.${TOAST_CLASS}`)) return;
    window.__dropdownExtractorLastPointer = { x: e.clientX, y: e.clientY };
    const debugBlocks = window.__dropdownExtractorDebugBlocks || [];
    if (prefs.safeCapture && debugBlocks.length === 0) {
      return;
    }
    if (prefs.safeCapture && isMenuTriggerLike(target)) {
      if (captureDebugElement(target)) {
        skipMouseDown = true;
      }
      return;
    }
    if (prefs.safeCapture && debugBlocks.length === 0) {
      captureDebugElement(target);
      return;
    }
    if (prefs.safeCapture) {
      const optionContext = getOptionContext(target);
      const visibleContainer = optionContext && optionContext.container && isElementVisible(optionContext.container)
        ? optionContext.container
        : getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
      const isOptionTarget = isOptionLike(target) || !!(visibleContainer && visibleContainer.contains(target));
      if (!isOptionTarget) {
        captureDebugElement(target);
        return;
      }
      // Only block on option capture; allow trigger/menu open on 1/2.
      deferCleanup = true;
      e.preventDefault();
      e.stopPropagation();
      window.__dropdownExtractorDebugSuppressClick = true;
    }
    if (captureDebugElement(target)) {
      skipMouseDown = true;
    }
  }

  function handlePreemptiveMenuBlock(e, menuItem, prefs) {
    if (!menuItem || !shouldBlockOptionClick(prefs, menuItem)) return false;
    deferCleanup = true;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    e._dropdownExtractorTarget = menuItem;
    window.__dropdownExtractorLastPointer = { x: e.clientX, y: e.clientY };
    if (shouldDebugAnyTwo(prefs)) {
      if (prefs.safeCapture) {
        window.__dropdownExtractorDebugSuppressClick = true;
      }
      if (captureDebugElement(menuItem)) {
        skipMouseDown = true;
        return true;
      }
    }
    handleSupportedClick(e, prefs);
    skipMouseDown = true;
    return true;
  }

  function onWindowPointerDown(e) {
    if (!window.__dropdownExtractorActive) return;
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs || !prefs.safeCapture || shouldDebugAnyTwo(prefs)) return;
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const rawTarget = pathTarget || e.target;
    const menuItem = rawTarget && rawTarget.closest
      ? rawTarget.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
      : null;
    handlePreemptiveMenuBlock(e, menuItem, prefs);
  }

  function onWindowMouseDown(e) {
    if (!window.__dropdownExtractorActive) return;
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs || !prefs.safeCapture || shouldDebugAnyTwo(prefs)) return;
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const rawTarget = pathTarget || e.target;
    const menuItem = rawTarget && rawTarget.closest
      ? rawTarget.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
      : null;
    handlePreemptiveMenuBlock(e, menuItem, prefs);
  }

  function onWindowClick(e) {
    if (!window.__dropdownExtractorActive) return;
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs || !prefs.safeCapture || shouldDebugAnyTwo(prefs)) return;
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const rawTarget = pathTarget || e.target;
    const menuItem = rawTarget && rawTarget.closest
      ? rawTarget.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
      : null;
    handlePreemptiveMenuBlock(e, menuItem, prefs);
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  window.addEventListener('mousedown', onWindowMouseDown, true);
  window.addEventListener('click', onWindowClick, true);

  showArmedToast();
  notifyBackground('armed');

  armTimer();
})();
