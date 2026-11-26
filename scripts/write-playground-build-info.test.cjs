const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBuildInfo, writeBuildInfo } = require('./write-playground-build-info.cjs');

test('writes deterministic Playground deployment metadata', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dropdown-playground-build-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'build-info.json');
  const input = {
    commit: 'c269461c9c07c47c8cf3229b9863c78d20907581',
    deployedAt: new Date('2026-11-23T12:34:56.000Z'),
  };

  assert.deepEqual(writeBuildInfo(outputPath, input), {
    commit: input.commit,
    deployedAt: '2026-11-23T12:34:56.000Z',
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), {
    commit: input.commit,
    deployedAt: '2026-11-23T12:34:56.000Z',
  });
});

test('rejects invalid deployment metadata', () => {
  assert.throws(
    () => createBuildInfo({ commit: 'not-a-commit', deployedAt: new Date() }),
    /40-character hexadecimal/,
  );
  assert.throws(
    () => createBuildInfo({ commit: 'a'.repeat(40), deployedAt: 'not-a-date' }),
    /valid date/,
  );
});
