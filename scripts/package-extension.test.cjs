const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectPackage = require('../package.json');

const runtimeFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'icon16.png',
  'icon32.png',
  'icon48.png',
  'icon128.png',
];

function fixture(version = '1.0.15') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropdown-package-'));
  for (const directory of [
    'docs', 'tests', 'scripts', '.netlify', 'playwright-report', 'test-results', 'test',
  ]) {
    fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, directory, 'excluded.txt'), 'must not be packaged\n');
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'dropdown-package-test',
    private: true,
    scripts: {
      package: projectPackage.scripts.package,
      'package:patch': projectPackage.scripts['package:patch'],
    },
  }));
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify({
    manifest_version: 3,
    name: 'Dropdown Extractor',
    version,
  }, null, 2)}\n`);
  for (const file of runtimeFiles.slice(1)) {
    fs.writeFileSync(path.join(root, file), `fixture:${file}\n`);
  }
  for (const file of [
    'README.md', 'LICENSE', 'package-lock.json', 'playwright.config.cjs',
    'netlify.toml', 'icon.svg', 'icon-inline.svg',
  ]) {
    fs.writeFileSync(path.join(root, file), 'must not be packaged\n');
  }
  fs.writeFileSync(path.join(root, 'docs', 'description.txt'), 'Initial store description\n');
  return root;
}

function run(root, script) {
  execFileSync('npm', ['run', script, '--silent'], { cwd: root, stdio: 'pipe' });
}

function archiveEntries(archive) {
  return execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .sort();
}

function archivedFile(archive, file) {
  return execFileSync('unzip', ['-p', archive, file]);
}

test('package creates a ZIP containing exactly the extension runtime files', () => {
  const root = fixture();
  try {
    const originalManifest = fs.readFileSync(path.join(root, 'manifest.json'));
    run(root, 'package');
    const archive = path.join(root, 'dist', 'dropdown-extractor-1.0.15.zip');

    assert.equal(fs.existsSync(archive), true);
    assert.deepEqual(archiveEntries(archive), [...runtimeFiles].sort());
    assert.deepEqual(fs.readFileSync(path.join(root, 'manifest.json')), originalManifest);
    for (const file of runtimeFiles) {
      assert.deepEqual(archivedFile(archive, file), fs.readFileSync(path.join(root, file)));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package emits listing text only when the description changes', () => {
  const root = fixture();
  try {
    run(root, 'package');
    const pending = path.join(root, 'dist', 'description-to-upload.txt');
    const baseline = path.join(root, 'dist', '.description-last');
    assert.equal(fs.readFileSync(pending, 'utf8'), 'Initial store description\n');
    assert.equal(fs.readFileSync(baseline, 'utf8'), 'Initial store description\n');

    fs.rmSync(pending);
    run(root, 'package');
    assert.equal(fs.existsSync(pending), false);

    fs.writeFileSync(path.join(root, 'docs', 'description.txt'), 'Updated store description\n');
    run(root, 'package');
    assert.equal(fs.readFileSync(pending, 'utf8'), 'Updated store description\n');
    assert.equal(fs.readFileSync(baseline, 'utf8'), 'Updated store description\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package:patch increments the manifest patch version and names the ZIP accordingly', () => {
  const root = fixture();
  try {
    run(root, 'package:patch');
    const archive = path.join(root, 'dist', 'dropdown-extractor-1.0.16.zip');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version, '1.0.16');
    assert.equal(fs.existsSync(archive), true);
    assert.equal(JSON.parse(archivedFile(archive, 'manifest.json')).version, '1.0.16');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
