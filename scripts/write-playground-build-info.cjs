const fs = require('node:fs');
const path = require('node:path');

function createBuildInfo({ commit, deployedAt }) {
  if (!/^[0-9a-f]{40}$/i.test(commit || '')) {
    throw new Error('GITHUB_SHA must be a 40-character hexadecimal commit SHA.');
  }
  const timestamp = deployedAt instanceof Date ? deployedAt : new Date(deployedAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Deployment timestamp must be a valid date.');
  }
  return { commit, deployedAt: timestamp.toISOString() };
}

function writeBuildInfo(outputPath, input) {
  const buildInfo = createBuildInfo(input);
  fs.writeFileSync(outputPath, `${JSON.stringify(buildInfo, null, 2)}\n`);
  return buildInfo;
}

if (require.main === module) {
  const outputPath = process.argv[2] || path.join(__dirname, '..', 'test', 'build-info.json');
  writeBuildInfo(outputPath, {
    commit: process.env.GITHUB_SHA,
    deployedAt: new Date(),
  });
}

module.exports = { createBuildInfo, writeBuildInfo };
