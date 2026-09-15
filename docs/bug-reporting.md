# Bug Reporting and Lifecycle

GitHub Issues is the canonical bug tracker for Dropdown Extractor. This document defines
how reports move from an observation to a verified release. `docs/handoff.md` may reference
active issue numbers, but it must not duplicate their full history.

## Reporting a bug

Use the repository's Bug report issue form. Include:

- the expected and actual behavior;
- repeatable steps and how often the problem occurs;
- the affected website and dropdown type;
- the extension, Chrome, and operating-system versions;
- the Text/Value, output format, Safe Capture, and Debug settings;
- a Dropdown Playground snapshot when the problem can be reproduced there; and
- sanitized Debug HTML when DOM evidence is needed.

Debug HTML can contain account details, entered text, identifiers, and private page data.
Remove sensitive information before attaching or pasting it. If a safe reproduction cannot
be shared publicly, describe the structure and behavior without disclosing private content.

## Lifecycle

Issues use the `bug` label plus at most one status label:

1. **Reported / needs reproduction** (`status: needs-repro`): the report has not yet been
   reproduced, or more information is needed.
2. **Confirmed** (`status: confirmed`): a maintainer reproduced the behavior and recorded
   the evidence. Prefer a failing automated test.
3. **Fix in progress** (`status: in-progress`): implementation is actively underway.
4. **Fixed, unreleased** (`status: fixed-unreleased`): the fix is committed to `main`, its
   regression evidence passes, but Web Store users do not have it yet.
5. **Released** (closed): the fix is live in the Chrome Web Store and the issue records the
   version, release tag, date, and live verification result.

During local development, an issue comment may say **fixed locally** only when the fix and
regression test pass locally. This is evidence, not a status label: the issue remains
`status: confirmed` or `status: in-progress` until the fix is committed to `main`.

For playground, CI, documentation, or other changes that do not ship in the extension,
close the issue after the fix reaches the applicable production system or `main`.

If investigation shows that a report is expected behavior, an environment problem, or a
test-harness false positive, record the evidence, remove lifecycle and severity labels,
apply `invalid` (or `duplicate`/`wontfix` when appropriate), and close the issue.

## Severity

Severity describes user impact, not when work will be scheduled. Assign one severity after
the bug is reproduced, and change it only when new evidence changes the understood impact:

- `severity: critical`: security or privacy exposure, data loss, or the extension is broadly
  unusable with no practical workaround;
- `severity: high`: core extraction fails or causes harmful page actions for many users;
- `severity: medium`: important behavior is wrong, but its scope is limited or a practical
  workaround exists; and
- `severity: low`: a minor edge case or inconvenience with limited impact.

Severity is independent of lifecycle status. Priority is intentionally not labeled yet;
with the current backlog size, scheduling decisions can be recorded directly on issues
without maintaining a second classification system.

## Evidence required for a fix

Before applying `status: fixed-unreleased`, record:

- a regression test that failed before the fix and passes afterward;
- the fixture contract and complete local suite required by the
  [automated testing guide](../tests/README.md);
- a linked entry under `Unreleased` in [CHANGELOG.md](../CHANGELOG.md) for a user-visible fix;
- the fix commit; and
- whether an extension runtime file changed.

If automation is impractical, record the exact manual verification and why it could not be
automated. Reference issues from commits when practical, for example:

```text
fix: allow mousedown selection with Safe Capture off (#123)
```

## Release closure

Bug fixes that change extension runtime files remain open with `status: fixed-unreleased`
until their Chrome Web Store version is live. Follow the
[Chrome Web Store release workflow](chrome-web-store-release.md) and move their
[CHANGELOG.md](../CHANGELOG.md) entries into the prepared version section.
Then add a final issue comment containing:

```text
Released in Chrome Web Store version 1.0.16.
Tag: webstore-v1.0.16
Verified live: YYYY-MM-DD — <verification result>
```

Remove the status label and close the issue only after that evidence is recorded.
