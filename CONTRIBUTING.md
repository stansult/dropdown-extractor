# Contributing and Maintenance

This guide collects the repository-wide practices for changing Dropdown Extractor. Detailed
procedures remain in their canonical documents rather than being duplicated here.

## Change workflow

- Use `origin/main` as the default push target unless the work requires a feature branch.
- Before committing, review the full diff, reread edited files, and use a commit message that
  describes all included changes.
- Do not commit a reported bug fix until its key regressions have been rechecked.
- Keep user-facing terminology synchronized across the README and
  `docs/description.txt` when applicable.

## Verification before pushing

For executable, configuration, workflow, manifest, package, fixture, or test changes, run:

```bash
npm run test:unit
npm run test:e2e
```

Push only after both suites pass. A change containing only Markdown files may skip both
suites after all of the following checks:

- run `git diff --check`;
- confirm the changed-file list is Markdown-only;
- review the full diff and rendered wording; and
- verify referenced local links.

Markdown that drives automation or generated output does not qualify for this exception.
See the [automated testing guide](tests/README.md) for test architecture, coverage, reports,
and contribution requirements.

Every fixture-dependent extension test must have an independent playground contract that
verifies the relevant DOM structure, data sources, and unmodified interaction behavior.

## Canonical processes

- [Automated testing](tests/README.md)
- [Bug reporting and lifecycle](docs/bug-reporting.md)
- [Chrome Web Store releases](docs/chrome-web-store-release.md)
- [Playground deployment](docs/deployment.md)

Runtime bugs committed to `main` remain open as `status: fixed-unreleased` until their Web
Store version is live and verified. GitHub Issues is the source of truth for active bug
status; `CHANGELOG.md` is the user-visible release history.
