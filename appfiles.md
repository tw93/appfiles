# appfiles.md

You are adding `appfiles.json` to an app. It is one small file, shipped inside the app's package, that says which files and system entries the app creates outside its package and what each one is. Backup, migration, cleanup and uninstall tools read it instead of guessing.

Work through the steps in order. Do not skip step 6: frameworks and libraries write files the source never mentions.

## Step 1: Identify the app

Find, for each platform the app ships on:

- **macOS**: the bundle identifier (`CFBundleIdentifier`) of the released build. Read it from a built package when you have one. In source, packaging config and release scripts win over a development default. Electron: `appId` in the builder config, or `com.electron.<name>` when none is set.
- **Windows**: the key name under `...\CurrentVersion\Uninstall`, using the table below.
- **Linux**: the desktop file ID, or the Flatpak app ID. This section of the format is a draft.

| Windows package | `id` |
|---|---|
| MSIX | Package Family Name |
| Inno Setup | `AppId` plus `_is1`, with the script's `{{` written as `{` |
| electron-builder NSIS | `nsis.guid`, or the UUID v5 of `appId` in namespace `50e065bc-3134-11e6-9bab-38c9862bdaf3` |
| Other NSIS | The key name the script writes |
| Squirrel | The package ID |
| MSI with a fixed product code | The product code |
| MSI with a new product code per release, or no installer | The `DisplayName` without a version |

A Windows `id` may be a list when builds differ, such as per-user and per-machine, or x64 and ARM64. Do not guess: if you cannot work a value out, use the `DisplayName` and say so in your handoff.

Also find the framework, the product name the framework appends to paths, and any override (`setPath`, `appDirectoriesOverride`, a custom data directory setting). If history shows an older release used another ID or folder name that users may still have, list those paths too.

A fork also uses what it inherits. Follow the upstream code until each path is resolved, then write it with the fork's own names.

## Step 2: Read the paths from source

Search the code for the calls below, then resolve each to a literal path. Write what the app really uses, not the framework default, when the two differ.

| Stack | Search for | Resolves to |
|---|---|---|
| Electron | `app.getPath`, `setPath`, `setName`, `userData`, `sessionData`, `setAppLogsPath`, `setAsDefaultProtocolClient` | `<name>` is `setName`, else `productName`, else `package.json`'s `name`. `userData` is `~/Library/Application Support/<name>`, `%APPDATA%\<name>`, `~/.config/<name>`. Logs are `~/Library/Logs/<name>` on macOS and `<userData>\logs` on Windows |
| Tauri | `app_config_dir`, `app_data_dir`, `app_local_data_dir`, `app_cache_dir`, `app_log_dir`, `identifier` | Each is the base directory (Rust row) plus the bundle identifier. Logs are `~/Library/Logs/<identifier>` on macOS and `<local data>/<identifier>/logs` elsewhere |
| Rust | `dirs::`, `directories::`, `home_dir`, `XDG_` | See the base directory table below |
| Swift, Objective-C | `UserDefaults`, `FileManager`, `applicationSupportDirectory`, `cachesDirectory`, `URLCache`, `WKWebView`, `NSHomeDirectory`, `containerURL`, `com.apple.security.app-sandbox` | See step 3. The entitlement decides which macOS list applies |
| Go | `os.UserConfigDir`, `os.UserCacheDir`, `os.UserHomeDir` | Config: `~/Library/Application Support`, `%AppData%`, `$XDG_CONFIG_HOME`. Cache: `~/Library/Caches`, `%LocalAppData%`, `$XDG_CACHE_HOME` |
| C#, .NET, WPF, WinUI | `Environment.SpecialFolder`, `Registry.CurrentUser`, `ApplicationData.Current`, `userDataFolder`, `Settings.settings` | `ApplicationData` is `%APPDATA%`, `LocalApplicationData` is `%LOCALAPPDATA%`, `CommonApplicationData` is `%PROGRAMDATA%` |
| Qt | `QStandardPaths`, `QSettings`, `IniFormat`, `setOrganizationName`, `setOrganizationDomain`, `setApplicationName` | `<app>` below is `<org>/<app>` when an organization name is set. `AppDataLocation`: `~/Library/Application Support/<app>`, `%APPDATA%\<app>`, `~/.local/share/<app>`. `AppLocalDataLocation` on Windows: `%LOCALAPPDATA%\<app>`. `CacheLocation`: `~/Library/Caches/<app>`, `%LOCALAPPDATA%\<app>\cache`, `~/.cache/<app>`. `QSettings`: `~/Library/Preferences/com.<org>.<app>.plist`, `HKCU\Software\<org>\<app>`, `~/.config/<org>/<app>.conf`. With `IniFormat`: `~/.config/<org>/<app>.ini` on macOS and Linux, `%APPDATA%\<org>\<app>.ini` on Windows |
| Flutter | `path_provider`, `getApplicationSupportDirectory`, `getApplicationCacheDirectory`, `shared_preferences` | Print the resolved paths on each platform in step 6. Do not guess them |
| C, C++ | `SHGetKnownFolderPath`, `%APPDATA%`, `getenv`, `RegCreateKey`, `NSSearchPath`, `XDG_` | Whatever the code builds |
| Any | hard-coded `~/.name`, `.config/`, `.local/`, `AppData`, `ProgramData`, `homedir`, `HOME`, `USERPROFILE`, `XDG_`, `HKEY_`, `HKCU`, `HKLM` | Literal. `~/.config/x` built by hand is `%USERPROFILE%\.config\x` on Windows |

Base directories for the Rust `dirs` crate:

| Function | macOS | Windows | Linux |
|---|---|---|---|
| `config_dir`, `data_dir` | `~/Library/Application Support` | `%APPDATA%` | `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME` |
| `config_local_dir`, `data_local_dir` | `~/Library/Application Support` | `%LOCALAPPDATA%` | `$XDG_CONFIG_HOME`, `$XDG_DATA_HOME` |
| `cache_dir` | `~/Library/Caches` | `%LOCALAPPDATA%` | `$XDG_CACHE_HOME` |
| `preference_dir` | `~/Library/Preferences` | `%APPDATA%` | `$XDG_CONFIG_HOME` |
| `state_dir` | none | none | `$XDG_STATE_HOME` |
| `runtime_dir` | none | none | `$XDG_RUNTIME_DIR`. Most apps fall back to a folder under `data_dir` or `~/.local/share` |
| `home_dir` | `~` | `%USERPROFILE%` | `~` |

Do not stop at the first profile folder. Apps often keep a second one that ignores the framework: a dot folder in the home directory, a custom XDG helper used on macOS and Windows too, or a default folder for the user's documents. Search every platform for it.

Check the docs and the config loader too. Terminals and developer tools often read `~/.config/<name>` or `~/.<name>.toml` on macOS, and the user creates that file, not the app. List it when the app documents it.

Include what only some users turn on: optional features, plug-ins, integrations. Paths may not exist on a given machine, and that is fine.

Also search for the app's command-line tools, shell integration and browser native messaging hosts. Each is a file outside the package.

## Step 3: Add what the platform writes for you

These appear without any code in the app, so you will not find them by searching the source. Add them from this list. Replace `<id>` with the bundle identifier.

**Every macOS app with a window that is not sandboxed**

Add these three whatever the stack, Electron, Qt, Flutter and Rust included, even if the source never mentions them:

- `~/Library/Preferences/<id>.plist`, kind `config`. AppKit writes it. Three of four apps in Homebrew's catalog that list their files have one.
- `~/Library/Saved Application State/<id>.savedState`, kind `state`.
- `~/Library/Caches/<id>`, kind `cache`.

Add these when the condition holds:

- `~/Library/HTTPStorages/<id>`, kind `cache`. `URLSession` writes it, and Sparkle and Squirrel.Mac auto-update use `URLSession`. Add it unless you can see the app never does.
- `~/Library/Cookies/<id>.binarycookies`, kind `data`, in the same case when the app signs in.
- `~/Library/WebKit/<id>`, kind `data`, when it uses `WKWebView`. Tauri on macOS does. Electron does not.

**Sandboxed macOS apps**

A sandboxed app has `com.apple.security.app-sandbox` set to true in its entitlements.

- `~/Library/Containers/<id>`, kind `data`. Everything the sandboxed app writes is inside it, so do not also list the paths above. An extension in the bundle has its own container under its own bundle ID.
- `~/Library/Group Containers/<group id>`, kind `data`, for each App Group in the entitlements.
- `~/Library/Application Scripts/<id>`, kind `state`, for the app and each extension.

**Electron**

- `~/Library/Preferences/<id>.helper.plist`, kind `config`.
- `~/Library/Caches/<id>.ShipIt` and `~/Library/Preferences/ByHost/<id>.ShipIt.*`, kind `cache`, with Squirrel.Mac auto-update.
- `~/Library/Caches/<name>-updater` and `%LOCALAPPDATA%\<name>-updater`, kind `cache`, with `electron-updater`. The folder is `updaterCacheDirName` in the built `app-update.yml`: `package.json`'s `name` in lower case, without the `/`, so `@org/app` becomes `@orgapp-updater`.
- `~/Library/Application Support/<name>` holds a Chromium profile with `Cache`, `Code Cache` and `GPUCache` inside. List the folder as `data` and add `<folder>/Cache`, `<folder>/Code Cache` and `<folder>/GPUCache` as `cache`.

**Windows**

- MSIX: writes to `AppData` go to the package's private location and Windows removes them at uninstall. List only what the app writes elsewhere, such as under `%USERPROFILE%`, or with virtualization turned off.
- Unpackaged: everything under `%APPDATA%`, `%LOCALAPPDATA%` and `%PROGRAMDATA%`, plus registry keys. WebView2 stores its folder wherever the app says, and beside the exe as `<exe>.WebView2` by default.
- Skip the install folder and its shortcuts. Tools find those through the uninstall key. List everything else, even what the official uninstaller removes, since backup tools read this file too and a portable build has no uninstaller.

**Linux (draft)**

- Flatpak: `~/.var/app/<id>`, kind `data`, and nothing under `~/.config` unless the app has permission to write there.

## Step 4: Give each path a kind

Take the first line that fits.

| Question | kind |
|---|---|
| Did the user put these files there on purpose, in a folder they can see? Projects, exports, `~/Documents/<name>`, `~/Music/<name>`, a config file the user wrote by hand | `user` |
| Is it code installed outside the package? Helper tools, audio plug-ins, drivers, launch agent plists, command-line shims, native messaging manifests | `component` |
| Would the user lose something by deleting it, or have to do something to get it back? Databases, chat history, sign-ins, and things the user chose to download or install: models, extensions, plug-ins, virtual environments, offline content | `data` |
| Is it settings the app wrote? | `config` |
| Is it session or window state that is harmless to lose? | `state` |
| Is it logs or crash reports? | `log` |
| Will the app rebuild it by itself, with no user action? Runtimes and language servers it fetches by itself on next use count | `cache` |

When unsure between two kinds, take the one higher in the table. Calling a database `cache` can destroy someone's data. Calling a cache `data` only wastes some space.

List the top folder the app itself creates and alone owns: `~/Example`, not only `~/Example/projects`. Add an entry for a subfolder only if its kind differs from the folder's; the longest matching path wins. Temporary sockets and logs in a mostly runtime folder make the folder `state`, unless it also holds something from the table above.

A single file you name in a shared folder is fine, such as `~/.local/bin/example` or `%LOCALAPPDATA%\Microsoft\WindowsApps\example.cmd`.

**Do not list**

- Anything inside the app's own package.
- A parent folder shared by the vendor's other products. List `~/Library/Application Support/Example/Notes`, never `~/Library/Application Support/Example`.
- What the OS keeps about the app: privacy permissions, recent document lists, LaunchServices records.
- A location the user picked in the app at runtime. You can list the default one, as `user`.
- Temporary folders such as `$TMPDIR` and `%TEMP%`. The OS clears them.
- A file the app only edits but does not own, such as `~/.zshrc`.
- Paths beside the app's exe in portable mode. They are inside its own folder.

If another app reads or writes a path too, name that app's ID in `shared_with`, or the tool's plain name when it has no ID. Tools keep the path while any of those apps is installed.

A folder in `~/Documents` and the other personal folders is `user` as a whole, even when it mixes in settings or logs. Tools keep it, so do not split it. On Windows, write the default location; tools resolve a redirected Documents folder themselves.

## Step 5: List system entries

Add one `registrations` entry for each thing the app registers that is not a file, even when the official uninstaller removes it. Read the installer script, the builder config, the entitlements and the launch code.

| Platform | `type` | `id` |
|---|---|---|
| macOS | `launchd` | Job label |
| macOS | `login-item` | Bundle ID of the login item, or its name |
| macOS | `pkg` | Package receipt ID from `pkgutil --pkgs` |
| macOS | `system-extension` | Extension bundle ID |
| macOS | `kext` | Kernel extension bundle ID |
| Windows | `registry` | Full key, starting with `HKCU\` or `HKLM\`. URL protocols, file associations and shell extensions are registry keys too. `HKCR\x` is a merged view: write `HKCU\Software\Classes\x` or `HKLM\SOFTWARE\Classes\x`, whichever the install scope writes. `QSettings` on Windows writes `HKCU\Software\<org>\<app>` |
| Windows | `run-value` | Value name under `...\CurrentVersion\Run` |
| Windows | `service` | Service name |
| Windows | `scheduled-task` | Task path |
| Windows | `firewall-rule` | Rule name. Search installers for `netsh advfirewall` and `FirewallRule`. An app that listens on a network port also gets a rule when the user accepts the Windows prompt, named after the exe's file description |
| Windows | `path-entry` | The folder added to `PATH` |
| Windows | `package` | Package Family Name of a sparse or helper MSIX package |
| Linux | `systemd-unit` | Unit name |
| Linux | `package` | Package name |

Files that belong with an entry, such as a launchd plist in `~/Library/LaunchAgents`, still go in `paths`, as `component`.

## Step 6: Run the app and compare

Static reading misses things. On each platform you can reach, start from a clean profile, or a new account or VM, and do this.

macOS and Linux:

```sh
touch /tmp/appfiles.marker
# Open the app, sign in if it has accounts, use its main feature, quit it.
find ~ -newer /tmp/appfiles.marker -not -path '*/Library/Mobile Documents/*' 2>/dev/null
```

Windows, in PowerShell:

```powershell
$marker = Get-Date
# Open the app, sign in if it has accounts, use its main feature, quit it.
Get-ChildItem $env:APPDATA, $env:LOCALAPPDATA, $env:PROGRAMDATA, $env:USERPROFILE -Recurse -Depth 3 -Force -ErrorAction SilentlyContinue |
  Where-Object LastWriteTime -gt $marker | Select-Object FullName
```

Every new path that belongs to the app must be covered by an entry. Ignore what clearly belongs to other processes.

If you cannot run the app, say so in your handoff and list the platforms you did not check.

## Step 7: Write the file

Name it `appfiles.json`. Keep one file for all platforms and include only the platforms the app ships on. A channel build with its own identifier, such as a beta, ships its own file with its own values.

```json
{
  "spec": 0,
  "name": "Example Notes",
  "macos": {
    "id": "com.example.notes",
    "paths": [
      { "path": "~/Library/Application Support/Example Notes", "kind": "data" },
      { "path": "~/Library/Application Support/Example Notes/Cache", "kind": "cache" },
      { "path": "~/Library/Caches/com.example.notes", "kind": "cache" },
      { "path": "~/Library/Logs/Example Notes", "kind": "log" },
      { "path": "~/Library/Preferences/com.example.notes.plist", "kind": "config" },
      { "path": "~/Library/Saved Application State/com.example.notes.savedState", "kind": "state" },
      { "path": "~/.example-notes", "kind": "data", "shared_with": ["com.example.editor"] },
      { "path": "~/Documents/Example Notes", "kind": "user" },
      { "path": "~/Library/LaunchAgents/com.example.notes.helper.plist", "kind": "component" }
    ],
    "registrations": [
      { "type": "launchd", "id": "com.example.notes.helper" }
    ]
  },
  "windows": {
    "id": "ExampleNotes",
    "paths": [
      { "path": "%APPDATA%\\Example Notes", "kind": "data" },
      { "path": "%LOCALAPPDATA%\\example-notes-updater", "kind": "cache" }
    ],
    "registrations": [
      { "type": "registry", "id": "HKCU\\Software\\Classes\\example-notes" },
      { "type": "scheduled-task", "id": "ExampleNotesUpdate" }
    ]
  },
  "linux": {
    "id": "com.example.Notes",
    "paths": [
      { "path": "$XDG_CONFIG_HOME/example-notes", "kind": "data" }
    ]
  }
}
```

Path rules:

- **macOS** paths start with `~/` or `/Library/`. A command-line link is also allowed as `/usr/local/bin/<name>`, kind `component`.
- **Windows** paths start with `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMDATA%` or `%USERPROFILE%`.
- **Linux** paths start with `~/`, `$XDG_CONFIG_HOME/`, `$XDG_DATA_HOME/`, `$XDG_STATE_HOME/`, `$XDG_CACHE_HOME/`, `/etc/` or `/var/lib/`.
- Write literal names. A path has no other variables and no `..`.
- `*` is allowed only in the last component, after at least three literal characters: `~/Library/Preferences/ByHost/com.example.notes.*`.
- A path never names a shared root itself, such as `~/Library/Caches` or `%APPDATA%`.
- `~/Documents`, `~/Desktop`, `~/Downloads`, `~/Movies`, `~/Music` and `~/Pictures` hold `user` entries only.

The file has no scripts and no commands, and it never will. It describes. It does not instruct.

## Step 8: Put it in the package

The location is fixed, so tools check one path and read no other configuration.

| Package | Location |
|---|---|
| macOS app | `<App>.app/Contents/Resources/appfiles.json` |
| Windows unpackaged | Beside the main `.exe` |
| Windows MSIX | Package root |
| Linux deb, rpm | `/usr/share/appfiles/<id>.json` |
| Linux AppImage | `usr/share/appfiles/<id>.json` inside the AppDir |
| Linux Flatpak | `/app/share/appfiles/<id>.json` |

How to get it there:

- **Xcode**: add the file to the target's Copy Bundle Resources phase.
- **electron-builder**: `mac.extraResources` for macOS and `win.extraFiles` for Windows. `extraResources` on Windows lands in `resources\`, which is the wrong folder.
- **Electron Forge**: `packagerConfig.extraResource` for macOS. On Windows, add a `postPackage` hook that copies the file beside the exe.
- **Tauri**: `bundle.resources` in `tauri.conf.json`, then confirm the file's location in the built package.
- **.NET**: `<Content Include="appfiles.json" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />`.
- **NSIS, Inno Setup, WiX**: install it beside the exe.

Open the built package and confirm the file is at that exact path. On macOS, do this before signing, since the signature seals `Contents/Resources`.

## Step 9: Validate

Run this and fix every error:

```sh
node validate.mjs path/to/appfiles.json
```

`validate.mjs` is in this repository, needs no dependencies, and needs Node 18 or later. `appfiles.schema.json` is here too for editors and other tools.

Tell the user which platforms you ran in step 6 and which you only read from source.

## For tools that read this file

An `appfiles.json` comes from the app it describes, so it is untrusted input. A bad one could name another app's folder or a user's keys. Tools that read it must follow these rules.

- It adds candidates and labels. It never overrides a tool's own protections, and it never widens what a tool may touch.
- Compare the section's `id` with the identity of the package it came from, and ignore the file on a mismatch. On Windows, any listed value may match the uninstall key name, the `DisplayName` or the Package Family Name.
- Reject any entry that breaks the path rules above, and keep the valid ones.
- Never delete a `user` entry by default. Show `data` before deleting it.
- Keep a path while any app in `shared_with` is installed, and keep it when any other installed app claims it.
- Read the file before running a vendor uninstaller, which may remove it.
- Ignore unknown fields. Ignore the whole file if `spec` is higher than you understand.
- Paths may not exist. An app that never used a feature never wrote its folder.
- Remove a `component` in a shared bin folder only when it links into the app's own package.
- On Windows, resolve `%USERPROFILE%\Documents` and the other personal folders through the known folder API, since they are often redirected.

`spec` is `0` while the format can still change. It goes up only when an old reader would misread a new file. New optional fields do not raise it.
