const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const issueBodyTypes = new Set(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateIssueForm(form, filename) {
  const errors = [];
  const add = message => errors.push(`${filename}: ${message}`);

  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    add('top level must be a mapping');
    return errors;
  }
  if (!isNonEmptyString(form.name)) add('name must be a non-empty string');
  if (!isNonEmptyString(form.description)) add('description must be a non-empty string');
  if (!Array.isArray(form.body) || form.body.length === 0) {
    add('body must be a non-empty array');
    return errors;
  }

  const ids = new Set();
  form.body.forEach((item, index) => {
    const location = `body[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add(`${location} must be a mapping`);
      return;
    }
    if (!issueBodyTypes.has(item.type)) {
      add(`${location}.type must be one of ${[...issueBodyTypes].join(', ')}`);
      return;
    }
    if (!item.attributes || typeof item.attributes !== 'object' || Array.isArray(item.attributes)) {
      add(`${location}.attributes must be a mapping`);
      return;
    }

    if (item.type === 'markdown') {
      if (!isNonEmptyString(item.attributes.value)) {
        add(`${location}.attributes.value must be a non-empty string`);
      }
    } else {
      if (!isNonEmptyString(item.id)) {
        add(`${location}.id must be a non-empty string`);
      } else if (ids.has(item.id)) {
        add(`${location}.id duplicates ${item.id}`);
      } else {
        ids.add(item.id);
      }
      if (!isNonEmptyString(item.attributes.label)) {
        add(`${location}.attributes.label must be a non-empty string`);
      }
    }

    if (item.type === 'dropdown' || item.type === 'checkboxes') {
      const options = item.attributes.options;
      if (!Array.isArray(options) || options.length === 0) {
        add(`${location}.attributes.options must be a non-empty array`);
      } else if (item.type === 'checkboxes') {
        options.forEach((option, optionIndex) => {
          if (!option || typeof option !== 'object' || !isNonEmptyString(option.label)) {
            add(`${location}.attributes.options[${optionIndex}].label must be a non-empty string`);
          }
          if (option?.required !== undefined && typeof option.required !== 'boolean') {
            add(`${location}.attributes.options[${optionIndex}].required must be boolean`);
          }
        });
      } else {
        options.forEach((option, optionIndex) => {
          if (!isNonEmptyString(option)) {
            add(`${location}.attributes.options[${optionIndex}] must be a non-empty string`);
          }
        });
      }
    }

    if (item.validations?.required !== undefined && typeof item.validations.required !== 'boolean') {
      add(`${location}.validations.required must be boolean`);
    }
  });

  return errors;
}

function validateConfig(config, filename) {
  const errors = [];
  const add = message => errors.push(`${filename}: ${message}`);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    add('top level must be a mapping');
    return errors;
  }
  if (typeof config.blank_issues_enabled !== 'boolean') {
    add('blank_issues_enabled must be boolean');
  }
  if (config.contact_links !== undefined) {
    if (!Array.isArray(config.contact_links)) {
      add('contact_links must be an array');
    } else {
      config.contact_links.forEach((link, index) => {
        for (const field of ['name', 'url', 'about']) {
          if (!isNonEmptyString(link?.[field])) {
            add(`contact_links[${index}].${field} must be a non-empty string`);
          }
        }
      });
    }
  }
  return errors;
}

function validateTemplateSource(source, filename) {
  const document = YAML.parseDocument(source, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length > 0) {
    return document.errors.map(error => `${filename}: invalid YAML: ${error.message}`);
  }
  const value = document.toJS();
  return path.basename(filename) === 'config.yml'
    ? validateConfig(value, filename)
    : validateIssueForm(value, filename);
}

function validateIssueTemplates(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, '.github', 'ISSUE_TEMPLATE');
  const filenames = fs.readdirSync(directory)
    .filter(filename => /\.ya?ml$/i.test(filename))
    .sort();
  if (filenames.length === 0) return [`${directory}: no YAML templates found`];
  return filenames.flatMap(filename => {
    const fullPath = path.join(directory, filename);
    return validateTemplateSource(fs.readFileSync(fullPath, 'utf8'), filename);
  });
}

if (require.main === module) {
  const errors = validateIssueTemplates();
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('GitHub issue templates are valid.');
  }
}

module.exports = { validateIssueForm, validateIssueTemplates, validateTemplateSource };
