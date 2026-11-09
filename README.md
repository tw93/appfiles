<div align="center">
  <h1>appfiles.json</h1>
  <p><b>An open spec for the files an app leaves on your machine, and what each one is.</b></p>
  <p>English · <a href="README_CN.md">中文</a></p>
  <p>
    <a href="SPEC.md">Specification</a> ·
    <a href="appfiles.md">Agent steps</a> ·
    <a href="appfiles.schema.json">Schema</a> ·
    <a href="reserved.json">Reserved names</a> ·
    <a href="tests/vectors.json">Conformance tests</a> ·
    <a href="CHANGELOG.md">Changelog</a>
  </p>
  <a href="SPEC.md"><img src="https://img.shields.io/badge/spec-0%20draft-555?style=flat-square" alt="Spec 0, draft"></a>
  <a href="https://github.com/tw93/appfiles/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/tw93/appfiles/test.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/tw93/appfiles/stargazers"><img src="https://img.shields.io/github/stars/tw93/appfiles?style=flat-square" alt="Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://x.com/HiTw93"><img src="https://img.shields.io/badge/follow-Tw93-red?style=flat-square&logo=x" alt="Twitter"></a>
</div>

<br/>

<p align="center">
  <img src="assets/appfiles.svg" alt="An appfiles.json listing an app's paths, each with one of seven kinds" width="1000" />
</p>

## Why

Every backup, migration, cleanup and uninstall tool guesses which files belong to an app, and whether losing them matters. The closest thing to an answer today is Homebrew's `zap` lists, written by hand one app at a time, for the Mac only, and a cache and a chat history look the same in them.

The people who know the answer are the ones who made the app. `appfiles.json` lets them write it down once, inside the package, for macOS, Windows and Linux, and any tool can read it.

## Get Started

**You make an app.** Tell your coding agent:

```text
Read https://raw.githubusercontent.com/tw93/appfiles/main/appfiles.md and add appfiles.json to this app.
```

It reads your source, adds what your framework writes without asking, runs the app to check, and puts the file in your package. Electron, Tauri, Swift, Go, .NET, WinUI, Qt, Flutter and C++ are covered.

**You make a tool that reads apps.** [Section 9 of the spec](SPEC.md#9-readers) has the rules, starting with this one: the file comes from the app it describes, so it can add candidates and labels but never widen what your tool may touch.

[`reserved.json`](reserved.json) and [`tests/vectors.json`](tests/vectors.json) are plain data, so a reader in Swift, C# or anything else uses the same list and passes the same cases.

**You want to check a file or see an app.** No clone and no dependencies, Node 18 or later:

```bash
npx github:tw93/appfiles appfiles.json
npx github:tw93/appfiles /Applications/Example.app
```

Give it a file and it validates it. Give it an app and it is the reference reader: it checks the file against the package's identity, rejects bad entries and lists the rest with whether each exists on this machine. Checking that identity takes macOS, since it asks the system's `plutil`. Give it a folder holding the file and it does the same without the identity check. It only reads and acts on nothing, so it does not follow links or expand wildcards, which a tool that deletes things must do first.

## The Format

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

Seven kinds, ordered from what must never be lost to what rebuilds itself. When two could apply, the higher one wins.

| Kind | Meaning |
|---|---|
| `user` | Files the user put there on purpose |
| `component` | Code installed outside the package, such as helpers and plug-ins |
| `data` | Lost or hard to get back if deleted |
| `config` | Settings |
| `state` | Window and session state |
| `log` | Logs and crash reports |
| `cache` | Rebuilt by itself |

## Design

- **It only describes**: no scripts and no commands, so reading a file can never run anything
- **Untrusted by design**: a bad file could name another app's folder or call a database a cache, so readers check its identity against the package and keep their own protections, and [a shared list](reserved.json) refuses the obvious keys, mail and system files
- **One fixed location**: `Contents/Resources/appfiles.json` on the Mac, beside the exe on Windows, so a tool checks one path and needs no index
- **One file, every platform**: an app that ships on three systems keeps one source
- **Written by agents, checked by running**: frameworks write files the source never mentions, so the steps end with running the app and comparing

## Who Ships It

These apps carry the file in their source, and it reaches users with each app's next release:

| App | Platforms | File |
|---|---|---|
| [Kaku](https://github.com/tw93/Kaku) | macOS | [`appfiles.json`](https://github.com/tw93/Kaku/blob/main/assets/macos/Kaku.app/Contents/Resources/appfiles.json) |
| [MiaoYan](https://github.com/tw93/MiaoYan) | macOS | [`appfiles.json`](https://github.com/tw93/MiaoYan/blob/main/Resources/appfiles.json) |
| [Mole](https://mole.fit) | macOS, Windows | In the app package |
| [Pake](https://pake.run) | macOS, Windows, Linux | In the app package |
| [Hina](https://hina.day) | macOS | In the app package |
| [Yado](https://yado.house) | macOS | In the app package |

Added it to yours? Open an issue or PR and it goes in this table. Nothing reads the format yet, and Mole is meant to be the first reader.

## Status

`spec: 0` is a draft and the format can still change. How it has been checked so far:

- **Blind tests**: coding agents given only the steps found 61 of 73 known paths in the first round and 52 of 61 on ten new apps in the second, and the steps were fixed after each. The nine misses in the second round look like older versions' leftovers
- **Real runs on macOS**: Kaku, MiaoYan, Mole and Pake were opened on a test Mac and quit without signing in, and all 46 paths they wrote under their own names were covered. That Mac had run these apps before, so it was not a clean profile
- **Windows**: compared with a long-used install, without a clean run
- **Linux**: not run yet, and that section of the format stays a draft

The path rules were also run against all 21,544 unique paths in Homebrew's `zap` lists, which is how they stopped refusing third-party files inside Apple's recent-documents folder. Of the paths the previous rules accepted, 17 are now refused on purpose: 15 in Apple's own folders and 2 that name a whole shared plug-in folder. The gaps these turned up are in the [changelog](CHANGELOG.md). Hit something the format cannot express? Please [open an issue](https://github.com/tw93/appfiles/issues).

## Background

I make [Mole](https://github.com/tw93/Mole), a cleaner for Mac and Windows, and to get its uninstaller right I tested more than 800 apps. Every one of them kept its files differently, so I wanted a format that lets an app say where its files are and what they are.

A developer should not have to learn a format for this, so the steps are written for coding agents, and they only tell their agent to read them. The name took a few rounds, since nobody who makes an app wants the word uninstall inside it.

I don't expect this to spread quickly, so I started with my own apps.

## License

MIT License. Please feel free to use and contribute to the development.
