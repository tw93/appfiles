# Examples

Three made-up apps, each a complete file you can start from. A test keeps them valid.

| Example | Shows |
|---|---|
| [`native-mac-app`](native-mac-app/appfiles.json) | A Swift app that is not sandboxed: what the platform writes for you, a `WKWebView`, a login item, and a folder in `~/Documents` |
| [`electron-app`](electron-app/appfiles.json) | One file for three platforms: the Chromium caches inside a `data` folder, auto-update, a URL protocol |
| [`command-line-tool`](command-line-tool/appfiles.json) | No bundle, so the ID is a launchd label or a name: a dot folder, a config the user writes by hand, a shim and a background job. Section 3 does not yet say where a Mac tool with no bundle keeps its file |

To see what a reader makes of one, give it the folder:

```bash
npx github:tw93/appfiles examples/electron-app
```
