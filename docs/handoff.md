Project: dropdown-extractor (Chrome extension)

Goal of this handoff:
Give a new thread enough context (beyond code) to continue work.

Git workflow:
- Default push target is `origin/main` unless specified otherwise.

Workflow rules:
- Don't start implementing / changing code unless you got request from me, or you suggested changes and I told you to start.
- Keep this handoff file updated whenever process changes so a fresh thread can resume without context loss.
- Before committing, review the full diff and draft a commit message that covers all included changes.
- Do not commit immediately after a reported fix until key regressions are rechecked.
- Before every push, run both `npm run test:unit` and `npm run test:e2e`; push only
  after both suites pass.
- When labels/terminology change, keep docs in sync (at minimum `README.md` and `docs/description.txt`).
- Re-read edited files after changes to confirm final file content is correct.
- Every fixture-dependent extension test must have an independent playground contract
  test that verifies the relevant DOM structure, data sources, and unmodified interaction
  behavior on which the extension assertion depends.

Current behavior highlights:
- Arm via extension button; click a menu option to extract items.
- Safe capture blocks option clicks while armed, but does NOT block menu triggers
  (aria-expanded/aria-haspopup), so menus can open while Safe capture is on.
- Debug "Any two" mode: 1/2 captures trigger/container/uncategorized; 2/2 captures option.
  Toasts include the captured type. 1/2 payload persists when 2/2 completes.
- Any-two approach: the trigger click is only used to locate the menu. It waits briefly
  for a visible container and captures that as 1/2, then captures the clicked option as 2/2.
  Containers include role="menu"/"listbox"/"list"/"dialog" and Selectize
  `.selectize-dropdown-content`; labels use the same container logic (isLikelyContainer).

Defaults + options:
- Safe capture default is ON for new installs. Background onInstalled sets it true if unset.
- Options page includes a "Reset to defaults" button under Safe capture.
- Safe capture label has a tooltip explaining: clicking a menu option won’t select it.

Supported dropdown types (README/test page are updated):
- Native <select>, ARIA listbox, Selectize, React Select (incl. Atlassian variant),
  Downshift-style, MUI Autocomplete-style, Radix menu, Ant Design Select,
  Select2, Chosen, GitHub SelectMenu (checkbox list), AliExpress search suggestions.
- Google search suggestions work via ARIA listbox/option.

Recent fixes/features:
- GitHub SelectMenu extraction fixed. Handler triggers only within .SelectMenu list items.
  Non-debug now extracts checkbox text/value (e.g., "Future ideas [7075802]").
- Generic listitem menu support added (containers with role="listitem") for popup menus
  lacking list/listbox/menu roles; visibility uses rect + computed style (not offsetParent),
  which fixes fixed-position popups like Quora.
- AliExpress suggestions support added (history/discover more + productlist suggestions).
  Uses href as value; value/data-value are ignored. Safe capture uses mousedown.
- Safe capture blocking logic only triggers when a visible menu container exists, and avoids
  blocking likely menu triggers.

Test page:
- Includes GitHub SelectMenu mock and AliExpress suggestions mock.
- GitHub SelectMenu test mock toggle logic avoids double toggles on checkbox/label.
- AliExpress test note: href is treated as value; value/data-value ignored.

Notes for future work:
- If adding a new dropdown type, prefer creating a test page mock + README entry.
- For debugging unsupported menus, use Debug -> Any two to capture trigger/container/option.
- Before committing, review the full diff and draft a commit message that covers all changes.
- Safe capture regressions: use Any two on the option click to inspect DOM/ARIA; if an option is misclassified as a trigger (e.g., `aria-expanded` on the option), adjust `shouldBlockOptionClick` to treat it as an option (often via a distinctive child selector).

Description file:
- Source: `docs/description.txt` (short Chrome Web Store description).
- Update it when README’s supported dropdown list or key wording changes.
- Packaging: writes `dist/description-to-upload.txt` only if the description changed
  since last upload (tracked in `dist/.description-last`). The file is not removed
  automatically; delete it manually after you upload.

Chrome Web Store release bookkeeping:
- Canonical workflow: `docs/chrome-web-store-release.md`.
- Current published baseline: `webstore-v1.0.15` at commit `12a2d56`.
- `npm run release:status` compares extension runtime files and `docs/description.txt`
  against the highest `webstore-v*` tag.
- Run `npm run release:record` only after the Developer Dashboard shows that version
  as live. It requires clean, synchronized `main`, then creates and pushes an annotated
  `webstore-v<manifest version>` tag.
- Web Store upload/review remains manual. A built or submitted ZIP is not a published
  release and must not be tagged.

Automated testing:
- Local setup and commands: see `README.md`, "Automated browser tests."
- Run all tests with `npm run test:unit`, then `npm run test:e2e`.
- `npm run test:e2e:headed` runs Playwright visibly for debugging.
- Playground tests cover fixture rendering without the extension. Extension tests load
  the actual unpacked extension in Playwright's bundled Chromium and invoke its toolbar
  action through CDP, exercising popup, background, `activeTab`, and content injection.
  Tests use a temporary browser profile and the local playground at
  `http://127.0.0.1:4173`.
- Playground contract tests cover every fixture currently used by extension tests:
  native, ARIA, GitHub SelectMenu, Dropbox, AliExpress, and Expedia. Extension coverage
  includes native extraction, ARIA and Dropbox Safe capture, GitHub checkbox values,
  AliExpress href values, and Expedia aria-label text.
- `.github/workflows/playwright.yml` is the canonical CI and deployment workflow. It runs
  unit/release-tool and Playwright tests for main pushes, main pull requests, and manual
  dispatches. CI retries browser failures twice, uses two workers, and retains the HTML
  Playwright report for 30 days.
- `npm run test:unit` includes isolated packaging checks, release bookkeeping tests, and
  mocked coverage of popup retry and background injection/error paths. Packaging tests
  never modify the real manifest or `dist/`.

Playground deployment:
- Canonical setup and recovery guide: `docs/deployment.md`.
- The deploy job runs only after tests pass on the current tip of `main`; pull requests
  never deploy. It publishes `test/` with Netlify CLI and records successful baselines
  in the GitHub environment `netlify-playground-production`.
- Deployment decisions compare `test/` and `netlify.toml` with the last successful
  workflow deployment, preserving pending changes across failures.
- GitHub requires repository secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
- Netlify's independent Git builds must remain stopped while Actions owns deployment.
