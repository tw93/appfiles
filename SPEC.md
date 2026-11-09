# appfiles.json Specification

| | |
|---|---|
| Version | `spec: 0` |
| Status | Draft. The format can still change |
| Updated | 2026-11-09 |
| Editor | [Tw93](https://github.com/tw93) |
| Schema | [`appfiles.schema.json`](appfiles.schema.json) |
| Reserved names | [`reserved.json`](reserved.json), part of this specification |
| Conformance tests | [`tests/vectors.json`](tests/vectors.json) |
| Validator | `npx github:tw93/appfiles appfiles.json` |
| Reference reader | `npx github:tw93/appfiles /Applications/Example.app`, which lists and acts on nothing |
| Writing a file | [`appfiles.md`](appfiles.md), the steps for coding agents |

## 1. Introduction

`appfiles.json` is a file an app ships inside its package. It declares which files and system entries the app creates outside its package, and what each one is. Backup, migration, cleanup and uninstall tools read it instead of guessing.

The file describes. It has no scripts and no commands, and it never will.

It does not try to:

- Prove that a path belongs to the app. It is the app's own claim, see section 10.
- Cover older versions. It declares what the current version uses, so leftovers from older releases still need a tool's own knowledge.
- Install, remove or migrate anything. What a tool does with the file is up to the tool, within section 9.
- Replace an uninstaller. It lists what an uninstaller might remove, and tools decide.

## 2. Conformance

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

Sections 2 to 9 and [`reserved.json`](reserved.json) are normative. Section 1, section 10, section 11 and all examples are informative.

A conforming file follows sections 3 to 8. A conforming reader follows section 9. Where a tool and this text disagree, this text is right and the tool has a bug.

Three things help check that, and none of them replaces the text. The schema checks the document's shape. [`validate.mjs`](validate.mjs) is one implementation of the rules a program can check, which excludes most of section 8. [`tests/vectors.json`](tests/vectors.json) lists documents with the verdict every implementation must reach, in any language.

## 3. Location

The file MUST be UTF-8 JSON of at most 1 MiB, named as below. The location is fixed, so a reader checks one path and reads no other configuration.

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
| `$schema` | No | The schema's URL, for editors. Readers ignore it |
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

No `name`, `id`, `path` or `shared_with` value MAY contain a control character, U+0000 to U+001F or U+007F to U+009F, or a bidirectional formatting character, U+200E, U+200F, U+202A to U+202E or U+2066 to U+2069.

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

The prefix MUST be spelled as in this table, so `%AppData%\` is not valid, even though Windows would read it. Comparison below applies to what comes after that check.

A path:

- MUST use literal names, with no other variables, no `.` or `..` and no empty component. Windows paths use backslashes.
- MUST NOT, on Windows, use a spelling Windows reads as another name: a component ending in a dot or space, a short name such as `MICROS~1`, a colon or stream such as `file::$DATA`, one of `<>"|`, or a device name such as `NUL` or `COM1`. Nor MAY it go through a legacy junction, such as `%USERPROFILE%\Application Data` or `%LOCALAPPDATA%\Application Data`. `reserved.json` lists them as protected.
- MAY use `*` only in the last component, beside at least three literal characters: `~/Library/Preferences/ByHost/com.example.notes.*`. `**`, `?`, `[]` and `{}` are not allowed.
- MUST NOT name a shared root itself, such as `~/Library/Caches` or `%APPDATA%`. Paths under a shared root are allowed.
- MUST NOT name, contain or sit inside a protected location, such as `~/.ssh`, `~/Library/Keychains`, `/etc/passwd` or `%USERPROFILE%\NTUSER.DAT`.
- MUST NOT use a wildcard that matches a reserved location or a folder holding one. `~/.ss*` reaches `~/.ssh`, `~/.con*` reaches `~/.config/gh`, `~/Library/Containers/com.*` and `*.apple.*` reach `com.apple.mail`, and on Windows `AppData.*` also matches `AppData`. A pattern closed by its own text, such as `*.com.example.notes`, can only be judged against the disk, which section 9 asks a reader to do.
- MUST be kind `user` when it is inside a personal folder. Such a folder is `user` as a whole, even when it mixes in settings or logs.

[`reserved.json`](reserved.json) lists the shared roots, protected locations and personal folders for each platform. The list is a floor: it stops the obvious mistakes and attacks, and it cannot name every folder that matters.

Paths are compared in Unicode NFC, and on macOS and Windows with Unicode case folding, since default volumes there treat `~/library` and `~/Library` as one folder, and APFS opens `~/.ſsh` as `~/.ssh`. These rules apply to what a path means, not how it is spelled: `%USERPROFILE%\AppData\Roaming` is `%APPDATA%`, and on Linux `~/.config` is `$XDG_CONFIG_HOME`.

A shared root inside a protected family leaves paths under it allowed: `~/Library/Containers/com.apple.*` is protected, while a screen saver keeps its data under `com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/Library`, and an app has its own recent-documents file in `com.apple.sharedfilelist`. Whose file it is stays the app's claim.

A section MUST NOT list the same path twice under this comparison.

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

A registration MUST NOT name something the operating system owns. [`reserved.json`](reserved.json) lists them per type, such as any `com.apple.` label on macOS, the `WinDefend` service on Windows and the `sshd.service` unit on Linux. This list is a floor too.

An `id` MUST NOT have surrounding space. A `launchd` `id` is a bare label, with no `gui/501/` domain, a `systemd-unit` `id` is a bare unit name, and a `path-entry` `id` has no `..`. These rules also apply to what an `id` means, and IDs are compared with Unicode case folding. `sshd` and `sshd@.service` are `sshd.service`, `org.cups.cupsd.plist` is `org.cups.cupsd`, `sudo:amd64` is `sudo`, `Microsoft\Windows\Defrag` is `\Microsoft\Windows\Defrag`, and `C:/Windows` and `%SystemDrive%\Windows` are `C:\Windows`. In a registry key, `WOW6432Node` is ignored, `ControlSet001` is `CurrentControlSet`, and an empty component is not allowed. `HKLM\SAM`, `HKLM\SECURITY`, `...\Control`, `Winlogon`, `Software\Policies` and the executable file classes are refused with everything under them. `...\Services\<name>` is allowed for the app's own service.

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

A file comes from the app it describes, so it is untrusted input. A reader:

- MUST treat the file as adding candidates and labels. It MUST NOT let the file override its own protections or widen what it may touch.
- MUST compare the section's `id` with the identity of the package it came from, and ignore the file on a mismatch. On Windows, any listed value may match the uninstall key name, the `DisplayName` or the Package Family Name.
- MUST reject any entry that breaks section 6, or a registration that section 7 reserves, and keep the valid ones.
- MUST, before acting on a path, check what it resolves to as well as how it is spelled: resolve links at every level and apply section 6 to the target, and apply section 6 to each path a wildcard expands to. An app could make `~/.example` a link to `~/.ssh`, and `c*.mail` matches `com.apple.mail`. A `component` link in a shared bin folder is judged by the rule below instead, since it points into the package by design.
- MUST read the file only if it is a regular file within section 3's size limit, reached without following a link, and MUST NOT act on a file whose package identity it cannot read. A package can put a FIFO or a link out of the package at that path.
- SHOULD escape control characters when it shows text from the file.
- MUST NOT let a kind alone lower the review a path would otherwise get. `cache` is the app's claim, and a file can call someone's data a cache.
- MUST confirm that a registration belongs to the app before changing it, for example that a launchd job's program is inside the package.
- MUST NOT delete a `user` entry by default, and MUST show `data` before deleting it.
- MUST keep a path while any app in `shared_with` is installed, and keep it when any other installed app claims it.
- MUST read the file before running a vendor uninstaller, which may remove it.
- MUST ignore unknown fields, and MUST ignore the whole file if `spec` is higher than it understands.
- MUST NOT treat a missing path as an error.
- MUST remove a `component` in a shared bin folder only when it links into the app's own package.
- MUST, on Windows, resolve `%USERPROFILE%\Documents` and the other personal folders through the known folder API, since they are often redirected.

## 10. Security considerations

The file is written by the party it describes, and a reader runs with the user's rights, often to delete things. Assume the file is wrong or hostile:

| What a bad file could do | What stands in the way |
|---|---|
| Claim another app's folder | Section 9: keep a path any other installed app claims, and the reader's own protections |
| Name keys, mail or system files | Section 6 and `reserved.json`, then the reader's own protections, since the list is a floor |
| Call a database a cache | Section 9: a kind alone never lowers the review |
| Point at a system service | Sections 7 and 9: reserved names, and confirming the registration belongs to the app |
| Reach a reserved folder by case, alias or wildcard | Section 6: comparison rules and the wildcard rule |
| Reach one through a link, or a wildcard only a disk can answer | Section 9: check the target and each expanded path |
| Stall a reader with a crafted pattern, a huge file or a FIFO | Section 6 limits wildcards to `*`, which needs no backtracking engine, section 3 limits the size, and section 9 reads regular files only |
| Rewrite the terminal with escape sequences | Section 4 refuses control characters, and section 9 asks readers to escape what they show |
| Replace the file in an installed package | On macOS the signature seals `Contents/Resources`, so a reader can check it. Elsewhere, treat it like any other file a user can write |
| Stop existing, so a vendor uninstaller removes the evidence | Section 9: read the file first |

The identity check in section 9 ties a file to a package and proves nothing about the paths inside it. A reader that deletes files stays responsible for what it deletes.

## 11. Versioning

`spec` is `0` while the format can still change. It goes up only when an old reader would misread a new file. New optional fields do not raise it. Each draft is tagged in git, such as `spec-0-draft-2026-11-09`, so it can be cited as it stood. Changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).
