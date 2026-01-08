const typeSelect = document.getElementById('type');
const countInput = document.getElementById('count');
const renderButton = document.getElementById('render');
const randomizeButton = document.getElementById('randomize');
const itemsBody = document.getElementById('items');
const dropdownContainer = document.getElementById('dropdown');
const dropdownType = document.getElementById('dropdown-type');
const dropdownPanel = document.querySelector('.dropdown-panel');

function pulsePanel() {
  dropdownPanel.classList.remove('pulse');
  requestAnimationFrame(() => {
    dropdownPanel.classList.add('pulse');
    setTimeout(() => dropdownPanel.classList.remove('pulse'), 600);
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
  });

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
}

function bindHeaderActions() {
  document.querySelectorAll('.icon-button').forEach(button => {
    button.addEventListener('click', () => {
      const field = button.dataset.field;
      const action = button.dataset.action;
      if (action === 'clear') clearColumn(field);
      if (action === 'missing') toggleColumnMissing(field);
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
      dataValue: dataInput.disabled ? '' : (dataInput.value || '')
    });
  }
  return items;
}

function renderDropdown() {
  dropdownContainer.innerHTML = '';
  const items = readItems();
  const type = typeSelect.value;
  dropdownType.textContent = `Type: ${typeSelect.options[typeSelect.selectedIndex].textContent}`;

  if (type === 'native') {
    const select = document.createElement('select');
    select.style.width = '100%';
    items.forEach(item => {
      const option = document.createElement('option');
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      select.appendChild(option);
    });
    dropdownContainer.appendChild(select);
    pulsePanel();
    return;
  }

  if (type === 'aria') {
    const listbox = document.createElement('div');
    listbox.className = 'mock-listbox';
    listbox.setAttribute('role', 'listbox');
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'mock-option';
      option.setAttribute('role', 'option');
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      listbox.appendChild(option);
    });
    dropdownContainer.appendChild(listbox);
    pulsePanel();
    return;
  }

  if (type === 'selectize') {
    const content = document.createElement('div');
    content.className = 'selectize-dropdown-content';
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'option';
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      content.appendChild(option);
    });
    dropdownContainer.appendChild(content);
    pulsePanel();
    return;
  }

  if (type === 'react') {
    const reactMenu = document.createElement('div');
    reactMenu.className = 'react-select__menu-list';
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'react-select__option';
      option.id = `react-select-mock-option-${index}`;
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      reactMenu.appendChild(option);
    });
    dropdownContainer.appendChild(reactMenu);
    pulsePanel();
    return;
  }

  if (type === 'downshift') {
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
      if (item.value) button.value = item.value;
      if (item.dataValue) button.dataset.value = item.dataValue;
      li.appendChild(button);
      listbox.appendChild(li);
    });
    dropdownContainer.appendChild(listbox);
    pulsePanel();
    return;
  }

  if (type === 'mui') {
    const listbox = document.createElement('ul');
    listbox.className = 'mui-listbox';
    listbox.setAttribute('role', 'listbox');
    items.forEach(item => {
      const option = document.createElement('li');
      option.className = 'mui-option';
      option.setAttribute('role', 'option');
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      listbox.appendChild(option);
    });
    dropdownContainer.appendChild(listbox);
    pulsePanel();
    return;
  }

  if (type === 'antd') {
    const list = document.createElement('div');
    list.className = 'ant-select-dropdown';
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'ant-option ant-select-item-option';
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      list.appendChild(option);
    });
    dropdownContainer.appendChild(list);
    pulsePanel();
    return;
  }

  if (type === 'select2') {
    const list = document.createElement('ul');
    list.className = 'select2-results__options';
    items.forEach(item => {
      const option = document.createElement('li');
      option.className = 'select2-results__option';
      option.textContent = item.text;
      if (item.value) option.value = item.value;
      if (item.dataValue) option.dataset.value = item.dataValue;
      list.appendChild(option);
    });
    dropdownContainer.appendChild(list);
    pulsePanel();
    return;
  }

  const list = document.createElement('ul');
  list.className = 'chosen-results';
  items.forEach(item => {
    const option = document.createElement('li');
    option.className = 'chosen-option';
    option.textContent = item.text;
    if (item.value) option.value = item.value;
    if (item.dataValue) option.dataset.value = item.dataValue;
    list.appendChild(option);
  });
  dropdownContainer.appendChild(list);
  pulsePanel();
}

function fillRandomValues() {
  const inputs = [...document.querySelectorAll('input[type="text"]')];
  inputs.forEach(input => {
    if (input.disabled) return;
    input.value = randomPhrase();
  });
}

countInput.addEventListener('change', () => {
  rebuildRows();
  bindHeaderActions();
});
renderButton.addEventListener('click', renderDropdown);
randomizeButton.addEventListener('click', fillRandomValues);

rebuildRows();
bindHeaderActions();
fillRandomValues();
renderDropdown();
