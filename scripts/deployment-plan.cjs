const { execFileSync } = require('node:child_process');

const environment = 'netlify-playground-production';

async function planDeployment({ github, context, git = execFileSync }) {
  const { data: branch } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  if (branch.commit.sha !== context.sha) {
    return { needed: false, reason: 'Skipped: this commit is no longer the tip of main.' };
  }

  let baseline;
  for await (const { data: deployments } of github.paginate.iterator(
    github.rest.repos.listDeployments,
    { ...context.repo, environment, per_page: 100 },
  )) {
    for (const deployment of deployments) {
      const { data: statuses } = await github.rest.repos.listDeploymentStatuses({
        ...context.repo, deployment_id: deployment.id, per_page: 1,
      });
      if (statuses[0]?.state === 'success') {
        baseline = deployment.sha;
        break;
      }
    }
    if (baseline) break;
  }

  if (!baseline) {
    return { needed: true, reason: 'Deploying to establish the first successful workflow baseline.' };
  }
  try {
    git('git', ['diff', '--quiet', baseline, context.sha, '--', 'test/', 'netlify.toml']);
    return { needed: false, reason: `Skipped: playground unchanged since successful deployment ${baseline}.` };
  } catch (error) {
    if (error.status === 1) {
      return { needed: true, reason: `Deploying playground changes since successful deployment ${baseline}.` };
    }
    return { needed: true, reason: 'Deploying because the previous baseline could not be compared.' };
  }
}

module.exports = { environment, planDeployment };
