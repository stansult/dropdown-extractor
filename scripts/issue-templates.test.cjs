const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateIssueForm,
  validateIssueTemplates,
  validateTemplateSource,
} = require('./issue-template-validator.cjs');

test('repository issue templates parse and satisfy the supported structure', () => {
  assert.deepEqual(validateIssueTemplates(), []);
});

test('validator rejects malformed YAML', () => {
  const errors = validateTemplateSource('name: [', 'broken.yml');
  assert.equal(errors.some(error => error.includes('invalid YAML')), true);
});

test('validator rejects duplicate field ids', () => {
  const errors = validateIssueForm({
    name: 'Example',
    description: 'Example form',
    body: [
      { type: 'input', id: 'summary', attributes: { label: 'Summary' } },
      { type: 'textarea', id: 'summary', attributes: { label: 'Details' } },
    ],
  }, 'duplicate.yml');
  assert.equal(errors.some(error => error.includes('duplicates summary')), true);
});

test('validator rejects invalid option and required-field structures', () => {
  const errors = validateIssueForm({
    name: 'Example',
    description: 'Example form',
    body: [
      {
        type: 'checkboxes',
        id: 'checks',
        attributes: { label: 'Checks', options: [{ label: '', required: 'yes' }] },
        validations: { required: 'yes' },
      },
    ],
  }, 'invalid-options.yml');
  assert.equal(errors.some(error => error.includes('label must be a non-empty string')), true);
  assert.equal(errors.some(error => error.includes('required must be boolean')), true);
  assert.equal(errors.some(error => error.includes('validations.required must be boolean')), true);
});
