const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');

function readWorkflow(filename) {
  const fullPath = path.resolve(__dirname, '..', '.github', 'workflows', filename);
  return YAML.parse(fs.readFileSync(fullPath, 'utf8'));
}

const documentationPaths = ['**/*.md', '.github/ISSUE_TEMPLATE/**'];

test('product workflow ignores documentation-only changes', () => {
  const workflow = readWorkflow('playwright.yml');
  assert.deepEqual(workflow.on.push['paths-ignore'], documentationPaths);
  assert.deepEqual(workflow.on.pull_request['paths-ignore'], documentationPaths);
});

test('documentation workflow covers Markdown and issue-template changes', () => {
  const workflow = readWorkflow('documentation.yml');
  assert.deepEqual(workflow.on.push.paths, documentationPaths);
  assert.deepEqual(workflow.on.pull_request.paths, documentationPaths);
  const steps = workflow.jobs.validate.steps;
  assert.equal(steps.some(step => step.run === 'npm run test:issue-templates'), true);
});
