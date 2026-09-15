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

Both commands must pass before every push. Useful focused and diagnostic commands include:

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

### Extension end-to-end tests

`tests/extension.spec.cjs` launches Playwright's bundled Chromium with the repository root
loaded as the real unpacked extension. Each test uses a temporary browser profile and grants
clipboard permission only to the local playground at `http://127.0.0.1:4173`.

Tests invoke the toolbar action through Chrome DevTools Protocol `Extensions.triggerAction`.
This exercises toolbar activation, popup, background service worker, `activeTab` permission,
content-script injection, page interaction, clipboard output, and notifications. Extension
tests run serially because they operate through extension state and persistent browser
contexts; playground contracts may run in parallel.

The activation helper marks any existing armed toast before triggering the toolbar action
and waits for a newly created armed toast. This prevents a fading toast from a previous
activation from making repeated-activation tests continue before reinjection is ready.

## Fixture coverage

A fixture type counts as covered only when it has both an independent playground contract
and at least one extension end-to-end scenario.

| Fixture | Playground contract | Extension behavior |
| --- | --- | --- |
| Native `<select>` | Option text/value, missing text, normal selection | Text, value, fallbacks, formats, errors, and supported debug |
| ARIA listbox | Roles, values, selection, and menu closing | Safe Capture on/off and Any-two debug |
| GitHub SelectMenu | Checkbox values, checking, summary update, and closing | Checkbox value extraction and combined formatting |
| Dropbox-style menu | `mousedown` selection and menu closing | Safe Capture on/off for `mousedown` behavior |
| AliExpress suggestions | Link text, `href`, ignored competing fields, and opening | `href` value precedence |
| Expedia suggestions | `aria-label`, absent value fields, selection, and closing | `aria-label` precedence and text-only fallback |

This covers 6 of the 16 supported playground fixture families. Fixture families without an
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
| Text only | Native, ARIA, and Dropbox |
| Value only | Native |
| Text and value | Native format matrix plus GitHub and AliExpress semantics |
| Neither selected | Error notification and unchanged clipboard |
| Text present, values absent | Expedia text-only fallback and notification |
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
| Safe Capture on | ARIA click selection is blocked; Dropbox `mousedown` selection is blocked |
| Safe Capture off | ARIA click selection proceeds; Dropbox `mousedown` selection proceeds |
| Debug: Supported dropdown | Native dropdown raw HTML and notification |
| Debug: Any two | ARIA menu-container capture followed by option capture |

ARIA and Dropbox are both required for Safe Capture because they use different interaction
events. Debug modes use representative fixtures because the workflows are shared; add
type-specific debug coverage only when a dropdown family has distinct debug behavior.

## Adding coverage

For a new fixture-dependent extension scenario:

1. Add or update the playground fixture.
2. Add an independent playground contract for the exact DOM, data, and unmodified behavior
   on which the extension test will depend.
3. Add the extension scenario with exact clipboard and page-side-effect assertions.
4. Run the relevant spec directly while developing.
5. Run `npm run test:unit` and `npm run test:e2e` before pushing.
6. Update the matrices in this guide when coverage changes.

For a bug fix, follow the [bug reporting process](../docs/bug-reporting.md): record the
failing regression, fixture contract when applicable, fix commit, full-suite evidence,
and release impact.

## CI

`.github/workflows/playwright.yml` runs unit and Playwright tests on pushes to `main`, pull
requests targeting `main`, and manual dispatches. CI retries browser failures twice, uses
two workers, and retains the HTML Playwright report for 30 days. The test job must pass
before the workflow may deploy the playground.

## Known gaps

- Ten supported fixture families do not yet have extension end-to-end scenarios.
- The Options page UI, persistence, and reset workflow are not exercised directly in a
  browser; extension tests set stored preferences and verify their runtime effects.
- Expiration, explicit cancellation, rearming while already active, and all-frame debug
  behavior lack browser-level coverage.
- Canvas-rendered, virtualized, Shadow DOM, and cross-origin iframe limitations are not
  represented as successful extraction fixtures.
