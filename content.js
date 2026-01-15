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

  function buildDebugAnyTwoPayload(triggerEl, containerEl, optionEl) {
    const triggerBlock = containerEl
      ? buildDebugPlaceholder('1. trigger', 'skipped')
      : (triggerEl ? buildDebugBlock(triggerEl, '1. trigger') : buildDebugPlaceholder('1. trigger', 'failed'));
    const containerBlock = containerEl
      ? buildDebugBlock(containerEl, '1. menu container')
      : buildDebugPlaceholder('1. menu container', 'failed');
    const optionBlock = optionEl
      ? buildDebugBlock(optionEl, '2. menu option')
      : buildDebugPlaceholder('2. menu option', 'not extracted yet');
    return [triggerBlock, containerBlock, optionBlock].join('\n\n');
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
    window.__dropdownExtractorDebugTrigger = null;
    window.__dropdownExtractorDebugOptionCandidate = null;
    window.__dropdownExtractorDebugSuppressClick = false;
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
        const point = window.__dropdownExtractorLastPointer || null;
        const triggerContainer = getMenuContainerFromTrigger(element);
        const openMenu = getVisibleDropdownContainer('[role="menu"], [role="listbox"], [role="list"]', element)
          || triggerContainer
          || getVisibleMenuContainer(point);
        if (openMenu && openMenu !== element) {
          window.__dropdownExtractorDebugBlocks = ['element-1'];
          window.__dropdownExtractorDebugContainer = openMenu;
          window.__dropdownExtractorDebugFirstElement = openMenu;
          clearArmedToast();
          flashElement(openMenu);
          navigator.clipboard.writeText(buildDebugAnyTwoPayload(
            window.__dropdownExtractorDebugTrigger || element,
            openMenu,
            null
          ));
          replaceActiveToast(showToast('Debug: copied HTML (1/2)', {
            position: 'top-right',
            duration: EXTRACTED_TOAST_MS,
            background: TOAST_SUCCESS_BG
          }));
          return true;
        } else if (!window.__dropdownExtractorDebugPendingTimeout) {
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
            clearArmedToast();
            flashElement(element1);
            navigator.clipboard.writeText(buildDebugAnyTwoPayload(triggerEl, containerEl, null));
            replaceActiveToast(showToast('Debug: copied HTML (1/2)', {
              position: 'top-right',
              duration: EXTRACTED_TOAST_MS,
              background: TOAST_SUCCESS_BG
            }));
          }, 80);
        }
      }
    }

    if (blocks.length === 1) {
      const activeContainer = storedContainer || getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
      if (activeContainer && activeContainer !== element) {
        const optionBlock = buildDebugBlock(element, 'element 2');
        if (optionBlock) {
          window.__dropdownExtractorDebugBlocks = ['element-1', 'element-2'];
          clearArmedToast();
          flashElement(activeContainer);
          setTimeout(() => {
            navigator.clipboard.writeText(buildDebugAnyTwoPayload(window.__dropdownExtractorDebugTrigger, activeContainer, element));
          }, 120);
          replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
        setTimeout(() => {
          navigator.clipboard.writeText(buildDebugAnyTwoPayload(
            window.__dropdownExtractorDebugTrigger,
            window.__dropdownExtractorDebugContainer,
            element
          ));
        }, 120);
        replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
        setTimeout(() => {
          navigator.clipboard.writeText(buildDebugAnyTwoPayload(
            window.__dropdownExtractorDebugTrigger,
            storedContainer,
            element
          ));
        }, 120);
        replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
          setTimeout(() => {
            navigator.clipboard.writeText(buildDebugAnyTwoPayload(
              window.__dropdownExtractorDebugTrigger,
              container,
              element
            ));
          }, 120);
          replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
            setTimeout(() => {
              navigator.clipboard.writeText(buildDebugAnyTwoPayload(
                window.__dropdownExtractorDebugTrigger,
                container,
                optionEl
              ));
            }, 120);
            replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
      navigator.clipboard.writeText(buildDebugAnyTwoPayload(triggerEl, containerEl, null));
      replaceActiveToast(showToast('Debug: copied HTML (1/2)', {
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
      setTimeout(() => {
        navigator.clipboard.writeText(buildDebugAnyTwoPayload(triggerEl, containerEl, optionEl));
      }, 120);
    }
    replaceActiveToast(showToast('Debug: copied HTML (2/2)', {
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
    '[role="menuitem"]',
    '[role^="menuitem"]',
    '.menuitem',
    '[id^="react-select-"][id*="-option-"]'
  ].join(',');

  const FLASH_CLASS = 'dropdown-extractor-flash';
  const FLASH_STYLE_ID = 'dropdown-extractor-flash-style';
  const FEEDBACK_DURATION_MS = 900;

  function getOptionContext(target) {
    if (!target || !target.closest) return null;
    const optionEl = target.closest(OPTION_LIKE_SELECTOR);
    if (optionEl) {
      return { option: optionEl, container: findDebugContainer(optionEl) };
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
    if (isOptionLike(target)) return true;
    const menuContainer = getVisibleMenuContainer(window.__dropdownExtractorLastPointer || null);
    return !!(menuContainer && menuContainer.contains(target));
  }

  function cleanup(force = false) {
    if (!force && deferCleanup) {
      pendingSafeCleanup = true;
      return;
    }
    deferCleanup = false;
    pendingSafeCleanup = false;
    extractionPending = false;
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mouseup', onMouseUp, true);
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
    const target = e._dropdownExtractorTarget || e.target;
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

    // --- 4) Radix / role="menu" support ---
    const menu = getVisibleDropdownContainer('[role="menu"]', target);
    if (menu && menu.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      if (shouldDebugSupported(prefs) && copyDebugHtml(menu, 'supported dropdown')) return;
      const options = [...menu.querySelectorAll('[role="menuitem"]')];
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
    const target = pathTarget || e.target;
    const prefs = window.__dropdownExtractorPrefs;
    if (prefs) {
      e._dropdownExtractorTarget = target;
      if (shouldBlockOptionClick(prefs, target)) {
        deferCleanup = true;
        e.preventDefault();
        e.stopPropagation();
      }
      if (shouldDebugAnyTwo(prefs)) {
        const debugTarget = document.elementFromPoint(e.clientX, e.clientY) || target;
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
      if (captureDebugElement(debugTarget)) return;
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
      if (captureDebugElement(debugTarget)) return;
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
    const pathTarget = e.composedPath ? e.composedPath().find(el => el && el.nodeType === Node.ELEMENT_NODE) : null;
    const target = pathTarget || e.target;
    if (shouldBlockOptionClick(prefs, target)) {
      e.preventDefault();
      e.stopPropagation();
      if (pendingSafeCleanup) cleanup(true);
    }
    if (shouldDebugAnyTwo(prefs) && window.__dropdownExtractorDebugSuppressClick) {
      window.__dropdownExtractorDebugSuppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      if (pendingSafeCleanup) cleanup(true);
    }
  }

  function onMouseUp(e) {
    const prefs = window.__dropdownExtractorPrefs;
    if (!prefs) return;
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
    if (!prefs || !shouldDebugAnyTwo(prefs)) return;
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
    if (prefs.safeCapture) {
      deferCleanup = true;
      e.preventDefault();
      e.stopPropagation();
      window.__dropdownExtractorDebugSuppressClick = true;
    }
    if (captureDebugElement(target)) {
      skipMouseDown = true;
    }
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseup', onMouseUp, true);

  showArmedToast();
  notifyBackground('armed');

  armTimer();
})();
