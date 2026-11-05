# Automated Testing

This is the canonical guide to Dropdown Extractor's automated tests. The extension is the
product, so extension end-to-end tests provide the primary confidence. Playground contract
tests independently prove that the fixtures used by those tests behave as intended.

## Setup and commands

Install the project dependencies and Playwright's bundled Chromium once:

```bash
npm install
npx playwright install chromium
```

Run the complete local test suite:

```bash
npm run test:unit
npm run test:e2e
```

Both commands must pass before pushing executable, configuration, workflow, manifest,
package, fixture, or test changes. Useful focused and diagnostic commands include:

```bash
npx playwright test tests/playground.spec.cjs
npx playwright test tests/extension.spec.cjs
npm run test:e2e:headed
```

The default local Playwright reporter writes results to the terminal. To generate and open
a current local HTML report:

```bash
npx playwright test --reporter=html
npx playwright show-report
```

Changes containing only Markdown files may skip both test suites. Before pushing one, run
`git diff --check`, confirm the changed-file list is Markdown-only, review the full diff and
rendered wording, and verify referenced local links exist. Markdown used as automation input
or to generate another artifact does not qualify for this exception. GitHub Actions remains
the repository-wide check after the push.

The report entry point is `playwright-report/index.html`. On failure, screenshots, error
context, and retained traces are written under `test-results/`; Playwright prints the exact
`npx playwright show-trace ...` command for each trace.

## Test layers

### Unit and entrypoint tests

`npm run test:unit` runs `scripts/*.test.cjs`. It covers packaging, Chrome Web Store release
bookkeeping, and mocked popup/background entrypoints. Packaging tests operate in isolated
temporary repositories and do not modify the real manifest or `dist/` directory.

### Playground contract tests

`tests/playground.spec.cjs` loads the playground without the extension. Each contract proves
the DOM structure, data sources, and normal interaction behavior that a corresponding
extension assertion relies on.

Every fixture-dependent extension test must have an independent playground contract. A
contract should validate only the assumptions that make the extension result meaningful;
it should not duplicate extraction logic.

The public Playground can render any offered fixture either on the top page (the default)
or directly inside a same-origin iframe. Its contracts verify the context control and status,
preserve the existing top-page behavior, exercise native and searchable ARIA interactions in
the iframe, and smoke-test every offered fixture family there without page errors. Extension
coverage remains focused on representative native and ARIA iframe paths rather than repeating
every fixture permutation.

### Extension end-to-end tests

`tests/extension.spec.cjs` launches Playwright's bundled Chromium with the repository root
loaded as the real unpacked extension. Each test uses a temporary browser profile and grants
clipboard permission only to the local playground at `http://127.0.0.1:4173`.

Tests invoke the toolbar action through Chrome DevTools Protocol `Extensions.triggerAction`.
This exercises toolbar activation, popup, background service worker, `activeTab` permission,
content-script injection, page interaction, clipboard output, and notifications. Extension
tests run serially because they operate through extension state and persistent browser
contexts; playground contracts may run in parallel. The complete browser suite uses at most
two workers locally and in CI so parallel fixture checks do not starve extension browser
startup and activation.

The persistent Chromium fixture has a separate 60-second setup budget for creating its
temporary profile and loading the extension. Individual tests retain the shared 15-second
limit and 5-second assertion timeout, so slow browser startup cannot consume or weaken the
product-behavior checks.

The activation helper marks any existing armed toast before triggering the toolbar action
and waits for a newly created armed toast. This prevents a fading toast from a previous
activation from making repeated-activation tests continue before reinjection is ready.

## Test-oracle requirements

A passing test must observe the user-facing outcome named by the test and coverage matrix,
not only an internal step that can also occur when that outcome is broken. Apply these rules:

- Prove clipboard behavior by reading and comparing the exact clipboard contents. A toast that
  says content was copied, a handler invocation, or a constructed payload is not clipboard
  evidence.
- Prove visible feedback in the browsing context where the user must see it. For iframe results,
  assert that the intended top-level feedback is in the current viewport; the existence or CSS
  visibility of a toast inside a child frame is not sufficient.
- Prove Safe Capture with both the extraction result and all relevant prevented page effects,
  such as selection state, trigger text, menu state, navigation, and the fixture's event-specific
  behavior. Prove Safe Capture off with the corresponding normal effects occurring.
- At mocked boundaries, assert exact messages, targets, and meaningful state changes rather than
  call counts or the existence of any call.
- Match test names and coverage claims to what the assertions actually prove. If a browser-harness
  limitation prevents observation of the claimed outcome, label the test as partial evidence,
  do not count it as complete automated coverage, and record the separate evidence required.
- During controlled-fault verification, confirm that the user-outcome assertion itself fails.
  Failure only in setup, an implementation-detail assertion, or an unrelated assertion does not
  demonstrate an effective regression test.

## Playground publication status

The Playground distinguishes types available in the current Chrome Web Store release from
types implemented on `main` for the next release. The publication-status contract verifies
that native and ARIA-grid dropdowns are labeled **Supported** in the picker, configuration
state, and rendered fixture, with the pending-release note hidden. ARIA-grid support was
verified against the Web Store installation of version 1.0.17 before this status changed.
Future implemented but unpublished types must use **Coming in next release** and add a
corresponding publication-status assertion. Publication status does not change the fixture
contract or development-extension behavior.

## Fixture coverage

A fixture type counts as covered only when it has both an independent playground contract
and at least one extension end-to-end scenario.

| Fixture | Playground contract | Extension behavior |
| --- | --- | --- |
| Native `<select>` | Top-level fixture, an iCIMS-style same-origin iframe contract, and a tall iframe feedback contract | Text, value, fallbacks, formats, errors, supported debug, exact clipboard and normal same-origin iframe handling ([#5](https://github.com/stansult/dropdown-extractor/issues/5)), native Any-two Safe Capture ([#9](https://github.com/stansult/dropdown-extractor/issues/9)), and top-level viewport feedback for normal success, Debug completion, and errors ([#7](https://github.com/stansult/dropdown-extractor/issues/7), [#10](https://github.com/stansult/dropdown-extractor/issues/10)) |
| ARIA listbox | Roles, values, selection, and menu closing | Safe Capture on/off and Any-two debug |
| Searchable ARIA listbox | Public 26-option fixture plus iCIMS-style short/long and tall iframe contracts for trigger, filtering, selection, closing, and vertical placement | Normal same-origin iframe extraction ([#5](https://github.com/stansult/dropdown-extractor/issues/5)), all-frame Any-two payload capture for short/long menus ([#4](https://github.com/stansult/dropdown-extractor/issues/4)), and top-viewport 1/2 and 2/2 feedback ([#10](https://github.com/stansult/dropdown-extractor/issues/10)) |
| ARIA grid dropdown | Grid/row/cell roles, nested text, absent values, selection, and menu closing | Text-only fallback and Safe Capture on |
| GitHub SelectMenu | Checkbox values, checking, summary update, and closing | Checkbox value extraction and combined formatting |
| Dropbox-style menu | `mousedown` selection and menu closing | Safe Capture on/off for `mousedown` behavior |
| AliExpress suggestions | Link text, `href`, ignored competing fields, and opening | `href` value precedence |
| Expedia suggestions | `aria-label`, absent value fields, selection, and closing | `aria-label` precedence and text-only fallback |

This covers 8 of the 18 implemented test fixture families. Fixture families without an
extension scenario are Selectize, React Select, React Select Atlassian, Downshift, MUI,
Radix, Ant Design, Select2, Chosen, and SLM modal. This count measures fixture-family
coverage, not source-code line or branch coverage; no numeric code-coverage instrumentation
is currently configured.

## Extraction option matrix

Global extraction options are tested on representative contracted fixtures. They do not
need to be repeated for every dropdown family because the formatting and fallback logic is
shared. Type-specific tests cover distinct value sources and event models.

| Selection | Coverage |
| --- | --- |
| Text only | Native, ARIA listbox, ARIA grid, and Dropbox |
| Value only | Native |
| Text and value | Native format matrix plus GitHub and AliExpress semantics |
| Neither selected | Error notification and unchanged clipboard |
| Text present, values absent | Expedia and ARIA-grid text-only fallback and notification |
| Text absent, values present | Native values-only fallback and notification |
| Immediate reactivation after an option change | Same-context space-to-dash preference refresh |

When both Text and Value are selected, the native fixture verifies every supported format:

| Format | Example output |
| --- | --- |
| Space | `Alpha 101` |
| Dash | `Alpha - 101` |
| Pipe | `Alpha \| 101` |
| Tab | `Alpha<TAB>101` |
| Line break | `Alpha` followed by `101` on the next line |
| Parentheses | `Alpha (101)` |
| Brackets | `Alpha [101]` |

## Safe Capture and Debug matrix

| Option | Coverage |
| --- | --- |
| Safe Capture on | ARIA listbox, searchable ARIA iframe, grid, GitHub, and Expedia selection effects are blocked with menu/selection state verified; Dropbox `mousedown` selection is blocked; native Any-two allows an intentional selection change and captures the selected option |
| Safe Capture off | ARIA click selection proceeds; Dropbox `mousedown` selection proceeds |
| Debug: Supported dropdown | Native dropdown raw HTML and notification |
| Debug: Any two | ARIA menu-container capture followed by option capture, including short and long searchable menus inside an iframe; native select followed by its changed option at top level and in an iframe; top-viewport 1/2 and 2/2 feedback; plus controlled completion through the uncategorized-element fallback ([#6](https://github.com/stansult/dropdown-extractor/issues/6), [#9](https://github.com/stansult/dropdown-extractor/issues/9), [#10](https://github.com/stansult/dropdown-extractor/issues/10)) |

Normal extraction targets all accessible frames automatically. Debug mode targets only the
top frame unless **Inject Debug mode into all iframes** is enabled. Background unit tests
also verify that a late cancellation from another frame cannot overwrite a successful result.
The asymmetry is intentional: normal extraction should be transparent to users, while
all-frame raw-HTML debugging remains explicit to limit noise and unintended capture from
unrelated embedded content.

Same-origin iframe results include their clipboard payload in the extension's existing
child-to-top feedback message. The top frame writes that payload, so both native and ARIA
iframe regressions can assert the exact clipboard result end to end in bundled Chromium.

The tall native iframe regression places its control more than 1,000 pixels below the iframe
top and scrolls that control into the outer viewport. It requires the exact success message
in the top-level viewport without requiring a duplicate child-frame notification to exist. The native field retains its existing immediate highlight as a secondary cue;
the top-frame toast is the reliable confirmation when Chrome's native picker obscures it.

ARIA and Dropbox are both required for Safe Capture because they use different interaction
events. Debug modes use representative fixtures because the workflows are shared; add
type-specific debug coverage only when a dropdown family has distinct debug behavior.

## Iframe usability coverage

`tests/iframe-regressions.spec.cjs` reproduces the screenshot observations on the actual
configurable Playground, at a 1656 × 908 viewport. They cover the
[iframe sizing defect](https://github.com/stansult/dropdown-extractor/issues/11) and
[duplicated or obstructive feedback](https://github.com/stansult/dropdown-extractor/issues/12).
They remain as permanent regression coverage for the corrected layout and feedback behavior.

The independent contract first checks accessible inherited same-origin documents, native
option text/values and normal selection, and visible preview geometry without the extension.
The sizing matrix then exercises every type marked **Supported** through its applicable
closed → open → closed lifecycle. The regression acceptance criteria are:

- Every closed fixture may use at most 64px of extra iframe height for padding/borders.
  This is a generous compact-content budget, not a fixed iframe height for open content.
- Every open fixture must fit its visible menu inside the iframe, and every openable fixture
  must return to the compact budget after closing.
- The long searchable ARIA list must retain intentional internal scrolling rather than
  expanding the iframe to expose every option row.
- Switching only the rendering context must move the item editor by no more than 2px
  (allowing browser rounding).
- Activation, actual 10-second timeout, and successful extraction must each show exactly
  one visible notification, in the top document, counting across both documents.
- Notifications must not intersect the test dropdown or the preview heading, type/status,
  context label, or Render button. Bounds from child documents are translated and clipped
  into the outer viewport. Geometry is attached to each result for diagnosis.

Each notification test uses independent soft assertions for duplication, dropdown overlap,
and preview-control overlap so one failure cannot hide another. The success test verifies
exact clipboard output through an ordinary Playwright click, proving that the activation
notification does not intercept the dropdown interaction.

The shared real-extension harness is `tests/extension-harness.cjs`; the existing extension
suite retains its serial execution. Older feedback tests require top-level outcome evidence
without requiring the duplicate child notification that these regressions prohibit.

Run the focused coverage with:

```bash
npx playwright test tests/iframe-regressions.spec.cjs
```

## Adding coverage

For a new fixture-dependent extension scenario:

1. Add or update the playground fixture.
2. Add an independent playground contract for the exact DOM, data, interaction target and event,
   and unmodified behavior on which the extension test will depend.
3. Add the extension scenario with assertions at the user-observable boundary, following the
   test-oracle requirements above.
4. Verify with a narrow controlled fault that the user-outcome assertion detects the intended
   failure; restore the implementation and confirm the test passes.
5. Run the relevant spec directly while developing.
6. Run `npm run test:unit` and `npm run test:e2e` before pushing.
7. Update the matrices in this guide only for behavior the assertions fully prove.

For a new supported dropdown family, also follow the canonical
[adding a supported dropdown type process](../docs/adding-dropdown-type.md), which covers
intake, support decisions, public documentation, task evidence, and release states.

For a bug fix, follow the [bug reporting process](../docs/bug-reporting.md): record the
failing regression, fixture contract when applicable, fix commit, full-suite evidence,
and release impact.

## CI

`.github/workflows/playwright.yml` runs unit and Playwright tests on product-impacting pushes
to `main`, pull requests targeting `main`, and manual dispatches. CI retries browser failures
twice, uses two workers, and retains the HTML Playwright report for 30 days. The test job must
pass before the workflow may deploy the playground.

Changes limited to Markdown and `.github/ISSUE_TEMPLATE/` use
`.github/workflows/documentation.yml` instead. That targeted workflow runs
`npm run test:issue-templates`; it does not install Chromium or run unrelated product
regression. Mixed changes trigger both workflows, and workflow, script, package, fixture,
test, or product changes continue to trigger the complete suites.

## Known gaps

- Ten implemented fixture families do not yet have extension end-to-end scenarios.
- The Options page UI, persistence, and reset workflow are not exercised directly in a
  browser; extension tests set stored preferences and verify their runtime effects.
- Explicit cancellation and rearming while already active lack browser-level coverage.
  Expiration notification uniqueness and obstruction are covered by the iframe usability
  regressions above.
- Canvas-rendered, virtualized, Shadow DOM, and cross-origin iframe limitations are not
  represented as successful extraction fixtures.
