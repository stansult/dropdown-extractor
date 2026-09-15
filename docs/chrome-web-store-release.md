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
9. Submit the update for review and wait until that version is live.
10. From the same clean, synchronized `main` commit, run `npm run release:record`. This
    creates and pushes the annotated tag `webstore-v<version>`.
11. Run `npm run release:status`; runtime files and the Store description should both
    report `unchanged`.

For fixes tracked as `status: fixed-unreleased`, add the live version, release tag, date,
and verification result to each issue, remove the status label, and close the issue only
after the Chrome Web Store version is live. See the
[bug reporting process](bug-reporting.md).

`release:record` is the explicit confirmation that a version became public. Do not run it
when a package is merely built, uploaded, or awaiting review. If its tag push fails after
the local tag is created, push that tag with
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
