# Dropdown Extractor (Chrome Extension)

**Dropdown Extractor** is a Chrome extension that copies items from dropdown lists into your clipboard.

It supports:
- native HTML <select> dropdowns
- Selectize-based dropdowns
- ARIA listbox dropdowns (role="listbox" / role="option")

The extracted items are copied as plain text, one per line.

---

## How it works

1. Click the extension icon  
2. The extractor becomes **armed**  
3. Open a dropdown on the page  
4. Click one of its options  
5. All dropdown items are copied to the clipboard  

The extractor automatically cancels itself after a short timeout if nothing is clicked.

---

## What gets extracted

You can choose what to copy via **Extension Options**:

- **Item text** — what you see on screen  
- **Item value** — the underlying value  
- **Both** — copied as text<TAB>value (paste-friendly)

---

## Supported dropdown types

| Dropdown type | Supported |
|--------------|-----------|
| Native <select> | Yes |
| Selectize | Yes |
| ARIA listbox | Yes |
| Right-click / context menu on Selectize | No |

Note: Right-click does not work on Selectize dropdowns because they close immediately on right-mouse events. This is a framework limitation.

---

## Installing as a Chrome extension (development mode)

1. Clone or download this repository
2. Open Chrome and go to: chrome://extensions
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the project folder
6. Pin the extension (optional)

The extension is now installed and ready to use.

---

## Extension options

To configure what gets extracted:

1. Open chrome://extensions
2. Find **Dropdown Extractor**
3. Click **Details**
4. Click **Extension options**
5. Choose whether to extract:
   - text
   - value
   - or both

Changes take effect immediately.

---

## Limitations

- Right-click (context menu) cannot be used with Selectize dropdowns, that’s why current implementation was chosen instead
- Canvas-rendered or virtualized dropdowns are not supported
- Cross-origin iframes cannot be accessed

---

## License

MIT. See `LICENSE`.
