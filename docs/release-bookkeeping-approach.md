# Chrome Web Store Release Bookkeeping Approach

This project uses Git tags to record exactly which repository commit is live in the Chrome Web Store. The approach deliberately keeps Web Store upload and review manual while making the release baseline durable and easy to compare.

## Problem it solves

A manifest version or locally generated ZIP does not prove that a release was published. Packaging may happen several times, an upload may remain under review, and ignored `dist/` files are local to one machine.

The durable records are annotated Git tags:

```text
webstore-submitted-v<manifest version>
webstore-v<manifest version>
```

The submission tag identifies the uploaded commit and records the ZIP SHA-256. The shorter
publication tag identifies which submitted version was later confirmed live.

## Core rule

Create the submission tag immediately after uploading. Create the publication tag only
after the Chrome Developer Dashboard confirms that version is live. Neither building nor
submitting a ZIP is publication.

## Commands

Three npm commands wrap the bookkeeping:

```bash
npm run release:status
npm run release:submit
npm run release:record -- <version>
```

`release:status` finds the highest `webstore-v*` tag and compares it with `HEAD`. It reports separately whether extension runtime files and store-listing source files have changed since the recorded release.

`release:submit` records the submitted commit and ZIP checksum. `release:record` resolves
the requested version's submission tag, creates the publication tag at that preserved
commit, and pushes it to `origin`.

## Safety checks

Submission and publication checks require:

- A valid one-to-four-part Chrome extension version
- A clean working tree
- The submitted commit to be contained in the local `origin/main` tracking reference
- The submitted commit's manifest version to match the requested version
- A valid ZIP SHA-256 stored in a unique annotated submission tag
- An annotated submission tag before publication can be recorded
- No existing submission or publication tag for that version
- A version newer than every previously recorded Web Store version

If the tag is created locally but its push fails, retry only the tag push:

```bash
git push origin refs/tags/webstore-v<version>
```

## Release sequence

1. Finish the extension changes and confirm CI passes on `main`.
2. Increment the version in `manifest.json` and commit it.
3. Confirm CI passes on the versioned release commit.
4. Generate and verify the upload package from that commit.
5. Upload the package, update any listing metadata, and submit it for review.
6. Run `npm run release:submit` to tag the submitted commit and record the ZIP checksum.
7. Continue normal development while review is pending.
8. Wait until the new version is shown as published/live.
9. Run `npm run release:record -- <version>`; it tags the previously submitted commit.
10. Run `npm run release:status`; it now reports any post-submission work relative to the
    newly recorded live release.

## Files used in Dropdown Extractor

- `scripts/release-bookkeeping.cjs`: status, submission, and publication implementation
- `scripts/release-bookkeeping.test.cjs`: version, comparison, tagging, and safety-check tests
- `package.json`: `release:status`, `release:submit`, and `release:record` commands
- `docs/chrome-web-store-release.md`: project-specific operational release workflow
- `manifest.json`: authoritative Chrome extension version
- `docs/description.txt`: source for the Web Store description

To adopt this in another extension, copy the bookkeeping script and tests, add the npm commands, and customize the `runtimeFiles`, `listingFiles`, default branch, and remote name if that project differs.

## Limitations

- The tag records a human-confirmed publication; it does not query the Chrome Web Store API.
- The `origin/main` containment check uses the local remote-tracking reference. Fetch before
  recording a submission or publication if it may be stale.
- The submission tag records the uploaded ZIP's SHA-256, but the workflow still relies on
  the maintainer to upload that exact file and confirm publication in the Web Store.
