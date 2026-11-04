# Test-Gated Playground Deployment

The workflow in `.github/workflows/playwright.yml` runs unit and Chromium Playwright tests on
product-impacting pushes and pull requests to `main`. Documentation/issue-template-only
changes use the targeted workflow described in [Automated Testing](../tests/README.md#ci).
Product tests still run when a playground deployment is unnecessary. Pull requests never
deploy.

After tests pass on `main`, the deployment job compares `test/` and
`netlify.toml` against the last successful deployment recorded in the GitHub
environment `netlify-playground-production`. Unrelated changes skip publishing.
Using the last successful deployment preserves pending playground changes after
failed tests or failed deployments.

The first run deploys once to establish its baseline. Missing Git history also
causes a deployment rather than risking skipped changes. Deployment jobs are
serialized and confirm that their commit is still the tip of `main` before
publishing.

Netlify CLI publishes only `test/` with `--prod --no-build`. This does not
package or publish the Chrome extension. A successful upload is followed by a
GitHub deployment record. The Netlify deploy title uses the tested commit's
subject so the dashboard identifies the change instead of showing only a raw SHA.

The public Playground may include a fixture for extension behavior implemented on
`main` but not yet published in the Chrome Web Store. Such a type must be labeled
**Coming in next release** throughout the Playground and public
[compatibility reference](dropdown-compatibility.md). Change it to **Supported** only after
the relevant Web Store version is live and the real type has been verified with that
published extension.

## One-Time Setup

1. Add GitHub Actions secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
2. Stop Netlify's independent builds under **Project configuration > Build & deploy > Continuous deployment > Build settings** by setting **Build status** to **Stopped builds**. Do not stop auto publishing.
3. Push or manually dispatch the workflow and confirm that both test and deploy jobs succeed.

Until step 2 is complete, Netlify's independent Git builds can bypass the test
gate. The ignore rule in `netlify.toml` remains for legacy Git builds; Actions
uses `scripts/deployment-plan.cjs` instead.

## Verification and Recovery

- Read the Actions summary for the deployment or skip reason.
- A documentation-only change should test successfully and skip deployment after the initial baseline.
- A playground change should publish only after tests pass.
- Retry a failed workflow or use manual dispatch on `main` after correcting secrets or service availability.
- Avoid manual Netlify uploads or rollbacks while relying on this baseline because they do not update the GitHub deployment record.
- Run deployment-decision tests locally through `npm run test:unit`.
