# Changelog

This file records notable user-facing changes to Dropdown Extractor. Test, CI,
documentation, and internal refactoring changes are omitted unless they affect users.

## Unreleased

### Added

- Added support for ARIA grid dropdowns with selectable grid cells.
  ([#3](https://github.com/stansult/dropdown-extractor/issues/3))

### Fixed

- Any two debug capture now accepts long dropdown menus instead of rejecting them based on
  their combined text length.
  ([#4](https://github.com/stansult/dropdown-extractor/issues/4))
- Normal extraction now detects supported dropdowns inside accessible same-origin iframes.
  ([#5](https://github.com/stansult/dropdown-extractor/issues/5))

## 1.0.16 — 2026-09-15

### Fixed

- Safe Capture off now allows normal selection in dropdowns that select on `mousedown`.
  ([#1](https://github.com/stansult/dropdown-extractor/issues/1))

## 1.0.15 — 2026-09-15

Changelog tracking begins with this published version; earlier changes are not reconstructed.
