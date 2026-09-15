const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  compareVersions,
  recordRelease,
  recordSubmission,
  releaseStatus,
} = require('./release-bookkeeping.cjs');

function fakeGit({
  dirty = false,
  branch = 'main',
  head = 'abc',
  remoteHead = 'abc',
  tags = '',
  diffs = {},
  tagExists = false,
  submissionExists = true,
  submittedCommit = 'abc',
  manifestVersion = '1.0.15',
  ancestor = true,
  submissionType = 'tag',
  pushFails = false,
} = {}) {
  const runs = [];
  return {
    runs,
    output(args) {
      if (args[0] === 'status') return dirty ? ' M content.js' : '';
      if (args[0] === 'branch') return branch;
      if (args[0] === 'rev-parse') {
        if (args[1] === 'HEAD') return head;
        if (args[1] === 'origin/main') return remoteHead;
        if (args[1].endsWith('^{commit}')) return submittedCommit;
      }
      if (args[0] === 'show') return JSON.stringify({ version: manifestVersion });
      if (args[0] === 'cat-file') return submissionType;
      if (args[0] === 'tag') return tags;
      throw new Error(`Unexpected output call: ${args.join(' ')}`);
    },
    status(args) {
      if (args[0] === 'show-ref') {
        if (args.at(-1).includes('webstore-submitted-v')) return submissionExists ? 0 : 1;
        return tagExists ? 0 : 1;
      }
      if (args[0] === 'merge-base') return ancestor ? 0 : 1;
      if (args[0] === 'diff') {
        const paths = args.slice(args.indexOf('--') + 1);
        return paths.some(path => diffs[path]) ? 1 : 0;
      }
      throw new Error(`Unexpected status call: ${args.join(' ')}`);
    },
    run(args) {
      runs.push(args);
      if (pushFails && args[0] === 'push') throw new Error('push failed');
    },
  };
}

test('Chrome versions compare numerically and accept one to four parts', () => {
  assert.equal(compareVersions('1.0.15', '1.0.14') > 0, true);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.10', '1.9.9') > 0, true);
  assert.equal(compareVersions('1.2.3.4', '1.2.3.3') > 0, true);
  assert.throws(() => compareVersions('1.2.beta', '1.2.0'), /Invalid Chrome version/);
  assert.throws(() => compareVersions('1.02', '1.2'), /Invalid Chrome version/);
  assert.throws(() => compareVersions('1.2.3.4.5', '1.2.3.4'), /Invalid Chrome version/);
  assert.throws(() => compareVersions('65536', '1'), /Invalid Chrome version/);
});

test('status reports no baseline when no release tag exists', () => {
  assert.deepEqual(releaseStatus({ git: fakeGit(), version: '1.0.15' }), {
    version: '1.0.15',
    tag: null,
  });
});

test('status uses the numerically highest tag and separates runtime and listing changes', () => {
  const git = fakeGit({
    tags: 'webstore-v1.0.9\nwebstore-v1.0.14',
    diffs: { 'options.js': true },
  });
  assert.deepEqual(releaseStatus({ git, version: '1.0.15' }), {
    version: '1.0.15',
    tag: 'webstore-v1.0.14',
    tagVersion: '1.0.14',
    runtimeChanged: true,
    listingChanged: false,
  });

  const listingGit = fakeGit({
    tags: 'webstore-v1.0.14',
    diffs: { 'docs/description.txt': true },
  });
  assert.equal(releaseStatus({ git: listingGit, version: '1.0.15' }).listingChanged, true);
});

test('record creates and pushes an annotated version tag', () => {
  const git = fakeGit({ tags: 'webstore-v1.0.14' });
  assert.deepEqual(recordRelease({ git, version: '1.0.15' }), {
    version: '1.0.15',
    tag: 'webstore-v1.0.15',
    commit: 'abc',
    submission: 'webstore-submitted-v1.0.15',
  });
  assert.deepEqual(git.runs, [
    ['tag', '-a', 'webstore-v1.0.15', 'abc', '-m', 'Chrome Web Store 1.0.15'],
    ['push', 'origin', 'refs/tags/webstore-v1.0.15'],
  ]);
});

for (const [name, options, message] of [
  ['dirty tree', { dirty: true }, /clean/],
  ['missing submission tag', { submissionExists: false }, /Submission tag does not exist/],
  ['lightweight submission tag', { submissionType: 'commit' }, /annotated tag/],
  ['submission outside main', { ancestor: false }, /contained in origin\/main/],
  ['wrong submitted manifest version', { manifestVersion: '1.0.14' }, /does not have version/],
  ['existing version tag', { tagExists: true }, /already exists/],
  ['non-incremented version', { tags: 'webstore-v1.0.15' }, /newer/],
  ['version older than the highest tag', { tags: 'webstore-v1.0.9\nwebstore-v1.1.0' }, /newer/],
]) {
  test(`record rejects ${name}`, () => {
    assert.throws(() => recordRelease({ git: fakeGit(options), version: '1.0.15' }), message);
  });
}

test('a failed push leaves an explicit local tag command in the attempted operations', () => {
  const git = fakeGit({ tags: 'webstore-v1.0.14', pushFails: true });
  assert.throws(() => recordRelease({ git, version: '1.0.15' }), /push failed/);
  assert.deepEqual(git.runs, [
    ['tag', '-a', 'webstore-v1.0.15', 'abc', '-m', 'Chrome Web Store 1.0.15'],
    ['push', 'origin', 'refs/tags/webstore-v1.0.15'],
  ]);
});

test('submit records the commit and ZIP checksum in an annotated tag', () => {
  const git = fakeGit({ submissionExists: false });
  const checksum = 'a'.repeat(64);
  assert.deepEqual(recordSubmission({ git, version: '1.0.15', commit: 'abc', checksum }), {
    version: '1.0.15', tag: 'webstore-submitted-v1.0.15', commit: 'abc', checksum,
  });
  assert.deepEqual(git.runs, [
    ['tag', '-a', 'webstore-submitted-v1.0.15', 'abc', '-m',
      `Chrome Web Store submission 1.0.15\n\nZIP SHA-256: ${checksum}`],
    ['push', 'origin', 'refs/tags/webstore-submitted-v1.0.15'],
  ]);
});

for (const [name, options, checksum, message] of [
  ['dirty tree', { dirty: true, submissionExists: false }, 'a'.repeat(64), /clean/],
  ['invalid checksum', { submissionExists: false }, 'not-a-hash', /SHA-256/],
  ['commit outside main', { submissionExists: false, ancestor: false }, 'a'.repeat(64), /contained in origin\/main/],
  ['wrong manifest version', { submissionExists: false, manifestVersion: '1.0.14' }, 'a'.repeat(64), /does not have version/],
  ['existing submission tag', {}, 'a'.repeat(64), /already exists/],
]) {
  test(`submit rejects ${name}`, () => {
    assert.throws(
      () => recordSubmission({ git: fakeGit(options), version: '1.0.15', commit: 'abc', checksum }),
      message
    );
  });
}

test('record creates an annotated tag in a real isolated remote repository', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'dropdown-release-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git');
  const worktree = join(root, 'worktree');
  mkdirSync(worktree);

  const run = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  run(root, ['init', '--bare', remote]);
  run(worktree, ['init', '-b', 'main']);
  run(worktree, ['config', 'user.name', 'Release Test']);
  run(worktree, ['config', 'user.email', 'release-test@example.invalid']);
  writeFileSync(join(worktree, 'manifest.json'), '{"version":"1.0.15"}\n');
  run(worktree, ['add', 'manifest.json']);
  run(worktree, ['commit', '-m', 'release candidate']);
  const submittedCommit = run(worktree, ['rev-parse', 'HEAD']);
  run(worktree, ['remote', 'add', 'origin', remote]);
  run(worktree, ['push', '-u', 'origin', 'main']);

  function execute(args) {
    return spawnSync('git', args, { cwd: worktree, encoding: 'utf8' });
  }
  const git = {
    output(args) {
      const result = execute(args);
      if (result.status !== 0) throw new Error(result.stderr.trim());
      return result.stdout.trim();
    },
    status(args) {
      return execute(args).status;
    },
    run(args) {
      const result = execute(args);
      if (result.status !== 0) throw new Error(result.stderr.trim());
    },
  };

  run(worktree, ['tag', '-a', 'webstore-submitted-v1.0.15', '-m', 'submitted']);
  run(worktree, ['push', 'origin', 'refs/tags/webstore-submitted-v1.0.15']);
  writeFileSync(join(worktree, 'later.txt'), 'post-submission work\n');
  run(worktree, ['add', 'later.txt']);
  run(worktree, ['commit', '-m', 'continue development']);
  run(worktree, ['push']);
  const result = recordRelease({ git, version: '1.0.15' });
  assert.equal(result.tag, 'webstore-v1.0.15');
  assert.equal(run(remote, ['tag', '--list', 'webstore-v1.0.15']), 'webstore-v1.0.15');
  assert.equal(run(worktree, ['cat-file', '-t', 'webstore-v1.0.15']), 'tag');
  assert.equal(run(worktree, ['rev-list', '-n', '1', 'webstore-v1.0.15']), submittedCommit);
  assert.notEqual(run(worktree, ['rev-parse', 'HEAD']), submittedCommit);
});
