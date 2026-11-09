# appfiles.json Specification

| | |
|---|---|
| Version | `spec: 0` |
| Status | Draft. The format can still change |
| Updated | 2026-11-09 |
| Editor | [Tw93](https://github.com/tw93) |
| Schema | [`appfiles.schema.json`](appfiles.schema.json) |
| Validator | `npx github:tw93/appfiles appfiles.json` |
| Writing a file | [`appfiles.md`](appfiles.md), the steps for coding agents |

## 1. Introduction

`appfiles.json` is a file an app ships inside its package. It declares which files and system entries the app creates outside its package, and what each one is. Backup, migration, cleanup and uninstall tools read it instead of guessing.

The file describes. It has no scripts and no commands, and it never will.

## 2. Conformance

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A conforming file passes the validator with no errors. A conforming reader follows section 9. The schema checks the document's shape only; the validator also checks the path rules in section 6, and it is the reference for the shared roots they refuse.

## 3. Location

The file MUST be UTF-8 JSON, named as below. The location is fixed, so a reader checks one path and reads no other configuration.

| Package | Location |
|---|---|
| macOS app | `<App>.app/Contents/Resources/appfiles.json` |
| Windows unpackaged | `appfiles.json` beside the main `.exe` |
| Windows MSIX | `appfiles.json` at the package root |
| Linux deb, rpm | `/usr/share/appfiles/<id>.json` |
| Linux AppImage | `usr/share/appfiles/<id>.json` inside the AppDir |
| Linux Flatpak | `/app/share/appfiles/<id>.json` |

An app SHOULD keep one file for all its platforms and include only the platforms it ships on. A channel build with its own identifier, such as a beta, ships its own file with its own values. Builds that share an identifier but lay out files differently, such as a direct download and a sandboxed App Store build, share one file that lists both layouts.

## 4. Document

```json
{
  "spec": 0,
  "name": "Example Notes",
  "macos": {
    "id": "com.example.notes",
    "paths": [
      { "path": "~/Library/Application Support/Example Notes", "kind": "data" },
      { "path": "~/Library/Application Support/Example Notes/Cache", "kind": "cache" },
      { "path": "~/.example-notes", "kind": "data", "shared_with": ["com.example.editor"] }
    ],
    "registrations": [
      { "type": "login-item", "id": "com.example.notes.helper" }
    ]
  }
}
```

| Field | Required | Value |
|---|---|---|
| `spec` | Yes | The format version, `0` |
| `name` | Yes | The app's name |
| `macos`, `windows`, `linux` | At least one | A platform section |

A platform section:

| Field | Required | Value |
|---|---|---|
| `id` | Yes | The app's identity on that platform, below |
| `paths` | Yes | A list of path entries, which may be empty |
| `registrations` | No | A list of registrations, section 7 |

| Platform | `id` |
|---|---|
| macOS | The bundle identifier of the released build. An app with no bundle uses its launchd label, or else its name |
| Windows | The key name under `...\CurrentVersion\Uninstall`, or a list of them when builds differ. An app with no stable key uses its `DisplayName` without a version |
| Linux | The desktop file ID, or the Flatpak app ID. This section of the format is a draft |

A path entry:

| Field | Required | Value |
|---|---|---|
| `path` | Yes | A path that follows section 6 |
| `kind` | Yes | One of the kinds in section 5 |
| `shared_with` | No | A non-empty list of the other apps that read or write this path, by ID, or by plain name for a tool with no ID |

A path MAY not exist on a given machine. An app that never used a feature never wrote its folder.

## 5. Kinds

A path has exactly one kind. An author takes the first line that fits, so when two kinds could apply, the one higher in this table wins. Calling a database `cache` can destroy someone's data. Calling a cache `data` only wastes some space.

| Kind | Meaning |
|---|---|
| `user` | Files the user put there on purpose, in a folder they can see |
| `component` | Code or files other programs load, installed outside the package, such as helpers, plug-ins, drivers, launch agents and agent skills |
| `data` | Lost or hard to get back if deleted, including sign-ins and things the user chose to download |
| `config` | Settings the app wrote |
| `state` | Session or window state that is harmless to lose |
| `log` | Logs and crash reports |
| `cache` | Rebuilt by the app with no user action |

A path covers everything under it. An entry for a subfolder overrides its parent, and the longest matching path wins.

## 6. Path rules

A path MUST start with one of these:

| Platform | Prefix |
|---|---|
| macOS | `~/`, `/Library/`, or `/usr/local/bin/` for one named link of kind `component` |
| Windows | `%APPDATA%\`, `%LOCALAPPDATA%\`, `%PROGRAMDATA%\`, `%USERPROFILE%\` |
| Linux | `~/`, `$XDG_CONFIG_HOME/`, `$XDG_DATA_HOME/`, `$XDG_STATE_HOME/`, `$XDG_CACHE_HOME/`, `/etc/`, `/var/lib/` |

A path:

- MUST use literal names, with no other variables, no `.` or `..` and no empty component. Windows paths use backslashes.
- MAY use `*` only in the last component, beside at least three literal characters: `~/Library/Preferences/ByHost/com.example.notes.*`. `**`, `?`, `[]` and `{}` are not allowed.
- MUST NOT name a shared root itself, such as `~/Library/Caches` or `%APPDATA%`.
- MUST NOT be inside a credentials folder, such as `~/.ssh`.
- MUST be kind `user` when it is inside a personal folder: `~/Documents`, `~/Desktop`, `~/Downloads`, `~/Movies`, `~/Music`, `~/Pictures`, or `Videos` on Windows and Linux. Such a folder is `user` as a whole, even when it mixes in settings or logs.

A section MUST NOT list the same path twice. Windows paths compare without case.

Something the app writes that cannot follow these rules, such as a file in `/etc` on macOS or under `%ProgramFiles%`, stays out of the file.

## 7. Registrations

A registration is something the app registers that is not a file, listed even when the official uninstaller removes it. Files that belong with one, such as a launchd plist in `~/Library/LaunchAgents`, still go in `paths`, as `component`.

| Platform | `type` | `id` |
|---|---|---|
| macOS | `launchd` | Job label |
| macOS | `login-item` | Bundle ID of the login item, or its name |
| macOS | `pkg` | Package receipt ID from `pkgutil --pkgs` |
| macOS | `system-extension` | Extension bundle ID |
| macOS | `kext` | Kernel extension bundle ID |
| Windows | `registry` | Full key, starting with `HKCU\` or `HKLM\`. URL protocols, file associations and shell extensions are registry keys too. `HKCR\x` is a merged view: write `HKCU\Software\Classes\x` or `HKLM\SOFTWARE\Classes\x`, whichever the install scope writes. `QSettings` on Windows writes `HKCU\Software\<org>\<app>`. A key shared across software, such as `HKCU\Software\Microsoft`, is not allowed |
| Windows | `run-value` | Value name under `...\CurrentVersion\Run` |
| Windows | `service` | Service name |
| Windows | `scheduled-task` | Task path |
| Windows | `firewall-rule` | Rule name. An app that listens on a network port also gets a rule when the user accepts the Windows prompt, named after the exe's file description |
| Windows | `path-entry` | The folder added to `PATH`, using the default install location |
| Windows | `package` | Package Family Name of a sparse or helper MSIX package |
| Linux | `systemd-unit` | Unit name |
| Linux | `package` | Package name |

## 8. What a file does not list

A file MUST NOT list:

- Anything inside the app's own package.
- A parent folder shared by the vendor's other products. List `~/Library/Application Support/Example/Notes`, never `~/Library/Application Support/Example`.
- What the OS keeps about the app: privacy permissions, recent document lists, LaunchServices records.
- A location the user picked in the app at runtime. It MAY list the default one, as `user`, unless that is a personal folder itself, such as `~/Movies`.
- Temporary folders such as `$TMPDIR` and `%TEMP%`. The OS clears them.
- A file the app only reads or edits but does not own, such as `~/.zshrc`.
- Paths beside the app's exe in portable mode. They are inside its own folder.
- Items in the Keychain, Credential Manager or another secret store. They are not files.
- A license or trial record the app keeps on purpose so that it survives a reinstall. Tools should not reset it for the user. A record inside a folder the file lists is covered by that folder and goes with it, so one that must survive lives outside every listed path.
- Apps this app generates, when it is a tool that makes other apps. Each has its own ID and ships its own file.

## 9. Readers

A file comes from the app it describes, so it is untrusted input. A bad one could name another app's folder or a user's keys. A reader:

- MUST treat the file as adding candidates and labels. It MUST NOT let the file override its own protections or widen what it may touch.
- MUST compare the section's `id` with the identity of the package it came from, and ignore the file on a mismatch. On Windows, any listed value may match the uninstall key name, the `DisplayName` or the Package Family Name.
- MUST reject any entry that breaks section 6, and keep the valid ones.
- MUST NOT delete a `user` entry by default, and MUST show `data` before deleting it.
- MUST keep a path while any app in `shared_with` is installed, and keep it when any other installed app claims it.
- MUST read the file before running a vendor uninstaller, which may remove it.
- MUST ignore unknown fields, and MUST ignore the whole file if `spec` is higher than it understands.
- MUST NOT treat a missing path as an error.
- MUST remove a `component` in a shared bin folder only when it links into the app's own package.
- MUST, on Windows, resolve `%USERPROFILE%\Documents` and the other personal folders through the known folder API, since they are often redirected.

## 10. Versioning

`spec` is `0` while the format can still change. It goes up only when an old reader would misread a new file. New optional fields do not raise it. Changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).
