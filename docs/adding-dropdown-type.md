# Adding a Supported Dropdown Type

Use this process when Dropdown Extractor encounters a reusable dropdown structure that is
not already supported. New dropdown types are features, not bugs, unless an existing
advertised type has regressed or its documented support was inaccurate.

Track each type with the repository's **New dropdown type** GitHub issue form. The issue is
the evidence and status record for that specific type; this guide is the reusable process.

## 1. Capture and assess the real component

- Record sanitized Debug **Any two** output for the menu container and one option when
  practical. Debug HTML can contain private page data; never commit or post it without
  reviewing and removing sensitive content.
- Identify the trigger, menu container, option elements, text source, possible value sources,
  and the events that select or close the menu.
- Check for virtualized or lazy-loaded options, Shadow DOM, canvas rendering, and iframe
  boundaries.
- Confirm that the structure represents a reusable DOM or ARIA family. Prefer semantic roles,
  attributes, and stable behavior over site- or vendor-specific class names.
- Define expected Text, Value, Safe Capture, and Debug behavior before changing tests or
  product code. Record unavailable values and known limitations explicitly.

## 2. Create a sanitized playground fixture

Reproduce only the structure and interaction needed to represent the real dropdown. Use
generic generated content rather than copying proprietary markup, labels, identifiers, or
account data. Preserve relevant behavior such as the opening event, selection event, menu
closing, and value source.

Add an independent playground contract before relying on the fixture in an extension test.
The contract must verify the relevant DOM structure, data sources, and normal unmodified
interaction. It must not duplicate the extension's extraction logic.

## 3. Add extension coverage before support

Exercise the real unpacked extension through its toolbar action. Assert exact clipboard
output, user-visible notifications in the intended viewport/frame context, and observable
page side effects. A generated payload or child-frame toast is not a substitute for the
user-facing outcome. Cover type-specific behavior such as a distinct value source or event
model; do not repeat the global extraction-option matrix without a type-specific reason.

When practical, run the new extension test against the unsupported implementation and record
that it fails because the new structure is not recognized. If controlled failure verification
is impractical or unsafe, record why and prove independently that the fixture reaches the
intended path and the assertions observe the relevant outcome.

## 4. Implement the narrowest reusable support

- Extend shared semantic recognition when the pattern is generalizable.
- Use vendor-specific selectors only when semantic recognition cannot distinguish the type
  safely.
- Reuse existing text, value, formatting, notification, and Safe Capture behavior where their
  contracts apply.
- Check that the new selectors do not capture unrelated controls or conflict with existing
  dropdown families.

## 5. Verify and document

Follow [Automated Testing](../tests/README.md) for focused and complete-suite verification.
Update, as applicable:

- the supported dropdown table and limitations in [README.md](../README.md);
- the fixture and option matrices in [tests/README.md](../tests/README.md);
- `Unreleased` in [CHANGELOG.md](../CHANGELOG.md);
- the Chrome Web Store source in [docs/description.txt](description.txt), following the
  [release guide](chrome-web-store-release.md).

Record the fixture contract, pre-support failure evidence, extension coverage, implementation
commit, complete-suite results, documentation changes, and release impact in the issue.

## 6. Represent publication status

Implementation and Chrome Web Store publication are separate states. When a fixture and its
support are merged before publication:

- label the type **Coming in next release** in the Playground and public README;
- keep its user-visible changelog entry under `Unreleased`;
- allow `docs/description.txt` to prepare the listing text for the next submission;
- record development-extension verification separately from live Web Store verification;
- keep the tracking issue open.

The public Playground may deploy this pending fixture after CI passes. Its status must make
clear that the current Web Store extension does not support it yet. Automated tests continue
to exercise the implementation on `main`; they do not depend on the published extension.

## 7. Submit, publish, and verify

Follow the [Chrome Web Store release workflow](chrome-web-store-release.md), preserving the
submitted commit and ZIP checksum. Submission does not change the type's publication status.
Only after the Web Store version is live:

1. install or update to the published extension;
2. verify the real dropdown when it remains safely available;
3. record the version and evidence in the issue;
4. change the Playground and README status to **Supported**;
5. run the required suites and deploy that status change; and
6. close the issue after the release record and live verification are complete.

## Completion and release states

The implementation is complete when the sanitized fixture, independent contract, extension
coverage, product support, pending-release status, documentation, and required verification
are all present. This is **implemented but unreleased**, not publicly supported. Keep the issue
open until the relevant Chrome Web Store version is live, the real type is verified in that
version, the Playground and README say **Supported**, and the release is recorded using the
repository's release workflow.
