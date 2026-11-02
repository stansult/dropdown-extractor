const trigger = document.getElementById('candidate-major_icimsDropdown');
const triggerText = document.getElementById('candidate-major_fakeSelected_icimsDropdown');
const container = document.getElementById('candidate-major_icimsDropdown_ctnr');
const search = container.querySelector('.dropdown-search');
const listbox = document.getElementById('candidate-major_dropdown-results');
const requestedOptionCount = Number(new URLSearchParams(window.location.search).get('options')) || 3;

for (let index = 3; index < requestedOptionCount; index += 1) {
  const option = document.createElement('li');
  option.id = `result-selectable_candidate-major_${index}`;
  option.className = 'dropdown-result result-selectable';
  option.setAttribute('role', 'option');
  option.setAttribute('dropdown-index', String(index));
  option.title = `Additional searchable category ${index}`;
  option.setAttribute('aria-label', option.title);
  option.textContent = option.title;
  listbox.append(option);
}

function setOpen(open) {
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  container.setAttribute('aria-expanded', open ? 'true' : 'false');
  container.classList.toggle('dropdown-invisible', !open);
}

document.addEventListener('mousedown', event => {
  const triggerClick = event.target === trigger || trigger.contains(event.target);
  if (triggerClick) {
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) search.focus();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (trigger.getAttribute('aria-expanded') === 'true' && !container.contains(event.target)) {
    setOpen(false);
  }
});

search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  listbox.querySelectorAll('[role="option"]').forEach(option => {
    option.hidden = !!query && !option.textContent.toLowerCase().includes(query);
  });
});

listbox.addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (!option) return;
  triggerText.textContent = option.textContent.trim();
  setOpen(false);
  event.preventDefault();
  event.stopPropagation();
});
