# Chrome Web Store Release Bookkeeping Approach

This project uses Git tags to record exactly which repository commit is live in the Chrome Web Store. The approach deliberately keeps Web Store upload and review manual while making the release baseline durable and easy to compare.

## Problem it solves

A manifest version or locally generated ZIP does not prove that a release was published. Packaging may happen several times, an upload may remain under review, and ignored `dist/` files are local to one machine.

The durable publication record is an annotated Git tag:

```text
webstore-v<manifest version>
```

For example, Chrome Web Store version `0.1.5` is recorded by `webstore-v0.1.5` on the exact commit that produced the published package.

## Core rule

Create the tag only after the Chrome Developer Dashboard confirms that the version is live. Building a ZIP, uploading it, or submitting it for review is not publication and must not create the tag.

## Commands

Two npm commands wrap the bookkeeping:

```bash
npm run release:status
npm run release:record
```

`release:status` finds the highest `webstore-v*` tag and compares it with `HEAD`. It reports separately whether extension runtime files and store-listing source files have changed since the recorded release.

`release:record` reads the version from `manifest.json`, creates the corresponding annotated tag, and pushes that tag to `origin`.

## Safety checks

Before recording a release, the script requires:

- A valid one-to-four-part Chrome extension version
- A clean working tree
- The current branch to be `main`
- `HEAD` to match the local `origin/main` tracking reference
- No existing tag for the current version
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
6. Wait until the new version is shown as published/live.
7. Run `npm run release:record` from the same clean, synchronized commit.
8. Run `npm run release:status`; runtime and listing files should report `unchanged`.

## Files used in Album Filter

- `scripts/release-bookkeeping.cjs`: status and record implementation
- `scripts/release-bookkeeping.test.cjs`: version, comparison, tagging, and safety-check tests
- `package.json`: `release:status` and `release:record` commands
- `docs/chrome-web-store-release.md`: project-specific operational release workflow
- `manifest.json`: authoritative Chrome extension version
- `docs/description.txt`: source for the Web Store description

To adopt this in another extension, copy the bookkeeping script and tests, add the npm commands, and customize the `runtimeFiles`, `listingFiles`, default branch, and remote name if that project differs.

## Limitations

- The tag records a human-confirmed publication; it does not query the Chrome Web Store API.
- The `origin/main` check uses the local remote-tracking reference. Fetch before recording if it may be stale.
- A tag proves which commit was declared published, not which ZIP bytes were uploaded. An artifact checksum can be added later if byte-level provenance is required.
