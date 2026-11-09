<div align="center">
  <h1>appfiles</h1>
  <p><b>An open spec for the files an app leaves on your machine, and what each one is.</b></p>
  <p>English · <a href="README_CN.md">中文</a></p>
  <p>
    <a href="SPEC.md">Specification</a> ·
    <a href="appfiles.md">Agent steps</a> ·
    <a href="appfiles.schema.json">Schema</a> ·
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

**You want to check a file.** No clone and no dependencies, Node 18 or later:

```bash
npx github:tw93/appfiles appfiles.json
```

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
- **Untrusted by design**: a bad file could name another app's folder, so readers check its identity against the package and keep their own protections
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

Added it to yours? Open an issue or PR and it goes in this table. Nothing reads the format yet, and Mole is meant to be the first reader.

## Status

`spec: 0` is a draft and the format can still change. How it has been checked so far:

- **Blind tests**: coding agents given only the steps found 61 of 73 known paths in the first round and 52 of 61 on ten new apps in the second, and the steps were fixed after each. The nine misses in the second round look like older versions' leftovers
- **Real runs on macOS**: Kaku, MiaoYan, Mole and Pake were opened on a test Mac and quit without signing in, and all 46 paths they wrote under their own names were covered. That Mac had run these apps before, so it was not a clean profile
- **Windows**: compared with a long-used install, without a clean run
- **Linux**: not run yet, and that section of the format stays a draft

The gaps these turned up are in the [changelog](CHANGELOG.md). Hit something the format cannot express? Please [open an issue](https://github.com/tw93/appfiles/issues).

## Background

I make [Mole](https://github.com/tw93/Mole), a cleaner for Mac and Windows, and to get its uninstaller right I tested more than 800 apps. Every one of them kept its files differently, so I wanted a format that lets an app say where its files are and what they are.

Then I saw [auth.md](https://github.com/workos/auth.md), a file written for agents to follow, and thought the same shape fits here: a developer no longer has to learn a format, they tell their agent to read the steps. The name took a few rounds, since nobody who makes an app wants the word uninstall inside it.

I don't expect this to spread quickly, so I started with my own apps.

## Support

- If appfiles helped you, give it a star, [share it](https://x.com/intent/tweet?url=https://github.com/tw93/appfiles&text=appfiles%20-%20An%20open%20spec%20for%20the%20files%20an%20app%20leaves%20on%20your%20machine.), or open an issue or PR
- I have two cats, TangYuan and Coke, and if appfiles has been helpful to you, you can feed them <a href="https://cats.tw93.fun?name=appfiles" target="_blank">canned food 🥩</a>

These lovely people already did 🐱

<a href="https://cats.tw93.fun?name=appfiles"><img src="https://raw.githubusercontent.com/tw93/sponsors/main/assets/sponsors.svg" width="1000" loading="lazy" /></a>

## License

MIT License. Please feel free to use and contribute to the development.
