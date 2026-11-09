# Changelog

Changes to the format while it is a draft at `spec: 0`. Nothing here raises `spec`, since no reader exists yet.

## 2026-11-09

- A macOS tool with no bundle now has a location, `<prefix>/share/appfiles/<id>.json`, the same shape as Linux. `<prefix>` is found after resolving the tool's links, because Homebrew's shared `share` folder holds only links. A reader takes the tool's identity from the formula or package that installed it, never from the file name alone.
- A reader no longer selects a path by default only because the file lists it. It needs the first folder of the path to be the package's own name or to start with the section's `id`, or its own knowledge, so a file calling `~/Library/Application Support/Google/Chrome` a cache is shown but not ticked. A blind test found a reader built from section 9 ticking exactly that. Cases are in [`tests/selection.json`](tests/selection.json).
- `/Users/Shared/` is an allowed start on macOS, the counterpart of `%PROGRAMDATA%`. Homebrew's `zap` lists hold 73 paths there.
- `/Library/Developer`, `~/Library/Autosave Information`, `~/Library/Services` and `/etc/default` are shared roots, along with folders many apps share: `/Library/Input Methods`, `/Library/QuickLook`, browser native messaging folders, `~/Library/Logs/DiagnosticReports`, `%LOCALAPPDATA%\CrashDumps` and others. Of the 21,688 paths in Homebrew's `zap` lists, two name one, each a crash folder shared by every app using that library.
- Folders that sync, `~/Library/Mobile Documents`, `~/Library/CloudStorage` and `%USERPROFILE%\OneDrive`, are personal folders, so what is inside them must be `user`.
- The steps now look for system components, crash reporters and what an installer writes. The run in step 6 starts before installing, and compares `/Library`, `/Users/Shared`, packages, launchd jobs, services, tasks, firewall rules and registry keys, not only the home folder.
- Section 9 now says what a claim covers, that a reader removes a link and never its target, that a target on another volume does not fail the prefix rule, and that a reader which cannot tell whether an app named in `shared_with` is installed keeps the path.
- A file may add folders older releases used. On Linux a package type with its own ID ships its own file. The steps cover `MyDocuments`, an app that is its own login item, a `run-value` name the framework picks, an Inno `AppId` with no braces, App Groups outside the sandbox, portable mode, and values added to shared registry keys. These came from three more blind tests.
- Registry keys other software shares are refused: file types and URL schemes such as `.com`, `.lnk`, `.txt` and `http` with everything under them, and containers such as `Directory\shell` and `CLSID`, where the key an app adds inside stays allowed. The names were checked against a real Windows 11 machine, which holds hundreds of `.ext` keys under `HKCU\Software\Classes`.
- Paths now compare in NFC and, on macOS and Windows, with Unicode case folding, so `~/library/caches`, `~/.SSH/id_rsa` and `~/.ſsh` are refused. Aliases count too: `%USERPROFILE%\AppData\Roaming` is `%APPDATA%`, and on Linux `~/.config` is `$XDG_CONFIG_HOME`.
- A wildcard can no longer reach a reserved location or a folder holding one, such as `~/.ss*` or `~/.con*`.
- Text values refuse control and bidirectional formatting characters, the file is limited to 1 MiB, and Windows paths refuse the spellings it reads as another name, such as `.ssh.`, `MICROS~1`, `file::$DATA`, `NUL` and legacy junctions like `Application Data`.
- Added protected locations (`~/Library/Keychains`, `/etc/passwd`, `%USERPROFILE%\NTUSER.DAT` and others) and reserved registrations (`com.apple.*`, `WinDefend`, `sshd.service` and others). The names moved out of the validator into [`reserved.json`](reserved.json), which is part of the spec.
- Registration IDs compare by what they mean, so `ControlSet001`, `WOW6432Node`, `sshd` without its suffix and `sudo:amd64` reach the same names.
- Linux drop-in folders such as `/etc/sudoers.d` are shared roots, so an app's own file inside one is allowed.
- Readers must not let a kind alone lower the review a path gets, must confirm a registration belongs to the app before changing it, and must check link targets and wildcard expansions before acting on a path.
- This text now outranks any tool. Added out-of-scope notes, security considerations and [conformance tests](tests/vectors.json).
- Added the read-only reference reader, `npx github:tw93/appfiles Example.app`.
- The schema has an `$id`, and a file may carry `$schema`.
- Published as a public draft.
- The rules moved into [`SPEC.md`](SPEC.md). [`appfiles.md`](appfiles.md) keeps the steps for agents.
- The validator runs without a clone, `npx github:tw93/appfiles appfiles.json`.
- Added the Velopack `id`, the `HTTPStorages/<id>.binarycookies` file, builds that share an ID with different layouts, and hand-assembled bundles.
- A file now leaves out secret-store items, trial records meant to survive a reinstall, apps it generates, and files it only reads.
- `component` now covers files other programs load, such as agent skills.

## 2026-11-08

- First draft: seven kinds, sections for macOS, Windows and Linux, a fixed location in the package, and a validator.
- Two blind tests with coding agents added the Preferences plist for every non-sandboxed Mac app, exact Windows `id` forms per installer, Tauri and Flutter paths, and App Group team prefixes.
