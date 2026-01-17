const typeSelect = document.getElementById('type');
const typeTrigger = document.getElementById('type-trigger');
const typeLabel = document.getElementById('type-label');
const typeMenu = document.getElementById('type-menu');
const typeSupportConfig = document.getElementById('type-support-config');
const countInput = document.getElementById('count');
const renderButton = document.getElementById('render');
const snapshotTextButton = document.getElementById('snapshot-text');
const snapshotJsonButton = document.getElementById('snapshot-json');
const randomizeButton = document.getElementById('randomize');
const itemsBody = document.getElementById('items');
const itemsTable = document.querySelector('.items-table');
const dropdownContainer = document.getElementById('dropdown');
const dropdownType = document.getElementById('dropdown-type');
const dropdownPanel = document.querySelector('.dropdown-panel');
const valueModeSelect = document.getElementById('value-mode');
const nativeNote = document.getElementById('note-native');
const libsNote = document.getElementById('note-libs');
const radixNote = document.getElementById('note-radix');
const muiNote = document.getElementById('note-mui');
const ghNote = document.getElementById('note-gh');
const aliNote = document.getElementById('note-ali');
const notesTitle = document.getElementById('notes-title');

let lastRenderSnapshot = null;

const supportedTypes = new Set([
  'native',
  'aria',
  'selectize',
  'react',
  'react-variant',
  'downshift',
  'mui',
  'radix-menu',
  'antd',
  'select2',
  'chosen',
  'slm-modal',
  'github-selectmenu',
  'aliexpress'
]);

function isTypeSupported(type) {
  return supportedTypes.has(type);
}

function updateTypeDisplay() {
  const option = typeSelect.options[typeSelect.selectedIndex];
  const label = option ? option.textContent.trim() : '';
  if (typeLabel) {
    typeLabel.textContent = label;
  }
  if (typeSupportConfig) {
    typeSupportConfig.className = `type-support ${isTypeSupported(typeSelect.value) ? 'supported' : 'unsupported'}`;
    typeSupportConfig.textContent = isTypeSupported(typeSelect.value) ? 'Supported' : 'Not supported';
  }
}

function updateRenderedTypeDisplay() {
  if (!lastRenderSnapshot) return;
  const label = lastRenderSnapshot.typeLabel || typeSelect.options[typeSelect.selectedIndex].textContent.trim();
  dropdownType.textContent = '';
  dropdownType.appendChild(document.createTextNode(`Type: ${label}`));
  const pill = document.createElement('span');
  pill.className = `type-support ${isTypeSupported(lastRenderSnapshot.type) ? 'supported' : 'unsupported'}`;
  pill.textContent = isTypeSupported(lastRenderSnapshot.type) ? 'Supported' : 'Not supported';
  dropdownType.appendChild(pill);
}

function updateNotesVisibility() {
  if (!muiNote || !libsNote || !nativeNote || !radixNote || !aliNote || !ghNote) return;
  const showNative = typeSelect.value === 'native' || (lastRenderSnapshot && lastRenderSnapshot.type === 'native');
  const showMui = typeSelect.value === 'mui' || (lastRenderSnapshot && lastRenderSnapshot.type === 'mui');
  const showLibs = ['antd', 'select2', 'chosen'].includes(typeSelect.value)
    || (lastRenderSnapshot && ['antd', 'select2', 'chosen'].includes(lastRenderSnapshot.type));
  const showRadix = typeSelect.value === 'radix-menu' || (lastRenderSnapshot && lastRenderSnapshot.type === 'radix-menu');
  const showGh = typeSelect.value === 'github-selectmenu' || (lastRenderSnapshot && lastRenderSnapshot.type === 'github-selectmenu');
  const showAli = typeSelect.value === 'aliexpress' || (lastRenderSnapshot && lastRenderSnapshot.type === 'aliexpress');
  nativeNote.style.display = showNative ? 'list-item' : 'none';
  muiNote.style.display = showMui ? 'list-item' : 'none';
  libsNote.style.display = showLibs ? 'list-item' : 'none';
  radixNote.style.display = showRadix ? 'list-item' : 'none';
  ghNote.style.display = showGh ? 'list-item' : 'none';
  aliNote.style.display = showAli ? 'list-item' : 'none';
  if (itemsTable) {
    itemsTable.classList.toggle('hide-href', !(showRadix || showAli));
  }
  if (notesTitle) {
    const visibleNotes = document.querySelectorAll('.notes-list .note')
      .length - document.querySelectorAll('.notes-list .note[style*="display: none"]').length;
    notesTitle.textContent = visibleNotes > 1 ? 'Notes:' : 'Note:';
  }
}

function setTypeMenuOpen(open) {
  if (!typeMenu || !typeTrigger) return;
  typeMenu.classList.toggle('open', open);
  typeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateTypeMenuSelection() {
  if (!typeMenu) return;
  typeMenu.querySelectorAll('.type-option').forEach(option => {
    option.setAttribute('aria-selected', option.dataset.value === typeSelect.value ? 'true' : 'false');
  });
}

function buildTypeMenu() {
  if (!typeMenu) return;
  typeMenu.innerHTML = '';
  [...typeSelect.options].forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `type-option ${isTypeSupported(option.value) ? 'supported' : 'unsupported'}`;
    item.setAttribute('role', 'option');
    item.dataset.value = option.value;

    const label = document.createElement('span');
    label.textContent = option.textContent.trim();
    const pill = document.createElement('span');
    pill.className = 'type-pill';
    pill.textContent = isTypeSupported(option.value) ? '✓' : '✕';

    item.appendChild(label);
    item.appendChild(pill);
    item.addEventListener('click', () => {
      typeSelect.value = option.value;
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      setTypeMenuOpen(false);
    });
    typeMenu.appendChild(item);
  });
  updateTypeMenuSelection();
}

function pulsePanel() {
  dropdownPanel.classList.remove('pulse');
  requestAnimationFrame(() => {
    dropdownPanel.classList.add('pulse');
    setTimeout(() => dropdownPanel.classList.remove('pulse'), 600);
  });
}

function enablePressedState() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    target.classList.add('is-pressed');
    setTimeout(() => target.classList.remove('is-pressed'), 140);
  });
}

function createDropdownShell(selectedText) {
  const shell = document.createElement('div');
  shell.className = 'dropdown-shell';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dropdown-trigger';
  trigger.textContent = selectedText || 'Select an option';

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  shell.appendChild(trigger);
  shell.appendChild(menu);

  trigger.addEventListener('click', () => {
    menu.classList.toggle('open');
  });

  document.addEventListener('click', (event) => {
    if (!shell.contains(event.target)) {
      menu.classList.remove('open');
    }
  });

  return { shell, trigger, menu };
}

function createSlmModalDropdown(items, selectedText) {
  const shell = document.createElement('div');
  shell.className = 'dropdown-shell';

  const trigger = document.createElement('a');
  trigger.className = 'slm-show-modal select form-control';
  trigger.id = 'slm-trigger';
  trigger.href = '';
  trigger.dataset.bsTarget = '#slm-modal';
  trigger.dataset.bsToggle = 'modal';
  trigger.textContent = selectedText || 'Select an option';

  const modal = document.createElement('div');
  modal.className = 'modal slm-dropdown-modal';
  modal.id = 'slm-modal';
  modal.setAttribute('tabindex', '-1');
  modal.setAttribute('aria-hidden', 'true');

  const modalBody = document.createElement('div');
  modalBody.className = 'slm-modal-body';

  const group = document.createElement('div');
  group.className = 'btn-group slm-subtitle3-reg';
  group.setAttribute('role', 'group');

  items.forEach(item => {
    const option = document.createElement('div');
    option.setAttribute('role', 'button');
    option.tabIndex = 0;
    option.id = `slm-${item.value || item.text}-btn`;
    option.setAttribute('aria-expanded', 'false');

    const input = document.createElement('input');
    input.className = 'slm-btngroup-radio';
    input.type = 'radio';
    input.tabIndex = -1;
    input.name = 'slm-choices';
    input.value = item.value || item.text || '';

    option.appendChild(input);
    option.appendChild(document.createTextNode(item.text || ''));
    group.appendChild(option);
  });

  modalBody.appendChild(group);
  modal.appendChild(modalBody);
  shell.appendChild(trigger);
  shell.appendChild(modal);

  function setOpen(open) {
    modal.classList.toggle('show', open);
    modal.style.display = open ? 'block' : 'none';
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  trigger.addEventListener('click', event => {
    event.preventDefault();
    setOpen(true);
  });

  modal.addEventListener('click', event => {
    const option = event.target.closest('[role="button"]');
    if (!option) return;
    group.querySelectorAll('input.slm-btngroup-radio').forEach(input => {
      input.checked = input === option.querySelector('input.slm-btngroup-radio');
    });
    trigger.textContent = option.textContent.trim();
    setOpen(false);
  });

  document.addEventListener('click', event => {
    if (!shell.contains(event.target)) {
      setOpen(false);
    }
  });

  return { shell, trigger, modal };
}

function createAliExpressSearchDropdown(items, selectedText) {
  const shell = document.createElement('div');
  shell.className = 'ali-shell';

  const input = document.createElement('input');
  input.className = 'search--keyword--15P08Ji';
  input.id = 'search-words';
  input.type = 'text';
  input.placeholder = selectedText || 'Search for items';
  input.autocomplete = 'off';

  const suggestions = document.createElement('div');
  suggestions.className = 'src--active--mock ali-suggestions';

  const historySection = document.createElement('section');
  historySection.className = 'src--history--mock';

  const historyTitle = document.createElement('div');
  historyTitle.className = 'ali-section-title';
  historyTitle.textContent = 'Search history';
  historySection.appendChild(historyTitle);

  const historyWrap = document.createElement('div');
  historyWrap.className = 'src--hisWrap--mock';
  historySection.appendChild(historyWrap);

  const discoverSection = document.createElement('section');
  discoverSection.className = 'src--section--mock';

  const discoverTitle = document.createElement('div');
  discoverTitle.className = 'ali-section-title';
  discoverTitle.textContent = 'Discover more';
  discoverSection.appendChild(discoverTitle);

  const discoverList = document.createElement('ul');
  discoverList.className = 'src--listWrap--mock';
  discoverSection.appendChild(discoverList);

  const historyItems = items.slice(0, Math.max(2, Math.min(4, items.length)));
  const discoverItems = items.slice(historyItems.length);

  historyItems.forEach(item => {
    const historyItem = document.createElement('span');
    historyItem.className = 'src--hisItem--mock';
    const link = document.createElement('a');
    link.href = item.href || '#';
    link.textContent = item.text || '';
    historyItem.appendChild(link);
    historyWrap.appendChild(historyItem);
  });

  discoverItems.forEach(item => {
    const entry = document.createElement('li');
    entry.className = 'src--item--mock';
    const link = document.createElement('a');
    link.href = item.href || '#';
    const title = document.createElement('span');
    title.className = 'src--listTitle--mock';
    title.textContent = item.text || '';
    link.appendChild(title);
    entry.appendChild(link);
    discoverList.appendChild(entry);
  });

  suggestions.appendChild(historySection);
  suggestions.appendChild(discoverSection);

  shell.appendChild(input);
  shell.appendChild(suggestions);

  const openSuggestions = () => {
    suggestions.classList.add('open');
  };
  const closeSuggestions = () => {
    suggestions.classList.remove('open');
  };

  input.addEventListener('focus', openSuggestions);
  input.addEventListener('click', openSuggestions);

  document.addEventListener('click', (event) => {
    if (!shell.contains(event.target)) {
      closeSuggestions();
    }
  });

  return { shell };
}

function createGitHubSelectMenuDropdown(items) {
  const shell = document.createElement('div');
  shell.className = 'gh-selectmenu';

  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'gh-selectmenu-summary';

  const summaryLabel = document.createElement('span');
  summaryLabel.textContent = 'Select lists';

  const caret = document.createElement('span');
  caret.className = 'gh-caret';
  caret.textContent = '▾';

  summary.appendChild(summaryLabel);
  summary.appendChild(caret);

  const menuWrap = document.createElement('div');
  menuWrap.className = 'SelectMenu';

  const list = document.createElement('div');
  list.className = 'SelectMenu-list SelectMenu-list--borderless';
  list.setAttribute('role', 'menu');

  const listInner = document.createElement('div');
  listInner.setAttribute('role', 'list');

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'form-checkbox mt-1 mb-0 p-1';
    row.setAttribute('role', 'listitem');
    if (item.dataValue) row.dataset.value = item.dataValue;

    const label = document.createElement('label');
    label.className = 'd-flex';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'mx-0 js-user-list-menu-item';
    input.name = 'list_ids[]';
    if (item.value) {
      input.value = item.value;
    }

    const wrap = document.createElement('span');
    wrap.className = 'Truncate ml-2 text-normal f5';

    const text = document.createElement('span');
    text.className = 'Truncate-text';
    text.textContent = item.text || '';

    wrap.appendChild(text);
    label.appendChild(input);
    label.appendChild(wrap);
    row.appendChild(label);
    listInner.appendChild(row);
  });

  list.appendChild(listInner);
  menuWrap.appendChild(list);
  shell.appendChild(summary);
  shell.appendChild(menuWrap);

  const setOpen = (open) => {
    shell.classList.toggle('open', open);
  };

  summary.addEventListener('click', () => {
    setOpen(!shell.classList.contains('open'));
  });

  listInner.addEventListener('click', event => {
    const option = event.target.closest('[role="listitem"]');
    if (!option) return;
    const checkbox = option.querySelector('input[type="checkbox"]');
    const clickedCheckbox = event.target.closest('input[type="checkbox"]');
    const clickedLabel = event.target.closest('label');
    if (checkbox && !clickedCheckbox && !clickedLabel) {
      checkbox.checked = !checkbox.checked;
    }
    summaryLabel.textContent = option.textContent.trim();
    setOpen(false);
  });

  document.addEventListener('click', event => {
    if (!shell.contains(event.target)) {
      setOpen(false);
    }
  });

  return { shell };
}

function wireSelection(menuWrapper, listEl, trigger) {
  listEl.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"], [role="listitem"], [role="menuitem"], .option, .react-select__option, .react-select-variant-option, .mui-option, .ant-option, .select2-results__option, .chosen-option, .downshift-option, .mock-option, .radix-menuitem');
    if (!option) return;
    listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    option.classList.add('selected');
    trigger.textContent = option.textContent.trim();
    menuWrapper.classList.remove('open');
  });
}

function randomWord(min = 3, max = 8) {
  const length = Math.floor(Math.random() * (max - min + 1)) + min;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let word = '';
  for (let i = 0; i < length; i += 1) {
    word += letters[Math.floor(Math.random() * letters.length)];
  }
  return word;
}

function randomPhrase() {
  const count = Math.floor(Math.random() * 3) + 1;
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push(randomWord());
  }
  return words.join(' ');
}

function randomDashPhrase() {
  const count = Math.floor(Math.random() * 2) + 1;
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push(randomWord());
  }
  return words.join('-');
}

function randomUrl() {
  return `https://example.com/${randomDashPhrase()}`;
}

function createCell(field, index, initial) {
  const cell = document.createElement('td');
  const columnClass = field === 'data' ? 'col-data' : `col-${field}`;
  cell.classList.add(columnClass);
  const wrapper = document.createElement('div');
  wrapper.className = 'item-cell';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${field}-${index}`;
  input.placeholder = `${field}-${index + 1}`;
  if (initial) {
    input.value = initial.value || '';
    if (initial.missing) {
      input.value = '';
      input.disabled = true;
    }
  }

  const fieldLabel = field === 'data' ? 'data-value' : field;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'cell-button';
  clear.textContent = '🗑';
  clear.title = `Clear ${fieldLabel}`;
  clear.addEventListener('click', () => {
    input.value = '';
    updateChangedState();
  });

  const missing = document.createElement('button');
  missing.type = 'button';
  missing.className = 'cell-button danger';
  missing.textContent = '✕';
  missing.title = `Toggle missing ${fieldLabel}`;
  missing.setAttribute('aria-pressed', input.disabled ? 'true' : 'false');
  missing.addEventListener('click', () => {
    const isMissing = input.disabled;
    if (isMissing) {
      input.disabled = false;
      missing.setAttribute('aria-pressed', 'false');
    } else {
      input.value = '';
      input.disabled = true;
      missing.setAttribute('aria-pressed', 'true');
    }
    updateChangedState();
  });

  input.addEventListener('input', updateChangedState);

  wrapper.appendChild(input);
  wrapper.appendChild(clear);
  wrapper.appendChild(missing);
  cell.appendChild(wrapper);
  return cell;
}

function rebuildRows() {
  const existing = {};
  [...itemsBody.querySelectorAll('tr')].forEach((row, index) => {
    const textInput = document.getElementById(`text-${index}`);
    const valueInput = document.getElementById(`value-${index}`);
    const dataInput = document.getElementById(`data-${index}`);
    const hrefInput = document.getElementById(`href-${index}`);
    existing[index] = {
      text: { value: textInput?.value || '', missing: !!textInput?.disabled },
      value: { value: valueInput?.value || '', missing: !!valueInput?.disabled },
      data: { value: dataInput?.value || '', missing: !!dataInput?.disabled },
      href: { value: hrefInput?.value || '', missing: !!hrefInput?.disabled }
    };
  });

  itemsBody.innerHTML = '';
  const count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
  countInput.value = count;
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('tr');
    row.appendChild(createCell('text', i, existing[i]?.text));
    row.appendChild(createCell('value', i, existing[i]?.value));
    row.appendChild(createCell('data', i, existing[i]?.data));
    row.appendChild(createCell('href', i, existing[i]?.href));
    itemsBody.appendChild(row);
  }
  updateChangedState();
}

function setColumnMissing(field, makeMissing) {
  const inputs = [...document.querySelectorAll(`input[id^="${field}-"]`)];
  const buttons = [...document.querySelectorAll(`input[id^="${field}-"]`)]
    .map(input => input.parentElement.querySelector('.cell-button.danger'));

  inputs.forEach((input, idx) => {
    input.disabled = makeMissing;
    if (makeMissing) input.value = '';
    buttons[idx].setAttribute('aria-pressed', String(makeMissing));
  });
  updateChangedState();
}

function toggleColumnMissing(field) {
  const inputs = [...document.querySelectorAll(`input[id^="${field}-"]`)];
  const anyEnabled = inputs.some(input => !input.disabled);
  setColumnMissing(field, anyEnabled);
}

function clearColumn(field) {
  const inputs = [...document.querySelectorAll(`input[id^="${field}-"]`)];
  inputs.forEach(input => {
    input.value = '';
  });
  updateChangedState();
}

function numberColumn(field) {
  const inputs = [...document.querySelectorAll(`input[id^="${field}-"]`)];
  const separator = field === 'text' ? '. ' : '-';
  const prefixRe = field === 'text' ? /^(\d+)(?:\.\s*)?/ : /^(\d+)(?:-)?/;
  const hasPrefix = inputs.some(input => !input.disabled && prefixRe.test((input.value || '').trim()));
  let count = 1;
  inputs.forEach(input => {
    if (input.disabled) return;
    const current = (input.value || '').trim();
    if (hasPrefix) {
      input.value = current.replace(prefixRe, '').trimStart();
      return;
    }
    if (!current || /^\d+$/.test(current)) {
      input.value = String(count);
      count += 1;
      return;
    }
    input.value = `${count}${separator}${current}`.trim();
    count += 1;
  });
  updateChangedState();
}

function bindHeaderActions() {
  const headerRow = document.querySelector('.items-table thead');
  if (!headerRow) return;
  if (headerRow.dataset.bound === 'true') return;
  headerRow.dataset.bound = 'true';
  headerRow.addEventListener('click', event => {
    const button = event.target.closest('.icon-button');
    if (!button) return;
    const field = button.dataset.field;
    const action = button.dataset.action;
    if (action === 'clear') clearColumn(field);
    if (action === 'missing') toggleColumnMissing(field);
    if (action === 'number') numberColumn(field);
  });
}

function readItems() {
  const count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const textInput = document.getElementById(`text-${i}`);
    const valueInput = document.getElementById(`value-${i}`);
    const dataInput = document.getElementById(`data-${i}`);
    const hrefInput = document.getElementById(`href-${i}`);

    items.push({
      text: textInput.disabled ? '' : (textInput.value || ''),
      value: valueInput.disabled ? '' : (valueInput.value || ''),
      dataValue: dataInput.disabled ? '' : (dataInput.value || ''),
      href: hrefInput.disabled ? '' : (hrefInput.value || ''),
      textMissing: !!textInput.disabled,
      valueMissing: !!valueInput.disabled,
      dataMissing: !!dataInput.disabled,
      hrefMissing: !!hrefInput.disabled
    });
  }
  return items;
}

function buildSnapshot() {
  const items = readItems();
  const typeLabel = typeSelect.options[typeSelect.selectedIndex].textContent;
  return {
    type: typeSelect.value,
    typeLabel,
    valueSource: valueModeSelect.value,
    count: items.length,
    countValue: countInput.value,
    items
  };
}

function buildSnapshotText(snapshot) {
  const missingText = snapshot.items.filter(i => !i.text).length;
  const missingValue = snapshot.items.filter(i => !i.value).length;
  const missingData = snapshot.items.filter(i => !i.dataValue).length;
  const missingHref = snapshot.items.filter(i => !i.href).length;
  return [
    `type: ${snapshot.typeLabel}`,
    `value source: ${snapshot.valueSource}`,
    `items: ${snapshot.count}`,
    `missing text/value/data/href: ${missingText}/${missingValue}/${missingData}/${missingHref}`,
    '',
    ...snapshot.items.map((item, index) => (
      `${index + 1}. text="${item.text}" value="${item.value}" data-value="${item.dataValue}" href="${item.href}" (missing: ${item.textMissing}/${item.valueMissing}/${item.dataMissing}/${item.hrefMissing})`
    ))
  ].join('\n');
}

function applyValueTarget(element, value) {
  if (!value) return;
  const mode = valueModeSelect.value;
  if (mode === 'attribute' || mode === 'both') {
    element.setAttribute('value', value);
  }
  if (mode === 'property' || mode === 'both') {
    element.value = value;
  }
}

function applyMuiValueTarget(element, item) {
  const mode = valueModeSelect.value;
  if ((mode === 'attribute' || mode === 'both') && item.value) {
    element.setAttribute('value', item.value);
  }
  if (item.dataValue) {
    element.dataset.value = item.dataValue;
    return;
  }
  if (mode === 'property' && item.value) {
    element.dataset.value = item.value;
  }
}

function renderDropdown() {
  dropdownContainer.innerHTML = '';
  const items = readItems();
  const type = typeSelect.value;
  lastRenderSnapshot = buildSnapshot();
  updateRenderedTypeDisplay();
  updateNotesVisibility();
  updateChangedState();

  if (type === 'native') {
    const select = document.createElement('select');
    select.style.width = '100%';
    items.forEach(item => {
      const option = document.createElement('option');
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      select.appendChild(option);
    });
    dropdownContainer.appendChild(select);
    pulsePanel();
    return;
  }

  if (type === 'aria') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const listbox = document.createElement('div');
    listbox.className = 'mock-listbox';
    listbox.setAttribute('role', 'listbox');
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'mock-option';
      option.setAttribute('role', 'option');
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      listbox.appendChild(option);
    });
    menu.appendChild(listbox);
    wireSelection(menu, listbox, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'selectize') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const content = document.createElement('div');
    content.className = 'selectize-dropdown-content';
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'option';
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      content.appendChild(option);
    });
    menu.appendChild(content);
    wireSelection(menu, content, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'react') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const reactMenu = document.createElement('div');
    reactMenu.className = 'react-select__menu-list';
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'react-select__option';
      option.id = `react-select-mock-option-${index}`;
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      reactMenu.appendChild(option);
    });
    menu.appendChild(reactMenu);
    wireSelection(menu, reactMenu, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'react-variant') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const listbox = document.createElement('div');
    listbox.className = 'react-select-variant-MenuList';
    listbox.id = 'react-select-mock-listbox';
    listbox.setAttribute('role', 'dialog');
    listbox.setAttribute('aria-labelledby', 'react-select-mock-input');
    const list = document.createElement('div');
    list.setAttribute('role', 'list');
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'react-select-variant-option -option';
      option.id = `react-select-mock-option-${index}`;
      option.setAttribute('role', 'listitem');
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;

      const group = document.createElement('div');
      group.className = 'react-select-variant-group';
      group.setAttribute('role', 'group');
      if (item.text) group.setAttribute('aria-describedby', item.text);

      const button = document.createElement('button');
      button.className = 'react-select-variant-button';
      button.type = 'button';

      const label = document.createElement('div');
      label.className = 'react-select-variant-label';
      label.textContent = item.text;

      button.appendChild(label);
      group.appendChild(button);
      option.appendChild(group);
      list.appendChild(option);
    });
    listbox.appendChild(list);
    menu.appendChild(listbox);
    wireSelection(menu, list, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'downshift') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const listbox = document.createElement('ul');
    listbox.className = 'downshift-listbox';
    listbox.setAttribute('role', 'listbox');
    items.forEach((item, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'downshift-option';
      button.type = 'button';
      button.id = `downshift-item-${index}`;
      button.setAttribute('role', 'option');
      button.textContent = item.text;
      applyValueTarget(button, item.value);
      if (item.dataValue) button.dataset.value = item.dataValue;
      li.appendChild(button);
      listbox.appendChild(li);
    });
    menu.appendChild(listbox);
    wireSelection(menu, listbox, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'mui') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const listbox = document.createElement('ul');
    listbox.className = 'mui-listbox';
    listbox.setAttribute('role', 'listbox');
    items.forEach(item => {
      const option = document.createElement('li');
      option.className = 'mui-option';
      option.setAttribute('role', 'option');
      option.textContent = item.text;
      applyMuiValueTarget(option, item);
      listbox.appendChild(option);
    });
    menu.appendChild(listbox);
    wireSelection(menu, listbox, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'radix-menu') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const list = document.createElement('div');
    list.className = 'radix-menu';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-orientation', 'vertical');
    items.forEach(item => {
      const option = document.createElement('a');
      option.className = 'radix-menuitem';
      option.setAttribute('role', 'menuitem');
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.href) option.setAttribute('href', item.href);
      if (item.dataValue) option.dataset.value = item.dataValue;
      list.appendChild(option);
    });
    menu.appendChild(list);
    wireSelection(menu, list, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'antd') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const list = document.createElement('div');
    list.className = 'ant-select-dropdown';
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'ant-option ant-select-item-option';
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      list.appendChild(option);
    });
    menu.appendChild(list);
    wireSelection(menu, list, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'select2') {
    const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
    const list = document.createElement('ul');
    list.className = 'select2-results__options';
    items.forEach(item => {
      const option = document.createElement('li');
      option.className = 'select2-results__option';
      option.textContent = item.text;
      applyValueTarget(option, item.value);
      if (item.dataValue) option.dataset.value = item.dataValue;
      list.appendChild(option);
    });
    menu.appendChild(list);
    wireSelection(menu, list, trigger);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'aliexpress') {
    const { shell } = createAliExpressSearchDropdown(items, items[0]?.text);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'github-selectmenu') {
    const { shell } = createGitHubSelectMenuDropdown(items);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  if (type === 'slm-modal') {
    const { shell } = createSlmModalDropdown(items, items[0]?.text);
    dropdownContainer.appendChild(shell);
    pulsePanel();
    return;
  }

  const { shell, trigger, menu } = createDropdownShell(items[0]?.text);
  const list = document.createElement('ul');
  list.className = 'chosen-results';
  items.forEach(item => {
    const option = document.createElement('li');
    option.className = 'chosen-option';
    option.textContent = item.text;
    applyValueTarget(option, item.value);
    if (item.dataValue) option.dataset.value = item.dataValue;
    list.appendChild(option);
  });
  menu.appendChild(list);
  wireSelection(menu, list, trigger);
  dropdownContainer.appendChild(shell);
  pulsePanel();
}

function fillRandomValues() {
  const inputs = [...document.querySelectorAll('input[type="text"]')];
  inputs.forEach(input => {
    if (input.disabled) return;
    if (input.value) return;
    if (input.id.startsWith('text-')) {
      input.value = randomPhrase();
    } else if (input.id.startsWith('href-')) {
      input.value = randomUrl();
    } else {
      input.value = randomDashPhrase();
    }
  });
  updateChangedState();
}

function updateChangedState() {
  if (!lastRenderSnapshot) return;
  let anyChanged = false;
  const count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
  for (let i = 0; i < count; i += 1) {
    const isNewRow = i >= Number(lastRenderSnapshot.count || 0);
    ['text', 'value', 'data', 'href'].forEach(field => {
      const input = document.getElementById(`${field}-${i}`);
      if (!input) return;
      const snapshotItem = lastRenderSnapshot.items[i] || {
        text: '',
        value: '',
        dataValue: '',
        href: '',
        textMissing: false,
        valueMissing: false,
        dataMissing: false,
        hrefMissing: false
      };
      const snapshotValue = field === 'data' ? snapshotItem.dataValue : snapshotItem[field];
      const snapshotMissing = field === 'data' ? snapshotItem.dataMissing : snapshotItem[`${field}Missing`];
      const currentMissing = input.disabled;
      const currentValue = currentMissing ? '' : (input.value || '');
      const changed = isNewRow || currentMissing !== snapshotMissing || String(snapshotValue || '') !== String(currentValue || '');
      if (changed) anyChanged = true;
      input.parentElement.classList.toggle('changed', changed);
    });
  }

  const typeChanged = typeSelect.value !== lastRenderSnapshot.type;
  if (typeChanged) anyChanged = true;
  typeSelect.parentElement.classList.toggle('changed', typeChanged);

  const countChanged = String(countInput.value) !== String(lastRenderSnapshot.countValue);
  if (countChanged) anyChanged = true;
  countInput.parentElement.classList.toggle('changed', countChanged);

  const valueSourceChanged = valueModeSelect.value !== lastRenderSnapshot.valueSource;
  if (valueSourceChanged) anyChanged = true;
  valueModeSelect.parentElement.classList.toggle('changed', valueSourceChanged);

  renderButton.classList.toggle('changed', anyChanged);
}

countInput.addEventListener('change', () => {
  rebuildRows();
  bindHeaderActions();
  updateChangedState();
});
typeSelect.addEventListener('change', () => {
  updateTypeDisplay();
  updateTypeMenuSelection();
  updateNotesVisibility();
  updateChangedState();
});
valueModeSelect.addEventListener('change', updateChangedState);
renderButton.addEventListener('click', renderDropdown);
randomizeButton.addEventListener('click', fillRandomValues);
snapshotTextButton.addEventListener('click', () => {
  const snapshot = buildSnapshot();
  navigator.clipboard.writeText(buildSnapshotText(snapshot));
});

snapshotJsonButton.addEventListener('click', () => {
  const snapshot = buildSnapshot();
  navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
});

rebuildRows();
bindHeaderActions();
fillRandomValues();
buildTypeMenu();
updateTypeDisplay();
updateNotesVisibility();
renderDropdown();
enablePressedState();

if (typeTrigger && typeMenu) {
  typeTrigger.addEventListener('click', () => {
    setTypeMenuOpen(!typeMenu.classList.contains('open'));
  });

  document.addEventListener('click', (event) => {
    if (!typeTrigger.contains(event.target) && !typeMenu.contains(event.target)) {
      setTypeMenuOpen(false);
    }
  });
}
