# Dropdown Compatibility

This is the canonical public reference for dropdown families and rendering contexts supported
by Dropdown Extractor. **Supported** means available in the current Chrome Web Store release;
**Coming in next release** means implemented and tested on `main` but not yet published.

| Dropdown type | Status |
|--------------|:------:|
| Native `<select>` | Supported |
| ARIA listbox (`role="listbox"`) | Supported |
| ARIA grid dropdown (`role="grid"`) | Supported |
| Selectize | Supported |
| React Select | Supported |
| React Select (Atlassian) | Supported |
| Downshift | Supported |
| MUI Autocomplete | Supported |
| Radix menu | Supported |
| Dropbox-style menu | Supported |
| Ant Design Select | Supported |
| Select2 | Supported |
| Chosen | Supported |
| GitHub SelectMenu | Supported |
| AliExpress search suggestions | Supported |
| Google Search suggestions | Supported |
| Expedia search suggestions | Supported |
| Accessible same-origin iframes | Supported |
| Canvas-rendered / virtualized | Not supported |
| Cross-origin iframes | Not supported |

## Notes and limitations

- Support depends on the dropdown exposing recognizable DOM/ARIA patterns. Custom
  implementations, virtualized or canvas-rendered menus, Shadow DOM, or cross-origin iframes
  may not be detectable.
  - This includes support for Google Search suggestions when they expose a recognizable
    supported structure.
- Normal extraction automatically checks accessible same-origin frames; cross-origin frames
  remain unsupported.
- Ant Design Select, Select2, and Chosen support depends on their default DOM structure;
  customized themes may not be detectable.
- Radix menus are detected through `role="menu"`.
- ARIA grid dropdowns are detected through selectable grid cells; values depend on what the
  cells expose.
- Radix menu items often omit `value` and `data-value`; `href` is used as a fallback value
  when present.
- Dropbox-style menus can close on `mousedown`; Safe capture keeps them open while extracting.
- GitHub SelectMenu items use checkbox values as the extracted value.
- AliExpress search suggestions use `href` as value; `value` and `data-value` are ignored.
- Expedia search suggestions expose text through `aria-label`; `value` and `data-value` are not
  provided.
- MUI options do not expose value properties on DOM nodes; `data-value` is used when available.
- Safe capture does not apply to native `<select>` dropdowns.
- Right-click cannot be used with Selectize dropdowns because they close immediately on
  right-mouse events. This is why context-menu activation is not implemented.

Return to the [project README](../README.md) or open the
[Dropdown Playground](https://dropdown-extractor.stansult.com/) to exercise available fixtures.
