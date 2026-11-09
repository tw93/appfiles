# appfiles.md

You are adding `appfiles.json` to an app. It is one small file, shipped inside the app's package, that says which files and system entries the app creates outside its package and what each one is. Backup, migration, cleanup and uninstall tools read it instead of guessing.

Read the format first: https://raw.githubusercontent.com/tw93/appfiles/main/SPEC.md. It holds the fields, kinds, path rules and registration types these steps refer to.

Work through the steps in order. Do not skip step 6: frameworks and libraries write files the source never mentions.

## Step 1: Identify the app

Find, for each platform the app ships on:

- **macOS**: the bundle identifier (`CFBundleIdentifier`) of the released build. Read it from a built package when you have one. In source, packaging config and release scripts win over a development default. Electron: `appId` in the builder config, or `com.electron.<name>` when none is set. A command-line app or daemon with no bundle uses its launchd label, or else its name.
- **Windows**: the key name under `...\CurrentVersion\Uninstall`, using the table below.
- **Linux**: the desktop file ID, or the Flatpak app ID. A package type with its own ID ships its own file with that `id`. This section of the format is a draft.

| Windows package | `id` |
|---|---|
| MSIX | Package Family Name |
| Inno Setup | `AppId` plus `_is1`, with the script's `{{` written as `{`. An `AppId` with no braces stays without them. With no `AppId`, Inno uses `AppName` |
| Tauri NSIS | The product name |
| electron-builder NSIS | `nsis.guid`, or the UUID v5 of `appId` in namespace `50e065bc-3134-11e6-9bab-38c9862bdaf3` |
| Other NSIS | The key name the script writes |
| Squirrel | The package ID |
| Velopack | The pack ID, `--packId`. The install folder is `%LOCALAPPDATA%\<pack ID>` |
| MSI with a fixed product code | The product code |
| MSI with a new product code per release, or no installer | The `DisplayName` without a version |

A Windows `id` may be a list when builds differ, such as per-user and per-machine, or x64 and ARM64. Do not guess: if you cannot work a value out, use the `DisplayName` and say so in your handoff.

Also find the framework, the product name the framework appends to paths, and any override (`setPath`, `appDirectoriesOverride`, a custom data directory setting). If history shows an older release used another ID or folder name that users may still have, list those paths too.

A fork also uses what it inherits. Follow the upstream code until each path is resolved, then write it with the fork's own names.

## Step 2: Read the paths from source

Search the code for the calls below, then resolve each to a literal path. Write what the app really uses, not the framework default, when the two differ.

| Stack | Search for | Resolves to |
|---|---|---|
| Electron | `app.getPath`, `setPath`, `setName`, `userData`, `sessionData`, `setAppLogsPath`, `setAsDefaultProtocolClient` | `<name>` is `setName`, else `productName`, else `name`, from the `package.json` shipped in the app, which is `app/package.json` in a two-package layout. `userData` is `~/Library/Application Support/<name>`, `%APPDATA%\<name>`, `~/.config/<name>`. Logs are `~/Library/Logs/<name>` on macOS and `<userData>\logs` on Windows |
| Tauri | `app_config_dir`, `app_data_dir`, `app_local_data_dir`, `app_cache_dir`, `app_log_dir`, `identifier` | Each is the base directory (Rust row) plus the bundle identifier. Logs are `~/Library/Logs/<identifier>` on macOS and `<local data>/<identifier>/logs` elsewhere. WebView2 keeps its data in `%LOCALAPPDATA%\<identifier>`. The NSIS installer writes the registry key `Software\<publisher>\<product>`, where `<publisher>` defaults to the identifier's second segment |
| Rust | `dirs::`, `directories::`, `home_dir`, `XDG_` | See the base directory table below |
| Swift, Objective-C | `UserDefaults`, `FileManager`, `applicationSupportDirectory`, `cachesDirectory`, `URLCache`, `WKWebView`, `NSHomeDirectory`, `containerURL`, `forUbiquityContainerIdentifier`, `com.apple.security.app-sandbox` | See step 3. The entitlement decides which macOS list applies |
| Go | `os.UserConfigDir`, `os.UserCacheDir`, `os.UserHomeDir` | Config: `~/Library/Application Support`, `%APPDATA%`, `$XDG_CONFIG_HOME`. Cache: `~/Library/Caches`, `%LOCALAPPDATA%`, `$XDG_CACHE_HOME` |
| C#, .NET, WPF, WinUI | `Environment.SpecialFolder`, `Registry.CurrentUser`, `ApplicationData.Current`, `userDataFolder`, `Settings.settings` | `ApplicationData` is `%APPDATA%`, `LocalApplicationData` is `%LOCALAPPDATA%`, `CommonApplicationData` is `%PROGRAMDATA%`, `MyDocuments` is `%USERPROFILE%\Documents`, `UserProfile` is `%USERPROFILE%` |
| Qt | `QStandardPaths`, `QSettings`, `IniFormat`, `setOrganizationName`, `setOrganizationDomain`, `setApplicationName` | `<app>` below is `<org>/<app>` when an organization name is set. `AppDataLocation`: `~/Library/Application Support/<app>`, `%APPDATA%\<app>`, `~/.local/share/<app>`. `AppLocalDataLocation` on Windows: `%LOCALAPPDATA%\<app>`. `CacheLocation`: `~/Library/Caches/<app>`, `%LOCALAPPDATA%\<app>\cache`, `~/.cache/<app>`. `QSettings`: `~/Library/Preferences/com.<org>.<app>.plist`, `HKCU\Software\<org>\<app>`, `~/.config/<org>/<app>.conf`. With `IniFormat`: `~/.config/<org>/<app>.ini` on macOS and Linux, `%APPDATA%\<org>\<app>.ini` on Windows |
| Flutter | `path_provider`, `getApplicationSupportDirectory`, `getApplicationCacheDirectory`, `shared_preferences` | Support: `~/Library/Application Support/<id>`, `%APPDATA%\<CompanyName>\<ProductName>` from `windows/runner/Runner.rc`, `$XDG_DATA_HOME/<id>`. Confirm them in step 6 |
| macOS helpers and installers | `SMJobBless`, `SMAppService`, `launchctl`, `pkgbuild`, `productbuild`, `postinstall`, `/Library/`, `/Users/Shared` | `SMJobBless` installs `/Library/LaunchDaemons/<label>.plist` and `/Library/PrivilegedHelperTools/<label>`, each `component`. Read every script the package runs, since they write what the app's own code never mentions |
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

Also search for the app's command-line tools, shell integration and browser native messaging hosts. Each is a file outside the package. Native messaging manifests are one named `component` file per browser, with no `shared_with`.

## Step 3: Add what the platform writes for you

These appear without any code in the app, so you will not find them by searching the source. Add them from this list. Replace `<id>` with the bundle identifier.

**Every macOS app with a window that is not sandboxed**

Add these three whatever the stack, Electron, Qt, Flutter and Rust included, even if the source never mentions them:

- `~/Library/Preferences/<id>.plist`, kind `config`. AppKit writes it. Three of four apps in Homebrew's catalog that list their files have one.
- `~/Library/Saved Application State/<id>.savedState`, kind `state`.
- `~/Library/Caches/<id>`, kind `cache`.

Add these when the condition holds:

- `~/Library/HTTPStorages/<id>` and `~/Library/HTTPStorages/<id>.binarycookies`, kind `cache`. `URLSession` writes them, and Sparkle and Squirrel.Mac auto-update use `URLSession`. Add them unless you can see the app never does.
- `~/Library/Cookies/<id>.binarycookies`, kind `data`, in the same case when the app has accounts.
- `~/Library/WebKit/<id>`, kind `data`, when it uses `WKWebView`. Tauri on macOS does. Electron does not.

**Sandboxed macOS apps**

A sandboxed app has `com.apple.security.app-sandbox` set to true in its entitlements.

- `~/Library/Containers/<id>`, kind `data`. Everything the sandboxed app writes is inside it, so do not also list the paths above. An extension in the bundle has its own container under its own bundle ID.
- `~/Library/Group Containers/<group id>`, kind `data`, for each App Group in the entitlements. An app that is not sandboxed needs this too when its source calls `containerURL(forSecurityApplicationGroupIdentifier:)`. Replace `$(TeamIdentifierPrefix)` with the real team ID from the signing config. If you cannot find it, leave the entry out and say so in your handoff.
- `~/Library/Application Scripts/<id>`, kind `state`, for the app and each extension.

**System components on macOS**

List each named item the app or its installer puts in one of these, as `component`, in `/Library` or `~/Library`, whichever it uses. The folder itself is shared, so never list that: `Input Methods/<name>.app`, `QuickLook/<name>.qlgenerator`, `Spotlight/<name>.mdimporter`, `Audio/Plug-Ins/Components`, `HAL`, `VST` and `VST3`, `CoreMediaIO/Plug-Ins/DAL/<name>.plugin`, `Printers/<vendor>/<product>`, `PreferencePanes/<name>.prefPane`, `Screen Savers/<name>.saver`. A system extension is a registration, section 7, since macOS keeps its files.

**Crash reports**

These appear only after a crash, so step 6 will not show them. Add them from this list, as `log`, with `<name>` as the process writes it:

- `~/Library/Caches/SentryCrash/<name>` with Sentry, `~/Library/Caches/KSCrash/<name>` or `~/Library/Caches/KSCrashReports/<name>` with KSCrash, and `~/Library/Caches/com.plausiblelabs.crashreporter.data/<id>` with PLCrashReporter.
- `~/Library/Application Support/CrashReporter/<name>_*.plist` and `~/Library/Logs/DiagnosticReports/<name>*`, which macOS writes for any app.
- `%LOCALAPPDATA%\CrashDumps\<exe>*`, which Windows writes for any app when dumps are turned on.

**Electron**

- `~/Library/Preferences/<id>.helper.plist`, kind `config`.
- `~/Library/Caches/<id>.ShipIt` and `~/Library/Preferences/ByHost/<id>.ShipIt.*`, kind `cache`, with Squirrel.Mac auto-update.
- `~/Library/Caches/<name>-updater` and `%LOCALAPPDATA%\<name>-updater`, kind `cache`, with `electron-updater`. The folder is `updaterCacheDirName` in the built `app-update.yml`: `package.json`'s `name` in lower case, without the `/`, so `@org/app` becomes `@orgapp-updater`.
- `~/Library/Application Support/<name>` holds a Chromium profile with `Cache`, `Code Cache` and `GPUCache` inside. List the folder as `data`, add `<folder>/Cache`, `<folder>/Code Cache`, `<folder>/GPUCache`, `<folder>/DawnGraphiteCache` and `<folder>/DawnWebGPUCache` as `cache`, and `<folder>/Crashpad` as `log`.

**Windows**

- MSIX: writes to `AppData` go to the package's private location and Windows removes them at uninstall. List only what the app writes elsewhere, such as under `%USERPROFILE%`, or with virtualization turned off.
- Unpackaged: everything under `%APPDATA%`, `%LOCALAPPDATA%` and `%PROGRAMDATA%`, plus registry keys. WebView2 stores its folder wherever the app says, and beside the exe as `<exe>.WebView2` by default.
- Skip the install folder and its shortcuts. Tools find those through the uninstall key. List everything else, even what the official uninstaller removes, since backup tools read this file too and a portable build has no uninstaller. What portable mode writes beside the exe is inside its own folder, so that stays out.

**Linux (draft)**

- Flatpak: `~/.var/app/<id>`, kind `data`, and nothing under `~/.config` unless the app has permission to write there.

## Step 4: Give each path a kind

Take the first line that fits.

| Question | kind |
|---|---|
| Did the user put these files there on purpose, in a folder they can see? Projects, exports, `~/Documents/<name>`, `~/Music/<name>`, a config file the user wrote by hand | `user` |
| Is it code, or files other programs load, installed outside the package? Helper tools, audio plug-ins, drivers, launch agent plists, command-line shims, native messaging manifests, agent skills | `component` |
| Would the user lose something by deleting it, or have to do something to get it back? Databases, chat history, sign-ins, and things the user chose to download or install: models, extensions, plug-ins, virtual environments, offline content | `data` |
| Is it settings the app wrote? | `config` |
| Is it session or window state that is harmless to lose? | `state` |
| Is it logs or crash reports? | `log` |
| Will the app rebuild it by itself, with no user action? Runtimes and language servers it fetches by itself on next use count | `cache` |

When unsure between two kinds, take the one higher in the table. Calling a database `cache` can destroy someone's data. Calling a cache `data` only wastes some space.

List the top folder the app itself creates and alone owns: `~/Example`, not only `~/Example/projects`. Add an entry for a subfolder only if its kind differs from the folder's; the longest matching path wins. Temporary sockets and logs in a mostly runtime folder make the folder `state`, unless it also holds something from the table above.

A single file you name in a shared folder is fine, such as `~/.local/bin/example` or `%LOCALAPPDATA%\Microsoft\WindowsApps\example.cmd`.

Leave out everything in section 8 of the spec, including the package itself, shared vendor folders, secret stores and trial records.

If another app reads or writes a path too, name that app's ID in `shared_with`, or the tool's plain name when it has no ID. Tools keep the path while any of those apps is installed.

A folder in `~/Documents` and the other personal folders is `user` as a whole, even when it mixes in settings or logs. Tools keep it, so do not split it. iCloud's `~/Library/Mobile Documents/iCloud~com~example~notes`, with the container ID's dots written as `~`, `~/Library/CloudStorage` and OneDrive under any of its names count too, since deleting there reaches the user's other devices. On Windows, write the default location; tools resolve a redirected Documents folder themselves.

## Step 5: List system entries

Add one `registrations` entry for each thing the app registers that is not a file, even when the official uninstaller removes it. Read the installer script, the builder config, the entitlements and the launch code.

The types, and what each `id` holds, are in section 7 of the spec. Search installers for `netsh advfirewall` and `FirewallRule` as well.

A file association on Windows has two parts. List the ProgID the app creates, such as `HKCU\Software\Classes\ExampleNotes.md`, and leave out `.md` itself, since other apps use that key too. A registration names a key, so a value the app adds to a shared key, such as one under `RegisteredApplications`, stays out: say so in your handoff.

An app that registers itself as a login item, through `SMAppService.mainApp`, uses its own bundle ID as the `id`, even when the user turns it on. When the framework picks a name, write that name: Electron's `setLoginItemSettings` uses the AppUserModelId for its `run-value`.

Files that belong with an entry, such as a launchd plist in `~/Library/LaunchAgents`, still go in `paths`, as `component`.

A line the app adds to a file it does not own, such as a `PATH` line in `~/.zshrc`, stays out: say so in your handoff. A backup it makes beside that file, such as `~/.zshrc.example-backup-*`, is its own, as `user`.

## Step 6: Run the app and compare

Static reading misses things. On each platform you can reach, start from a clean profile, or a new account or VM, and take the snapshot before installing, since installers write files too and often keep their old dates.

macOS:

```sh
snapshot() { pkgutil --pkgs; launchctl list | awk '{print $3}'; launchctl print system | awk '/^\tservices = \{/{on=1;next} /^\t\}/{on=0} on && NF==3{print $3}'; systemextensionsctl list 2>/dev/null | grep -E '^[*[:space:]]*[A-Z0-9]{10}'; }
snapshot | sort > /tmp/appfiles.before; touch /tmp/appfiles.marker
# Install the app, open it, sign in if it has accounts, use its main feature, quit it.
find ~ /Library /Users/Shared -cnewer /tmp/appfiles.marker -not -path '*/Library/Mobile Documents/*' 2>/dev/null
snapshot | sort | diff /tmp/appfiles.before -
```

Linux:

```sh
snapshot() { systemctl list-unit-files --no-legend 2>/dev/null; systemctl --user list-unit-files --no-legend 2>/dev/null; dpkg-query -W -f '${Package}\n' 2>/dev/null; rpm -qa 2>/dev/null; }
snapshot | sort > /tmp/appfiles.before; touch /tmp/appfiles.marker
# Install the app, open it, sign in if it has accounts, use its main feature, quit it.
find ~ /etc /var/lib -cnewer /tmp/appfiles.marker 2>/dev/null
snapshot | sort | diff /tmp/appfiles.before -
```

Windows, in an administrator PowerShell:

```powershell
function Snapshot {
  (Get-Service).Name
  Get-ScheduledTask | ForEach-Object { $_.TaskPath + $_.TaskName }
  (Get-NetFirewallRule).DisplayName
  (Get-ChildItem 'HKCU:\Software', 'HKCU:\Software\Classes', 'HKLM:\SOFTWARE', 'HKLM:\SOFTWARE\Classes', 'HKLM:\SOFTWARE\WOW6432Node' -ErrorAction SilentlyContinue).Name
  foreach ($key in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run') {
    (Get-Item $key -ErrorAction SilentlyContinue).Property
  }
  [Environment]::GetEnvironmentVariable('Path', 'User') -split ';'
  [Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';'
}
$before = Snapshot; $marker = Get-Date
# Install the app, open it, sign in if it has accounts, use its main feature, quit it.
Get-ChildItem $env:APPDATA, $env:LOCALAPPDATA, $env:PROGRAMDATA, $env:USERPROFILE -Recurse -Depth 3 -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt $marker -or $_.CreationTime -gt $marker } | ForEach-Object FullName
Compare-Object $before (Snapshot) | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject
```

Every new path that belongs to the app must be covered by an entry, and every new line of the snapshot that belongs to it by a registration. Ignore what clearly belongs to other processes.

If you cannot run the app, say so in your handoff and list the platforms you did not check.

## Step 7: Write the file

Name it `appfiles.json`. Keep one file for all platforms and include only the platforms the app ships on. A repository that builds several packages keeps one copy and each package copies it in.

A channel build with its own identifier, such as a beta, ships its own file with its own values. Builds that share an identifier but lay out files differently, such as a direct download and a sandboxed App Store build, share one file that lists both layouts.

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

Every path follows section 6 of the spec. If something the app writes cannot, such as a file in `/etc` on macOS, one under `%ProgramFiles%`, or a registration name with a per-user part, leave it out and say so in your handoff.

## Step 8: Put it in the package

The location for each package type is fixed, in section 3 of the spec.

How to get it there:

- **Xcode**: add the file to the target's Copy Bundle Resources phase. With XcodeGen, a resources group in `project.yml` does this.
- **Hand-assembled `.app`**: copy it into `Contents/Resources` before `codesign` runs.
- **electron-builder**: `mac.extraResources` for macOS and `win.extraFiles` for Windows. `extraResources` on Windows lands in `resources\`, which is the wrong folder.
- **Electron Forge**: `packagerConfig.extraResource` for macOS. On Windows, add a `postPackage` hook that copies the file beside the exe.
- **Tauri**: `bundle.resources` in `tauri.conf.json`, then confirm the file's location in the built package.
- **.NET**: `<Content Include="appfiles.json" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />`. Velopack packs the publish folder, so the file lands beside the exe in `current\`.
- **NSIS, Inno Setup, WiX**: install it beside the exe.
- **macOS tool with no bundle**: install it as `share/appfiles/<id>.json` under the same prefix as `bin`. In a Homebrew formula, `(share/"appfiles").install "appfiles.json" => "<id>.json"`.

Open the built package and confirm the file is at that exact path. On macOS, do this before signing, since the signature seals `Contents/Resources`.

## Step 9: Validate

Run this and fix every error:

```sh
npx github:tw93/appfiles path/to/appfiles.json
```

It needs Node 18 or later and installs no dependencies.

Tell the user which platforms you ran in step 6 and which you only read from source.
