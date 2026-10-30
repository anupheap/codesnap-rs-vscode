# CodeSnap RS for VS Code

A lightweight VS Code adapter for the [CodeSnap Rust renderer](https://github.com/codesnap-rs/codesnap), with a live screenshot preview, save and copy actions, and a camera shutter.

This is an independent adapter, not an official extension from codesnap-rs. The original CodeSnap extension by adpyke is a separate project.

## Install on another machine

**Windows x64 · VS Code 1.85 or newer**

1. Download `codesnap-rs-local-0.2.0-win32-x64.vsix` from the [latest release](https://github.com/anupheap/codesnap-rs-vscode/releases/latest).
2. In VS Code, open the Extensions view (`Ctrl+Shift+X`), select **…**, then **Install from VSIX…**.
3. Choose the downloaded file. If the original **CodeSnap** by adpyke is installed, disable or uninstall it to avoid command conflicts.
4. Run **Developer: Reload Window** from the Command Palette.

The VSIX bundles the native renderer. Rust, Node.js, Python, and a network connection are not required to use the installed extension. This package does not support macOS, Linux, or Windows ARM64.

You can also install from a terminal with the VS Code CLI:

```powershell
code --install-extension .\codesnap-rs-local-0.2.0-win32-x64.vsix
```

## Use

Select code in the editor, right-click the selection, and choose **CodeSnap 📸**. Or open the Command Palette (`Ctrl+Shift+P`) and choose **CodeSnap 📸**.

The preview opens beside the editor and updates after you finish changing the selection. Use **Save PNG**, **Copy image**, or the camera shutter. **Fit** and **100%** change only preview zoom. The shutter follows the `codesnap.shutterAction` setting and saves by default.

The separate **CodeSnap RS: Save Selection as PNG** and **CodeSnap RS: Copy Selection as Image** commands capture directly. Existing shortcuts targeting `codesnap.start` open the preview.

## Performance and appearance

Selection changes are debounced for 300 ms. Only one preview render runs at a time; newer selections cancel stale work. Unchanged previews are cached. Hidden panels pause rendering, and closing the panel removes its listeners. Saving writes the exact preview PNG without another render. Preview updates do not change your clipboard.

Code goes to the native renderer over stdin; PNG data comes back over stdout. The adapter does not send source text to a service, pass it through a shell, or write temporary source files. The renderer creates its standard local theme cache on first use. The bundled configuration uses the local Candy theme and embedded CaskaydiaCove font.

| Setting | Default | Purpose |
| --- | --- | --- |
| `codesnap-rs.scaleFactor` | `2` | Export scale: 1 for smaller images, 2 for sharp images, 3 for higher resolution |
| `codesnap-rs.theme` | `candy` | Rust renderer syntax theme |
| `codesnap.backgroundColor` | `#abb8c3` | Outer background color |
| `codesnap.showLineNumbers` | `true` | Show line numbers |
| `codesnap.realLineNumbers` | `false` | Use source line numbers |
| `codesnap.showWindowControls` | `true` | Show window controls |
| `codesnap.showWindowTitle` | `false` | Show the source filename |
| `codesnap.transparentBackground` | `false` | Transparent outer background |
| `codesnap.shutterAction` | `save` | Shutter action: `save` or `copy` |

The Rust renderer does not automatically inherit your VS Code theme or every language grammar. Legacy CodeSnap CSS padding, shadow, target, and corner settings are not mapped. The bundled `config.json` controls the Rust layout.

## Build from source

The build requires Windows x64, Node.js 20 or newer, Python 3, and PowerShell. There are no npm dependencies.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-native.ps1
npm test
python .\scripts\package.py
```

The prepare script downloads the official CodeSnap CLI v0.14.0 Windows release and verifies its pinned SHA-256 before extracting it. The package script writes the self-contained VSIX to `dist/`. Binaries and generated packages are excluded from Git; the installable VSIX is attached to GitHub releases.

The automated tests cover debounce behavior, stale-render cancellation, panel lifecycle, cached saves, selection handling, Unicode input, error handling, PNG output, and scaling. The native tests require the prepared renderer. Clipboard routing is mocked to preserve the user's clipboard. The preview was also checked in a separate VS Code test profile.

## License and attribution

The adapter is MIT licensed. The bundled native renderer is CodeSnap CLI v0.14.0 by Mist and contributors, also MIT licensed. Its license is preserved in [`licenses/codesnap-MIT.txt`](licenses/codesnap-MIT.txt). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the exact upstream release and archive checksum.
