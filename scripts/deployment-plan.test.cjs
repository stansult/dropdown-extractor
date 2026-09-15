const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planDeployment } = require('./deployment-plan.cjs');

function fixture({ current = 'current', pages = [[]], statuses = {}, diffStatus = 0 } = {}) {
  const comparisons = [];
  return {
    comparisons,
    context: { repo: { owner: 'owner', repo: 'repo' }, sha: 'current' },
    github: {
      rest: { repos: {
        getBranch: async () => ({ data: { commit: { sha: current } } }),
        listDeployments: () => {},
        listDeploymentStatuses: async ({ deployment_id }) => ({ data: statuses[deployment_id] || [] }),
      } },
      paginate: { iterator: async function* () {
        for (const data of pages) yield { data };
      } },
    },
    git: (_command, args) => {
      comparisons.push(args);
      if (diffStatus) throw Object.assign(new Error('git diff'), { status: diffStatus });
    },
  };
}

test('first deployment establishes a baseline', async () => {
  assert.equal((await planDeployment(fixture())).needed, true);
});

test('outdated commits cannot deploy', async () => {
  const input = fixture({ current: 'newer' });
  assert.equal((await planDeployment(input)).needed, false);
  assert.equal(input.comparisons.length, 0);
});

for (const [name, diffStatus, needed] of [
  ['unchanged playground skips deployment', 0, false],
  ['changed playground deploys', 1, true],
  ['unavailable baseline allows deployment', 128, true],
]) {
  test(name, async () => {
    const input = fixture({
      pages: [[{ id: 1, sha: 'published' }]],
      statuses: { 1: [{ state: 'success' }] }, diffStatus,
    });
    assert.equal((await planDeployment(input)).needed, needed);
    assert.deepEqual(input.comparisons, [
      ['diff', '--quiet', 'published', 'current', '--', 'test/', 'netlify.toml'],
    ]);
  });
}

test('failed or unfinished deployments do not replace the last successful baseline', async () => {
  const input = fixture({
    pages: [[{ id: 3, sha: 'failed' }, { id: 2, sha: 'unfinished' }], [{ id: 1, sha: 'published' }]],
    statuses: { 3: [{ state: 'failure' }], 1: [{ state: 'success' }] }, diffStatus: 1,
  });
  assert.equal((await planDeployment(input)).needed, true);
  assert.equal(input.comparisons[0][2], 'published');
});

test('API errors fail the job instead of silently treating the playground as unchanged', async () => {
  const input = fixture();
  input.github.rest.repos.getBranch = async () => { throw new Error('API unavailable'); };
  await assert.rejects(planDeployment(input), /API unavailable/);
});
