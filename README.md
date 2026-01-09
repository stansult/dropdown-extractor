# Dropdown Extractor (Chrome Extension)

**Dropdown Extractor** is a Chrome extension that copies items from dropdown lists into your clipboard.

It supports many popular [types of dropboxes](#dropdown-types). Go to any website and try it on any dropbox. You can also try it on our test page: [Dropdown Playground](https://dropdown-extractor.stansult.com)

## How it works

1. Click the extension icon → extractor becomes **armed**  
1. Open a dropdown on the page  
1. Click one of its options
1. All dropdown items are copied to the clipboard  

The extractor automatically expires after a short timeout if no dropdown items are extracted.

### What gets extracted

You can choose what to copy via **[Extension Options](#extension-options)**:

- **Item text** — what you see on screen  
- **Item value** — the underlying value  
- **Both** — copied using a configurable format (tab, space, dash, etc.)

### Safe capture

If enabled in **[Extension Options](#extension-options)**, Safe capture prevents option clicks from triggering actions while extracting. This lets you copy dropdown items without selecting an option. Safe capture does not apply to native `<select>` dropdowns.

### Debug mode

Debug mode is intended for troubleshooting, and has two modes:
- **supported dropdowns** — for debugging
- **any two elements** — for inspecting unsupported dropdowns for potentially adding support

In debug mode, extension copies raw HTML to your clipboard so you can inspect the menu structure.

### Extension Options

To open Extension Options, right-click the extension button and select Options.

### Dropdown types

| Dropdown type | Supported |
|--------------|:----------:|
| Native `<select>` | Yes |
| ARIA listbox (`role="listbox"`) | Yes |
| Selectize | Yes |
| React Select | Yes |
| React Select (Atlassian variant) | Yes |
| Downshift-style | Yes |
| MUI Autocomplete-style | Yes |
| Radix menu (role="menu") | Yes |
| Ant Design Select-style | Yes |
| Select2-style | Yes |
| Chosen-style | Yes |
| Canvas-rendered / virtualized | No |
| Cross-origin iframes | No |

#### Notes / Limitations

- Support depends on the dropdown exposing recognizable DOM/ARIA patterns. Custom implementations, virtualized or canvas-rendered menus, Shadow DOM, or cross-origin iframes may not be detectable.
- AntD/Select2/Chosen support depends on their default DOM structure; customized themes may not be detectable.
- Radix menus often omit value/data-value; href is used as a fallback value when present.
- MUI options don’t expose value properties on DOM nodes; use data-value if available.
- Safe capture does not apply to native `<select>` dropdowns.
- Right-click (context menu) cannot be used with Selectize dropdowns because they close immediately on right-mouse events. That’s why right-click wasn’t implemented.
- Cross-origin iframes cannot be accessed.


## How to Install

### Public version

Install public version from Chrome Web Store:<a href="https://chrome.google.com/webstore/detail/dropdown-extractor/gbocefdbkfckcdbdhmaipklcfhgmeghm"><img src="icon-inline.svg" width="15" hspace="6" alt="Dropdown Extractor extension in Chrome Web Store">Dropdown Extractor</a>

### Development mode

Follow these steps to load the unpacked extension in Chrome:

1. Clone or download this repository
2. Open Chrome and go to: chrome://extensions
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the project folder
6. Pin the extension (optional)

#### Packaging for Chrome Web Store

Use these commands to build uploadable zip archives:

- To create a ZIP for upload: `npm run package`

- This runs a clean step and generates `dist/dropdown-extractor-<version>.zip`.

- To bump the patch version and package in one step: `npm run package:patch`

#### Dropdown Playground

To test the extension, you can use [Dropdown Playground](https://dropdown-extractor.stansult.com). It lets you:

- pick a dropdown type and value source
- generate items (text/value/data-value) and mark missing fields
- render a mock dropdown and extract from it
- copy a snapshot (text/JSON) to easily share a repro setup

## License

MIT. See `LICENSE`.
