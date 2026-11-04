const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const tagPrefix = 'webstore-v';
const submissionTagPrefix = 'webstore-submitted-v';
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

function submittedTag(version) {
  return `${submissionTagPrefix}${version}`;
}

function submissionAttempt(tag, version) {
  const original = submittedTag(version);
  if (tag === original) return 1;
  if (!tag.startsWith(`${original}-r`)) {
    throw new Error(`Invalid submission marker for ${version}: ${tag}`);
  }
  const suffix = tag.slice(`${original}-r`.length);
  if (!/^[2-9]\d*$/.test(suffix)) {
    throw new Error(`Invalid submission marker for ${version}: ${tag}`);
  }
  return Number(suffix);
}

function submissionTags(git, version) {
  return git.output(['tag', '--list', `${submittedTag(version)}*`])
    .split('\n')
    .filter(Boolean)
    .map(tag => ({ tag, attempt: submissionAttempt(tag, version) }))
    .sort((left, right) => right.attempt - left.attempt);
}

function latestSubmissionTag(git, version) {
  return submissionTags(git, version)[0]?.tag || null;
}

function commitVersion(git, commit) {
  let manifest;
  try {
    manifest = JSON.parse(git.output(['show', `${commit}:manifest.json`]));
  } catch {
    throw new Error(`Could not read manifest.json from ${commit}.`);
  }
  return manifest.version;
}

function recordSubmission({ git, version, commit, checksum }) {
  parseVersion(version);
  if (git.output(['status', '--porcelain'])) throw new Error('Working tree must be clean.');
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('ZIP checksum must be a SHA-256 hash.');
  if (git.status(['merge-base', '--is-ancestor', commit, 'origin/main']) !== 0) {
    throw new Error('Submitted commit must be contained in origin/main.');
  }
  if (commitVersion(git, commit) !== version) {
    throw new Error(`Submitted commit manifest does not have version ${version}.`);
  }

  const tag = submittedTag(version);
  const tagStatus = git.status(['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]);
  if (tagStatus === 0) throw new Error(`Tag already exists: ${tag}`);
  if (tagStatus !== 1) throw new Error(`Could not check tag: ${tag}`);

  const message = `Chrome Web Store submission ${version}\n\nZIP SHA-256: ${checksum}`;
  git.run(['tag', '-a', tag, commit, '-m', message]);
  git.run(['push', 'origin', `refs/tags/${tag}`]);
  return { version, tag, commit, checksum };
}

function recordResubmission({ git, version, commit, checksum }) {
  parseVersion(version);
  if (git.output(['status', '--porcelain'])) throw new Error('Working tree must be clean.');
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('ZIP checksum must be a SHA-256 hash.');
  if (git.status(['merge-base', '--is-ancestor', commit, 'origin/main']) !== 0) {
    throw new Error('Resubmitted commit must be contained in origin/main.');
  }
  if (commitVersion(git, commit) !== version) {
    throw new Error(`Resubmitted commit manifest does not have version ${version}.`);
  }

  const original = submittedTag(version);
  const originalStatus = git.status(['show-ref', '--verify', '--quiet', `refs/tags/${original}`]);
  if (originalStatus === 1) throw new Error(`Original submission tag does not exist: ${original}`);
  if (originalStatus !== 0) throw new Error(`Could not check tag: ${original}`);
  if (git.output(['cat-file', '-t', original]) !== 'tag') {
    throw new Error(`Original submission marker must be an annotated tag: ${original}`);
  }
  const originalMessage = git.output([
    'for-each-ref', '--format=%(contents)', `refs/tags/${original}`,
  ]);
  const originalChecksum = originalMessage.match(/ZIP SHA-256: ([a-f0-9]{64})/)?.[1];
  if (!originalChecksum) {
    throw new Error(`Original submission marker does not contain a ZIP checksum: ${original}`);
  }
  if (checksum !== originalChecksum) {
    throw new Error('Resubmission ZIP checksum must match the original submission.');
  }

  const attempts = submissionTags(git, version);
  const attempt = Math.max(1, ...attempts.map(candidate => candidate.attempt)) + 1;
  const tag = `${original}-r${attempt}`;
  const message = `Chrome Web Store resubmission ${version} (attempt ${attempt})\n\n`
    + `Original submission: ${original}\nZIP SHA-256: ${checksum}`;
  git.run(['tag', '-a', tag, commit, '-m', message]);
  git.run(['push', 'origin', `refs/tags/${tag}`]);
  return { version, tag, commit, checksum, attempt, original };
}

function recordRelease({ git, version }) {
  parseVersion(version);
  if (git.output(['status', '--porcelain'])) throw new Error('Working tree must be clean.');

  const submission = latestSubmissionTag(git, version);
  if (!submission) throw new Error(`Submission tag does not exist: ${submittedTag(version)}`);
  if (git.output(['cat-file', '-t', submission]) !== 'tag') {
    throw new Error(`Submission marker must be an annotated tag: ${submission}`);
  }
  const commit = git.output(['rev-parse', `${submission}^{commit}`]);
  if (git.status(['merge-base', '--is-ancestor', commit, 'origin/main']) !== 0) {
    throw new Error('Submitted commit must be contained in origin/main.');
  }
  if (commitVersion(git, commit) !== version) {
    throw new Error(`Submitted commit manifest does not have version ${version}.`);
  }

  const tag = `${tagPrefix}${version}`;
  const tagStatus = git.status(['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]);
  if (tagStatus === 0) throw new Error(`Tag already exists: ${tag}`);
  if (tagStatus !== 1) throw new Error(`Could not check tag: ${tag}`);

  const previous = latestReleaseTag(git);
  if (previous && compareVersions(version, previous.slice(tagPrefix.length)) <= 0) {
    throw new Error(`Version ${version} must be newer than ${previous.slice(tagPrefix.length)}.`);
  }

  git.run(['tag', '-a', tag, commit, '-m', `Chrome Web Store ${version}`]);
  git.run(['push', 'origin', `refs/tags/${tag}`]);
  return { version, tag, commit, submission };
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
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
    const version = process.argv[3] || manifestVersion();
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
    } else if (command === 'submit') {
      const commit = process.argv[4] || git.output(['rev-parse', 'HEAD']);
      const archive = process.argv[5] || `dist/dropdown-extractor-${version}.zip`;
      const result = recordSubmission({ git, version, commit, checksum: sha256(archive) });
      console.log(`Recorded ${result.tag} at ${result.commit} and pushed it to origin.`);
      console.log(`ZIP SHA-256: ${result.checksum}`);
    } else if (command === 'resubmit') {
      const commit = process.argv[4] || git.output(['rev-parse', 'HEAD']);
      const archive = process.argv[5] || `dist/dropdown-extractor-${version}.zip`;
      const result = recordResubmission({ git, version, commit, checksum: sha256(archive) });
      console.log(`Recorded ${result.tag} at ${result.commit} and pushed it to origin.`);
      console.log(`ZIP SHA-256: ${result.checksum}`);
    } else if (command === 'record') {
      const result = recordRelease({ git, version });
      console.log(`Recorded ${result.tag} at ${result.commit} and pushed it to origin.`);
    } else {
      throw new Error('Usage: release-bookkeeping.cjs <status|submit|resubmit|record> [version] [commit] [archive]');
    }
  } catch (error) {
    console.error(`Release bookkeeping failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  compareVersions,
  latestSubmissionTag,
  latestReleaseTag,
  recordRelease,
  recordResubmission,
  recordSubmission,
  releaseStatus,
  submittedTag,
};
