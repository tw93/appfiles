# Changelog

Changes to the format while it is a draft at `spec: 0`. Nothing here raises `spec`, since no reader exists yet.

## 2026-11-09

- Published as a public draft.
- The rules moved into [`SPEC.md`](SPEC.md). [`appfiles.md`](appfiles.md) keeps the steps for agents.
- The validator runs without a clone, `npx github:tw93/appfiles appfiles.json`.
- Added the Velopack `id`, the `HTTPStorages/<id>.binarycookies` file, builds that share an ID with different layouts, and hand-assembled bundles.
- A file now leaves out secret-store items, trial records meant to survive a reinstall, apps it generates, and files it only reads.
- `component` now covers files other programs load, such as agent skills.

## 2026-11-08

- First draft: seven kinds, sections for macOS, Windows and Linux, a fixed location in the package, and a validator.
- Two blind tests with coding agents added the Preferences plist for every non-sandboxed Mac app, exact Windows `id` forms per installer, Tauri and Flutter paths, and App Group team prefixes.
