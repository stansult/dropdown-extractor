const https = require('node:https');
const { spawnSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const { compareVersions } = require('./release-bookkeeping.cjs');

const extensionId = 'gbocefdbkfckcdbdhmaipklcfhgmeghm';
const updateUrl = 'https://clients2.google.com/service/update2/crx';

function submittedVersion(tag) {
  return tag.match(/^webstore-submitted-v(\d+(?:\.\d+){0,3})(?:-r[2-9]\d*)?$/)?.[1] || null;
}

function releasedVersion(tag) {
  return tag.match(/^webstore-v(\d+(?:\.\d+){0,3})$/)?.[1] || null;
}

function pendingSubmissionVersion(tags) {
  const submitted = new Set(tags.map(submittedVersion).filter(Boolean));
  const released = new Set(tags.map(releasedVersion).filter(Boolean));
  return [...submitted]
    .filter(version => !released.has(version))
    .sort((left, right) => compareVersions(right, left))[0] || null;
}

function parseUpdateResponse(xml) {
  const update = xml.match(/<updatecheck\b[^>]*>/)?.[0];
  const status = update?.match(/\bstatus="([^"]+)"/)?.[1];
  const version = status === 'ok' ? update.match(/\bversion="([^"]+)"/)?.[1] : null;
  if (!version) throw new Error('Google update response did not contain a live package version.');
  compareVersions(version, version);
  return version;
}

function isPublished({ expectedVersion, liveVersion }) {
  return compareVersions(liveVersion, expectedVersion) >= 0;
}

function fetchLiveVersion(get = https.get) {
  const query = new URLSearchParams({
    response: 'updatecheck',
    prodversion: '142.0',
    acceptformat: 'crx2,crx3',
    x: `id=${extensionId}&uc`,
  });
  const url = `${updateUrl}?${query}`;
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'user-agent': 'dropdown-extractor-release-check' } }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Google update endpoint returned HTTP ${response.statusCode}.`));
        return;
      }
      response.setEncoding('utf8');
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(parseUpdateResponse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

function gitTags() {
  const result = spawnSync('git', ['tag', '--list', 'webstore*'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Could not read release tags.');
  return result.stdout.trim().split('\n').filter(Boolean);
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const expectedVersion = process.argv[2] || pendingSubmissionVersion(gitTags());
  if (!expectedVersion) {
    console.log('No submitted Web Store version is awaiting a publication record.');
    setOutput('pending', 'false');
    setOutput('published', 'false');
    return;
  }

  const liveVersion = await fetchLiveVersion();
  const published = isPublished({ expectedVersion, liveVersion });
  console.log(`Submitted version: ${expectedVersion}`);
  console.log(`Live update-service version: ${liveVersion}`);
  console.log(`Publication detected: ${published ? 'yes' : 'no'}`);
  setOutput('pending', 'true');
  setOutput('expected_version', expectedVersion);
  setOutput('live_version', liveVersion);
  setOutput('published', String(published));
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Web Store publication check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  isPublished,
  parseUpdateResponse,
  pendingSubmissionVersion,
  submittedVersion,
};
