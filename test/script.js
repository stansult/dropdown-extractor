const typeSelect = document.getElementById('type');
const countInput = document.getElementById('count');
const renderButton = document.getElementById('render');
const snapshotTextButton = document.getElementById('snapshot-text');
const snapshotJsonButton = document.getElementById('snapshot-json');
const randomizeButton = document.getElementById('randomize');
const itemsBody = document.getElementById('items');
const dropdownContainer = document.getElementById('dropdown');
const dropdownType = document.getElementById('dropdown-type');
const dropdownPanel = document.querySelector('.dropdown-panel');
const valueModeSelect = document.getElementById('value-mode');

let lastRenderSnapshot = null;

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

function wireSelection(menuWrapper, listEl, trigger) {
  listEl.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"], [role="listitem"], .option, .react-select__option, .react-select-variant-option, .mui-option, .ant-option, .select2-results__option, .chosen-option, .downshift-option, .mock-option');
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

function createCell(field, index, initial) {
  const cell = document.createElement('td');
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

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'cell-button';
  clear.textContent = '🗑';
  clear.title = 'Clear value';
  clear.addEventListener('click', () => {
    input.value = '';
    updateChangedState();
  });

  const missing = document.createElement('button');
  missing.type = 'button';
  missing.className = 'cell-button danger';
  missing.textContent = '✕';
  missing.title = 'Toggle missing';
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
    existing[index] = {
      text: { value: textInput?.value || '', missing: !!textInput?.disabled },
      value: { value: valueInput?.value || '', missing: !!valueInput?.disabled },
      data: { value: dataInput?.value || '', missing: !!dataInput?.disabled }
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
  const prefixRe = /^(\d+)(?:\.\s*)?/;
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
    input.value = `${count}. ${current}`.trim();
    count += 1;
  });
  updateChangedState();
}

function bindHeaderActions() {
  document.querySelectorAll('.icon-button').forEach(button => {
    button.addEventListener('click', () => {
      const field = button.dataset.field;
      const action = button.dataset.action;
      if (action === 'clear') clearColumn(field);
      if (action === 'missing') toggleColumnMissing(field);
      if (action === 'number') numberColumn(field);
    });
  });
}

function readItems() {
  const count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const textInput = document.getElementById(`text-${i}`);
    const valueInput = document.getElementById(`value-${i}`);
    const dataInput = document.getElementById(`data-${i}`);

    items.push({
      text: textInput.disabled ? '' : (textInput.value || ''),
      value: valueInput.disabled ? '' : (valueInput.value || ''),
      dataValue: dataInput.disabled ? '' : (dataInput.value || ''),
      textMissing: !!textInput.disabled,
      valueMissing: !!valueInput.disabled,
      dataMissing: !!dataInput.disabled
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
  return [
    `type: ${snapshot.typeLabel}`,
    `value source: ${snapshot.valueSource}`,
    `items: ${snapshot.count}`,
    `missing text/value/data: ${missingText}/${missingValue}/${missingData}`,
    '',
    ...snapshot.items.map((item, index) => (
      `${index + 1}. text="${item.text}" value="${item.value}" data-value="${item.dataValue}" (missing: ${item.textMissing}/${item.valueMissing}/${item.dataMissing})`
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

function renderDropdown() {
  dropdownContainer.innerHTML = '';
  const items = readItems();
  const type = typeSelect.value;
  dropdownType.textContent = `Type: ${typeSelect.options[typeSelect.selectedIndex].textContent}`;
  lastRenderSnapshot = buildSnapshot();
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
    input.value = randomPhrase();
  });
  updateChangedState();
}

function updateChangedState() {
  if (!lastRenderSnapshot) return;
  const count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
  for (let i = 0; i < count; i += 1) {
    const isNewRow = i >= Number(lastRenderSnapshot.count || 0);
    ['text', 'value', 'data'].forEach(field => {
      const input = document.getElementById(`${field}-${i}`);
      if (!input) return;
      const snapshotItem = lastRenderSnapshot.items[i] || { text: '', value: '', dataValue: '', textMissing: false, valueMissing: false, dataMissing: false };
      const snapshotValue = field === 'data' ? snapshotItem.dataValue : snapshotItem[field];
      const snapshotMissing = field === 'data' ? snapshotItem.dataMissing : snapshotItem[`${field}Missing`];
      const currentMissing = input.disabled;
      const currentValue = currentMissing ? '' : (input.value || '');
      const changed = isNewRow || currentMissing !== snapshotMissing || String(snapshotValue || '') !== String(currentValue || '');
      input.parentElement.classList.toggle('changed', changed);
    });
  }

  const typeChanged = typeSelect.value !== lastRenderSnapshot.type;
  typeSelect.parentElement.classList.toggle('changed', typeChanged);

  const countChanged = String(countInput.value) !== String(lastRenderSnapshot.countValue);
  countInput.parentElement.classList.toggle('changed', countChanged);

  const valueSourceChanged = valueModeSelect.value !== lastRenderSnapshot.valueSource;
  valueModeSelect.parentElement.classList.toggle('changed', valueSourceChanged);
}

countInput.addEventListener('change', () => {
  rebuildRows();
  bindHeaderActions();
  updateChangedState();
});
typeSelect.addEventListener('change', updateChangedState);
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
renderDropdown();
enablePressedState();
