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
10. Submit the update for review. Normal development may continue on `main` while review
    is pending because the submission tag preserves the uploaded commit.
11. After that version is live, run `npm run release:record -- <version>`. This creates and
    pushes `webstore-v<version>` at the commit recorded by the submission tag, regardless
    of the current `main` tip.
12. Run `npm run release:status`. If `main` has not changed since submission, runtime and
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

`release:record` is the explicit confirmation that a submitted version became public. Do
not run it while the package is awaiting review. If its tag push fails after the local tag
is created, push that tag with
`git push origin refs/tags/webstore-v<version>`.

## Changelog and Store description

[CHANGELOG.md](../CHANGELOG.md) is the versioned history for existing users.
`docs/description.txt` is the current Chrome Web Store listing copy for prospective users.
Treat them independently:

| Change | Changelog | Store description |
| --- | --- | --- |
| User-visible bug fix | Update | Usually unchanged |
| New supported dropdown type | Update | Update |
| New user-facing option | Update | Update |
| Internal refactor, tests, CI, or general documentation | Unchanged | Unchanged |
| Marketing or editorial listing change | Unchanged | Update |

Do not add generic statements such as “bug fixes” to the permanent Store description.
Change it only when the extension's currently advertised capabilities or limitations change.
Packaging emits `dist/description-to-upload.txt` only when `docs/description.txt` differs
from its last-uploaded baseline.

`npm run release:status` compares runtime files and the Store description with the latest
`webstore-v*` tag. Changelog completeness and version headings are reviewed manually during
release preparation.
