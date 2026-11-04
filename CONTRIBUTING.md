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

## Documentation impact review

Perform this review for every change before committing. Documentation impact is a decision
to make explicitly, not a release-cleanup task to defer. Update affected documentation in the
same commit as the change whenever practical.

1. Classify the change using the matrix below. Use every applicable row when a change spans
   categories.
2. Update each required surface and evaluate every conditional surface.
3. When a tracked issue or pull request exists, record why a normally relevant conditional
   surface is unchanged. Do not use a generic “documentation not needed” statement.
4. During final diff review, check terminology, capability claims, limitations, publication
   status, links, and release version language across the affected surfaces.
5. During release preparation, repeat the user-facing portion of this review against the
   exact submitted commit. Submission, publication, and live verification remain separate
   states.

| Change category | Public product documentation | Changelog | Store description | Testing/process documentation |
| --- | --- | --- | --- | --- |
| Extension behavior, capability, option, or limitation | Update the README when current behavior or guidance changes | Required when user-visible | Update only when the permanent advertised behavior or limitation changes | Update coverage or workflow guidance when affected |
| New supported dropdown family | Update the README compatibility table and Playground publication status | Required | Conditional: revise concise compatibility prose only when the general claim changes; do not add a framework/type keyword list | Update the fixture and coverage matrices and follow the adding-type guide |
| User-visible bug fix | Correct inaccurate README guidance when applicable | Required | Usually unchanged; update only if the listing's current behavior or limitation becomes inaccurate | Link regression coverage and bug/release evidence |
| Playground behavior or fixture | Update Playground help and the README when public usage changes | Do not add to the extension changelog unless extension behavior also changed | Unchanged | Update Playground contracts, coverage, and deployment guidance when applicable |
| Test, CI, deployment, or contributor-process change | Usually unchanged | Unchanged | Unchanged | Update the relevant public contributor, testing, deployment, bug, or release guide |
| Store metadata/editorial change | Keep equivalent product terminology consistent when applicable | Unchanged unless product behavior changed | Required | Update release guidance only when the reusable workflow changed |
| Release-state change | Keep README and Playground statuses aligned with the live Web Store version | Prepare/version/verify according to the release workflow | Use the text submitted for that release | Record submission, publication, and verification evidence in their canonical locations |

The README and Playground are the canonical public locations for the detailed supported-type
list. The Chrome Web Store description must remain concise and behavior-oriented; it is not a
second compatibility matrix. `CHANGELOG.md` records extension releases, not standalone
Playground, test, CI, or documentation changes.

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
Passing tests must observe the user-facing outcome they claim: internal calls, generated
payloads, or child-frame DOM elements are not substitutes for exact clipboard results,
top-viewport feedback, or page-side-effect assertions. Test names and coverage documentation
must not claim more than the assertions prove. See the automated testing guide's
[test-oracle requirements](tests/README.md#test-oracle-requirements) for the full checklist.

## Canonical processes

- [Automated testing](tests/README.md)
- [Adding a supported dropdown type](docs/adding-dropdown-type.md)
- [Bug reporting and lifecycle](docs/bug-reporting.md)
- [Chrome Web Store releases](docs/chrome-web-store-release.md)
- [Playground deployment](docs/deployment.md)

Runtime bugs committed to `main` remain open as `status: fixed-unreleased` until their Web
Store version is live and verified. GitHub Issues is the source of truth for active bug
status; `CHANGELOG.md` is the user-visible release history.
