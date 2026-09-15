const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const tagPrefix = 'webstore-v';
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
const listingFiles = ['docs/description.txt'];

function parseVersion(version) {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error(`Invalid Chrome version: ${version}`);
  if (version.split('.').some(part => part.length > 1 && part.startsWith('0'))) {
    throw new Error(`Invalid Chrome version: ${version}`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535)) throw new Error(`Invalid Chrome version: ${version}`);
  return [...parts, 0, 0, 0].slice(0, 4);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function latestReleaseTag(git) {
  const tags = git.output(['tag', '--list', `${tagPrefix}*`]).split('\n').filter(Boolean);
  for (const tag of tags) parseVersion(tag.slice(tagPrefix.length));
  return tags.sort((left, right) => (
    compareVersions(right.slice(tagPrefix.length), left.slice(tagPrefix.length))
  ))[0] || null;
}

function diffChanged(git, tag, paths) {
  const status = git.status(['diff', '--quiet', tag, 'HEAD', '--', ...paths]);
  if (status === 0) return false;
  if (status === 1) return true;
  throw new Error(`Could not compare ${tag} with HEAD`);
}

function releaseStatus({ git, version }) {
  parseVersion(version);
  const tag = latestReleaseTag(git);
  if (!tag) return { version, tag: null };
  return {
    version,
    tag,
    tagVersion: tag.slice(tagPrefix.length),
    runtimeChanged: diffChanged(git, tag, runtimeFiles),
    listingChanged: diffChanged(git, tag, listingFiles),
  };
}

function recordRelease({ git, version }) {
  parseVersion(version);
  if (git.output(['status', '--porcelain'])) throw new Error('Working tree must be clean.');
  if (git.output(['branch', '--show-current']) !== 'main') throw new Error('Release must be recorded from main.');

  const head = git.output(['rev-parse', 'HEAD']);
  const remoteHead = git.output(['rev-parse', 'origin/main']);
  if (head !== remoteHead) throw new Error('HEAD must match origin/main.');

  const tag = `${tagPrefix}${version}`;
  const tagStatus = git.status(['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]);
  if (tagStatus === 0) throw new Error(`Tag already exists: ${tag}`);
  if (tagStatus !== 1) throw new Error(`Could not check tag: ${tag}`);

  const previous = latestReleaseTag(git);
  if (previous && compareVersions(version, previous.slice(tagPrefix.length)) <= 0) {
    throw new Error(`Version ${version} must be newer than ${previous.slice(tagPrefix.length)}.`);
  }

  git.run(['tag', '-a', tag, '-m', `Chrome Web Store ${version}`]);
  git.run(['push', 'origin', `refs/tags/${tag}`]);
  return { version, tag, head };
}

function createGit() {
  function execute(args) {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    return result;
  }
  return {
    output(args) {
      const result = execute(args);
      if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
      return result.stdout.trim();
    },
    status(args) {
      return execute(args).status;
    },
    run(args) {
      const result = execute(args);
      if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
    },
  };
}

function manifestVersion() {
  return JSON.parse(readFileSync('manifest.json', 'utf8')).version;
}

if (require.main === module) {
  try {
    const command = process.argv[2];
    const git = createGit();
    const version = manifestVersion();
    if (command === 'status') {
      const result = releaseStatus({ git, version });
      if (!result.tag) {
        console.log(`No Chrome Web Store release tag recorded. Current manifest: ${version}.`);
      } else {
        console.log(`Recorded release: ${result.tag}`);
        console.log(`Current manifest: ${version}`);
        console.log(`Runtime files: ${result.runtimeChanged ? 'changed' : 'unchanged'}`);
        console.log(`Store description: ${result.listingChanged ? 'changed' : 'unchanged'}`);
      }
    } else if (command === 'record') {
      const result = recordRelease({ git, version });
      console.log(`Recorded ${result.tag} at ${result.head} and pushed it to origin.`);
    } else {
      throw new Error('Usage: release-bookkeeping.cjs <status|record>');
    }
  } catch (error) {
    console.error(`Release bookkeeping failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { compareVersions, latestReleaseTag, recordRelease, releaseStatus };
