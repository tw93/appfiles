# Changelog

Changes to the format while it is a draft at `spec: 0`. Nothing here raises `spec`, since no reader exists yet.

## 2026-11-09

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
