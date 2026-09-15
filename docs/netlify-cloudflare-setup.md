# Netlify + Cloudflare Setup (Dropdown Playground)

This project hosts the test playground as a static site from the `test/` folder.

## 1. Netlify Site Setup

1. In Netlify, create/import a site from this Git repository.
2. Configure build settings:
   - Publish directory: `test`
   - Build command: *(empty)*
3. Commit `netlify.toml` (already present in this repo):

```toml
[build]
  publish = "test"
  command = ""
  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- test/ netlify.toml"
```

### What this does

- Serves static files directly from `test/`.
- Skips deploys unless `test/` or `netlify.toml` changed.

## 2. Netlify Custom Domain

1. In Netlify site settings, open **Domain management**.
2. Add custom domain:
   - `dropdown-extractor.stansult.com` (or your preferred subdomain)
3. Keep the Netlify-provided target hostname ready (example format: `your-site-name.netlify.app`).

## 3. Cloudflare DNS

In Cloudflare DNS for `stansult.com` (or your domain):

1. Add/Update a `CNAME` record:
   - Name: `dropdown-extractor`
   - Target: your Netlify hostname (for example `your-site-name.netlify.app`)
2. Proxy mode:
   - Start with **DNS only** while verifying domain setup.
   - You can enable proxy later if desired.

## 4. SSL / Verification

1. Wait for DNS propagation.
2. In Netlify domain management, confirm domain verification succeeds.
3. Ensure HTTPS is active.
4. Open:
   - `https://dropdown-extractor.stansult.com`

## 5. Deploy Workflow

- Changes under `test/` trigger deploys.
- Changes outside `test/` and `netlify.toml` do not trigger deploys due to the `ignore` rule.

## 6. Quick Troubleshooting

- Domain not resolving:
  - Check Cloudflare CNAME target and propagation.
- Netlify not deploying:
  - Confirm your commit modified `test/` or `netlify.toml`.
- 404 on assets:
  - Ensure files are inside `test/` and paths in `test/index.html` are relative.
- TLS issues:
  - Recheck custom domain status in Netlify and DNS record correctness.
