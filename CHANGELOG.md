# Changelog

This file records notable user-facing changes to Dropdown Extractor. Test, CI,
documentation, and internal refactoring changes are omitted unless they affect users.

## Unreleased

### Fixed

- Same-origin iframe extraction now shows one unobstructed top-level notification instead of
  duplicating feedback inside the child frame.
  ([#12](https://github.com/stansult/dropdown-extractor/issues/12))

## 1.0.17 — 2026-11-04

### Added

- Added support for ARIA grid dropdowns with selectable grid cells.
  ([#3](https://github.com/stansult/dropdown-extractor/issues/3))

### Fixed

- Any two debug capture now accepts long dropdown menus instead of rejecting them based on
  their combined text length.
  ([#4](https://github.com/stansult/dropdown-extractor/issues/4))
- Normal extraction now detects supported dropdowns inside accessible same-origin iframes.
  ([#5](https://github.com/stansult/dropdown-extractor/issues/5))
- Successful extraction inside a same-origin iframe now shows its confirmation in the visible
  top-level page instead of leaving it offscreen inside the iframe.
  ([#7](https://github.com/stansult/dropdown-extractor/issues/7))
- Any two debug capture now completes instead of crashing when its fallback captures the same
  uncategorized element twice.
  ([#6](https://github.com/stansult/dropdown-extractor/issues/6))
- Debug progress, Debug completion, and extraction errors from a same-origin iframe now show
  their feedback in the visible top-level page.
  ([#10](https://github.com/stansult/dropdown-extractor/issues/10))
- Any two debug capture now records native dropdowns as the menu container and the newly
  selected native option as the second element, including inside same-origin iframes.
  ([#9](https://github.com/stansult/dropdown-extractor/issues/9))
- Clipboard results from same-origin iframe extraction are now written through the top-level
  page for consistent native-dropdown and Debug capture behavior.

## 1.0.16 — 2026-09-15

### Fixed

- Safe Capture off now allows normal selection in dropdowns that select on `mousedown`.
  ([#1](https://github.com/stansult/dropdown-extractor/issues/1))

## 1.0.15 — 2026-09-15

Changelog tracking begins with this published version; earlier changes are not reconstructed.
