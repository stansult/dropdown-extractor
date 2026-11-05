const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPublished,
  parseUpdateResponse,
  pendingSubmissionVersion,
  submittedVersion,
} = require('./webstore-publication-check.cjs');

test('submission tags expose their version without treating publication tags as submissions', () => {
  assert.equal(submittedVersion('webstore-submitted-v1.0.17'), '1.0.17');
  assert.equal(submittedVersion('webstore-submitted-v1.0.17-r2'), '1.0.17');
  assert.equal(submittedVersion('webstore-v1.0.17'), null);
  assert.equal(submittedVersion('webstore-submitted-v1.0.17-r1'), null);
});

test('pending version is the newest submitted version without a publication tag', () => {
  assert.equal(pendingSubmissionVersion([
    'webstore-submitted-v1.0.16',
    'webstore-v1.0.16',
    'webstore-submitted-v1.0.17',
    'webstore-submitted-v1.0.17-r2',
    'webstore-submitted-v1.0.18',
    'unrelated-tag',
  ]), '1.0.18');
  assert.equal(pendingSubmissionVersion([
    'webstore-submitted-v1.0.17-r2',
    'webstore-v1.0.17',
  ]), null);
});

test('Google update response exposes the package version Chrome can install', () => {
  const xml = '<?xml version="1.0"?><gupdate><app status="ok">'
    + '<updatecheck version="1.0.17" codebase="https://example.invalid/extension.crx" status="ok"/>'
    + '</app></gupdate>';
  assert.equal(parseUpdateResponse(xml), '1.0.17');
  assert.throws(
    () => parseUpdateResponse('<gupdate><updatecheck status="noupdate"/></gupdate>'),
    /did not contain a live package version/
  );
});

test('publication requires the live package to reach the submitted version', () => {
  assert.equal(isPublished({ expectedVersion: '1.0.17', liveVersion: '1.0.16' }), false);
  assert.equal(isPublished({ expectedVersion: '1.0.17', liveVersion: '1.0.17' }), true);
  assert.equal(isPublished({ expectedVersion: '1.0.17', liveVersion: '1.0.18' }), true);
});
