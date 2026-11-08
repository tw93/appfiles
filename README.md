# appfiles

`appfiles.json` is a small file an app ships inside its package. It says which files and system entries the app creates outside the package, and what each one is: a cache to rebuild, settings to back up, or data the user cannot lose.

Today every backup, migration, cleanup and uninstall tool guesses this for every app, on macOS, Windows and Linux alike.

## Add it to your app

Tell your coding agent:

```text
Read https://raw.githubusercontent.com/tw93/appfiles/main/appfiles.md and add appfiles.json to this app.
```

It reads your source, adds what your framework writes without asking, runs the app to check, and puts the file in your package. Electron, Tauri, Swift, Go, .NET, WinUI, Qt, Flutter and C++ are covered.

## What it looks like

```json
{
  "spec": 0,
  "name": "Example Notes",
  "macos": {
    "id": "com.example.notes",
    "paths": [
      { "path": "~/Library/Application Support/Example Notes", "kind": "data" },
      { "path": "~/Library/Caches/com.example.notes", "kind": "cache" },
      { "path": "~/Library/Preferences/com.example.notes.plist", "kind": "config" },
      { "path": "~/Documents/Example Notes", "kind": "user" }
    ]
  },
  "windows": {
    "id": "ExampleNotes",
    "paths": [
      { "path": "%APPDATA%\\Example Notes", "kind": "data" }
    ],
    "registrations": [
      { "type": "registry", "id": "HKCU\\Software\\Example\\Notes" }
    ]
  }
}
```

| kind | Meaning |
|---|---|
| `user` | Files the user put there on purpose |
| `component` | Code installed outside the package, such as helpers and plug-ins |
| `data` | Lost or hard to get back if deleted |
| `config` | Settings |
| `state` | Window and session state |
| `log` | Logs and crash reports |
| `cache` | Rebuilt by itself |

It is a description. It has no scripts and no commands, and the tools that read it treat it as untrusted input.

## Files

- [`appfiles.md`](appfiles.md): the full format, the steps for agents, and the rules for tools that read it.
- [`appfiles.schema.json`](appfiles.schema.json): JSON Schema for editors and tools.
- [`validate.mjs`](validate.mjs): checks a file against the rules, `node validate.mjs appfiles.json`, no dependencies.

The format is at `spec: 0` and can still change. macOS and Windows are ready to use; Linux is a draft.

## License

MIT
