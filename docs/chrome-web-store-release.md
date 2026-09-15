# Chrome Web Store Release

Use this workflow for an update to the existing Dropdown Extractor listing.

1. Start from clean, synchronized `main` and run `npm run release:status`.
2. Run `npm run package:patch` to increment `manifest.json` and create the versioned ZIP in `dist/`.
3. Review and commit the manifest version bump, push it, and complete the usual regression checks.
4. Run `npm run package` so the final ZIP is generated from the tested commit.
5. In the Chrome Developer Dashboard, upload the ZIP from `dist/`. If present, copy the updated listing text from `dist/description-to-upload.txt`.
6. Submit the update for review and wait until that version is live.
7. From the same clean, synchronized `main` commit, run `npm run release:record`. This creates and pushes the annotated tag `webstore-v<version>`.
8. Run `npm run release:status`; runtime files and the store description should both report `unchanged`.

`release:record` is the explicit confirmation that a version became public. Do not run it when a package is merely built, uploaded, or awaiting review. If its tag push fails after the local tag is created, push that tag with `git push origin refs/tags/webstore-v<version>`.

The status command tracks extension runtime files separately from `docs/description.txt`. Changes to the test playground and general project documentation are outside the Chrome Web Store release comparison.
