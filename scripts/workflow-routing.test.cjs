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

test('Web Store publication workflow polls every six hours and notifies marked issues', () => {
  const workflow = readWorkflow('webstore-publication.yml');
  assert.deepEqual(workflow.on.schedule, [{ cron: '23 */6 * * *' }]);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.issues, 'write');
  const steps = workflow.jobs.check.steps;
  assert.equal(steps.some(step => step.run === 'node scripts/webstore-publication-check.cjs'), true);
  const notification = steps.find(step => step.name === 'Notify issues awaiting live verification');
  assert.equal(notification.if, "steps.publication.outputs.published == 'true'");
  assert.match(notification.with.script, /release: verify-live/);
  assert.match(notification.with.script, /webstore-live:/);
});
