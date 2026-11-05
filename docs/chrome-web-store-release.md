# Chrome Web Store Release

Use this workflow for an update to the existing Dropdown Extractor listing.

1. Start from clean, synchronized `main` and run `npm run release:status`.
2. Review [CHANGELOG.md](../CHANGELOG.md). Every notable user-facing runtime change must be under
   `Unreleased`, with fixed bugs linked to their GitHub issues.
3. Run `npm run package:patch` to increment `manifest.json` and create the versioned ZIP
   in `dist/`.
4. Replace the changelog's `Unreleased` changes with a heading for the new version and
   preparation date, then restore an empty `Unreleased` section at the top.
5. Run `npm run test:unit` and `npm run test:e2e`.
6. Review and commit the manifest version bump and changelog together, then push them.
7. Run `npm run package` so the final ZIP is generated from the tested commit and inspect
   its contents.
8. In the Chrome Developer Dashboard, upload the ZIP from `dist/`. If present, copy the
   updated listing text from `dist/description-to-upload.txt`.
9. From a clean working tree, run `npm run release:submit`. This calculates the ZIP's
   SHA-256 and creates and pushes `webstore-submitted-v<version>` at the uploaded commit.
   Record this marker before allowing `main` to advance.
10. Apply `release: verify-live` to every open bug or enhancement that requires verification
    against the published package. Submit the update for review. Normal development may
    continue on `main` while review is pending because the submission tag preserves the
    uploaded commit.
11. The **Web Store publication** workflow checks Google's live extension-update service every
    six hours. When the submitted version is available, it adds one notification comment to
    each open issue marked `release: verify-live`. The workflow can also be dispatched manually
    when the Dashboard first reports the version live. Confirm that this notification run
    completed before recording the publication tag; otherwise the submission will no longer be
    considered pending by later checks.
12. Run `npm run release:record -- <version>`. This creates and
    pushes `webstore-v<version>` at the commit recorded by the latest submission or
    resubmission tag, regardless of the current `main` tip.
13. Retest every marked issue against the Web Store installation. Record the version, release
    tag, date, and result; remove `release: verify-live`; and close or update the issue according
    to its lifecycle. Publication detection never closes issues automatically.
14. Run `npm run release:status`. If `main` has not changed since submission, runtime and
    listing files should report `unchanged`; otherwise its results describe legitimate
    post-submission work relative to the newly recorded live baseline.

For fixes tracked as `status: fixed-unreleased`, add the live version, release tag, date,
and verification result to each issue, remove the status label, and close the issue only
after the Chrome Web Store version is live. See the
[bug reporting process](bug-reporting.md).

`release:submit` records what was uploaded; it does not mean the version is public. Its
annotated tag contains the ZIP SHA-256 and must point to a commit contained in `origin/main`
whose manifest has the submitted version. By default it uses the current manifest, `HEAD`,
and `dist/dropdown-extractor-<version>.zip`; optional arguments are version, commit, and ZIP.

## Rejected submissions

A rejected draft is not a published release. Keep the original
`webstore-submitted-v<version>` tag as immutable evidence of the rejected attempt, record the
exact policy message, and correct the applicable source file before resubmitting.

If only Store metadata changes and the uploaded ZIP remains byte-for-byte identical:

1. Commit and push the corrected listing source.
2. Reuse or re-upload the same tested ZIP and submit the corrected draft for review. Do not use
   **Roll back to previous version**; rollback applies to an already-published package.
3. From a clean tree, run
   `npm run release:resubmit -- <version> <corrected-commit> <archive>`. The command requires
   the ZIP checksum to match the original submission and creates
   `webstore-submitted-v<version>-r2`. Later retries increment the suffix (`-r3`, `-r4`, and so
   on) without deleting earlier evidence.

If the package changes, or the Dashboard requires a new extension version, do not use
`release:resubmit`. Prepare the new version through the normal packaging workflow and record it
with `release:submit`.

`release:record` selects the highest numbered resubmission marker when one exists, so the final
publication tag preserves the accepted listing revision as well as the unchanged package
checksum.

`release:record` is the explicit confirmation that a submitted version became public. Do
not run it while the package is awaiting review. If its tag push fails after the local tag
is created, push that tag with
`git push origin refs/tags/webstore-v<version>`.

## Publication monitoring

`.github/workflows/webstore-publication.yml` is a permanent, mostly dormant scheduled check.
It derives the newest submitted version lacking a `webstore-v<version>` publication tag, so a
new schedule does not need to be created for each upload. `npm run release:check-live` runs the
same package-version check locally.

The check uses Google's extension-update service because it reports the package Chrome can
install; the public Store listing may be cached and show an older version. A successful check
is publication evidence, not behavior verification. Issue comments are idempotent per version,
and the workflow never removes labels, closes issues, creates the publication tag, or replaces
the required live retest.

GitHub schedules are approximate rather than exact. The workflow is set to minute 23 every six
hours to avoid the busiest start-of-hour window. GitHub may disable scheduled workflows after a
long period without repository activity; manual dispatch remains available.

## Changelog and Store description

[CHANGELOG.md](../CHANGELOG.md) is the versioned history for existing users.
`docs/description.txt` is the current Chrome Web Store listing copy for prospective users.
It may prepare a concise compatibility claim for the next submission even while the public
Playground and [compatibility reference](dropdown-compatibility.md) label a type **Coming in
next release**. Treat the changelog and listing source independently, following the
repository-wide [documentation impact review](../CONTRIBUTING.md#documentation-impact-review):

| Change | Changelog | Store description |
| --- | --- | --- |
| User-visible bug fix | Update | Usually unchanged |
| New supported dropdown type | Update | Conditional: update concise general compatibility prose only when its claim changes; never add a framework/type keyword list |
| New user-facing option | Update | Update only when the option is part of the permanent advertised behavior |
| Internal refactor, tests, CI, or general documentation | Unchanged | Unchanged |
| Marketing or editorial listing change | Unchanged | Update |

Do not add generic statements such as “bug fixes” to the permanent Store description.
Change it only when the extension's currently advertised capabilities or limitations change.
Keep the detailed supported-type list in the public compatibility reference and Playground
rather than duplicating it in Store metadata.
Packaging emits `dist/description-to-upload.txt` only when `docs/description.txt` differs
from its last-uploaded baseline.

`npm run release:status` compares runtime files and the Store description with the latest
`webstore-v*` tag. Changelog completeness and version headings are reviewed manually during
release preparation.
