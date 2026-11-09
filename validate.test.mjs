import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';

const macos = (path, kind = 'data', extra = {}) => ({
  spec: 0,
  name: 'Test',
  macos: { id: 'com.example.test', paths: [{ path, kind, ...extra }] },
});
const windows = (path, kind = 'data') => ({
  spec: 0,
  name: 'Test',
  windows: { id: 'Test', paths: [{ path, kind }] },
});
const linux = (path, kind = 'data') => ({
  spec: 0,
  name: 'Test',
  linux: { id: 'com.example.Test', paths: [{ path, kind }] },
});
const registry = (id) => ({
  spec: 0,
  name: 'Test',
  windows: { id: 'Test', paths: [], registrations: [{ type: 'registry', id }] },
});

const isValid = (document) => validate(document).errors.length === 0;

test('the example in appfiles.md is valid', () => {
  const spec = readFileSync(new URL('./appfiles.md', import.meta.url), 'utf8');
  const example = /```json\n([\s\S]*?)```/.exec(spec)[1];
  assert.deepEqual(validate(JSON.parse(example)), { errors: [], warnings: [] });
});

test('accepts the paths real apps use', () => {
  for (const path of [
    '~/.config/joplin-desktop',
    '~/.alacritty.toml',
    '~/Library/Application Support/Zed',
    '~/Library/Preferences/ByHost/com.example.test.*',
    '/Library/Application Support/Example',
    '/Library/Audio/Plug-Ins/VST3/Koala.vst3',
  ]) {
    assert.ok(isValid(macos(path)), path);
  }
  for (const path of ['%APPDATA%\\Joplin', '%LOCALAPPDATA%\\@joplinapp-desktop-updater', '%PROGRAMDATA%\\Example', '%USERPROFILE%\\.example']) {
    assert.ok(isValid(windows(path)), path);
  }
  for (const path of ['$XDG_CONFIG_HOME/example', '~/.var/app/com.example.Test', '/var/lib/example', '/etc/example']) {
    assert.ok(isValid(linux(path)), path);
  }
});

test('refuses shared roots', () => {
  for (const path of ['~', '~/', '~/Library', '~/Library/Application Support', '~/Library/Caches/', '~/.config', '/Library/LaunchDaemons', '/Library/Audio/Plug-Ins/VST3', '~/Documents']) {
    assert.ok(!isValid(macos(path)), path);
  }
  for (const path of ['%APPDATA%', '%APPDATA%\\', '%LOCALAPPDATA%', '%USERPROFILE%', '%USERPROFILE%\\AppData\\Local', '%appdata%\\microsoft', '%LOCALAPPDATA%\\Packages']) {
    assert.ok(!isValid(windows(path)), path);
  }
  for (const path of ['$XDG_CONFIG_HOME', '~/.config', '~/.local/share', '~/.var/app', '/etc', '/var/lib']) {
    assert.ok(!isValid(linux(path)), path);
  }
});

test('refuses paths outside the allowed starts', () => {
  for (const path of ['/etc/passwd', '/usr/local/bin/tool', '/Applications/Other.app', '/System/Library/Foo', 'relative/path', '$HOME/.example']) {
    assert.ok(!isValid(macos(path)), path);
  }
  for (const path of ['C:\\Windows\\System32', '%SystemRoot%\\System32', '%TEMP%\\example', '\\\\server\\share']) {
    assert.ok(!isValid(windows(path)), path);
  }
  assert.ok(!isValid(linux('/usr/bin/example')));
  assert.ok(!isValid(linux('/home/alice/.example')));
});

test('allows one named command-line link in /usr/local/bin on macOS', () => {
  assert.ok(isValid(macos('/usr/local/bin/zed', 'component')));
  assert.ok(!isValid(macos('/usr/local/bin/zed', 'data')));
  assert.ok(!isValid(macos('/usr/local/bin/', 'component')));
  assert.ok(!isValid(macos('/usr/local/bin/sub/zed', 'component')));
  assert.ok(!isValid(macos('/usr/local/bin/zed*', 'component')));
  assert.ok(!isValid(macos('/usr/local/bin/..', 'component')));
  assert.ok(!isValid(macos('/usr/local/lib/zed', 'component')));
});

test('a named file in a shared Windows folder is fine, the folder is not', () => {
  assert.ok(isValid(windows('%LOCALAPPDATA%\\Microsoft\\WindowsApps\\example.cmd', 'component')));
  assert.ok(isValid(windows('%APPDATA%\\Microsoft\\Windows\\SendTo\\Example.lnk', 'component')));
  assert.ok(!isValid(windows('%LOCALAPPDATA%\\Microsoft\\WindowsApps', 'component')));
  assert.ok(!isValid(windows('%APPDATA%\\Microsoft\\Windows\\SendTo', 'component')));
  assert.ok(!isValid(windows('%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs', 'component')));
});

test('a Windows id may be a list, other platforms take one string', () => {
  const document = windows('%APPDATA%\\Example');
  document.windows.id = ['{ABC}_is1', '{DEF}_is1'];
  assert.ok(isValid(document));
  document.windows.id = [];
  assert.ok(!isValid(document));
  document.windows.id = ['ok', ''];
  assert.ok(!isValid(document));
  const mac = macos('~/.example');
  mac.macos.id = ['com.example.a'];
  assert.ok(!isValid(mac));
});

test('accepts a sparse package registration on Windows only', () => {
  const document = windows('%APPDATA%\\Example');
  document.windows.registrations = [{ type: 'package', id: 'Example_abc123' }];
  assert.ok(isValid(document));
  const mac = macos('~/.example');
  mac.macos.registrations = [{ type: 'package', id: 'Example' }];
  assert.ok(!isValid(mac));
});

test('refuses traversal', () => {
  assert.ok(!isValid(macos('~/Library/Caches/../../.ssh')));
  assert.ok(!isValid(macos('~/.example/./x')));
  assert.ok(!isValid(windows('%APPDATA%\\Example\\..\\..\\..\\Desktop')));
  assert.ok(!isValid(linux('$XDG_DATA_HOME/../..')));
});

test('refuses credentials folders', () => {
  assert.ok(!isValid(macos('~/.ssh')));
  assert.ok(!isValid(macos('~/.ssh/id_ed25519')));
  assert.ok(!isValid(macos('~/.aws/credentials')));
  assert.ok(!isValid(windows('%USERPROFILE%\\.ssh\\id_ed25519')));
  assert.ok(!isValid(linux('~/.gnupg/private-keys-v1.d')));
});

test('limits wildcards to a named last component', () => {
  assert.ok(isValid(macos('~/Library/Application Support/JetBrains/IdeaIC*')));
  assert.ok(!isValid(macos('~/Library/Application Support/*')));
  assert.ok(!isValid(macos('~/Library/Caches/a*')));
  assert.ok(!isValid(macos('~/Library/*/com.example.test')));
  assert.ok(!isValid(macos('~/Library/Caches/com.example.**')));
  assert.ok(!isValid(macos('~/Library/Caches/com.example.t?st')));
  assert.ok(!isValid(macos('~/Library/Caches/com.example.[ab]')));
});

test('personal folders hold only user entries', () => {
  assert.ok(isValid(macos('~/Documents/Example', 'user')));
  assert.ok(!isValid(macos('~/Documents/Example', 'cache')));
  assert.ok(!isValid(macos('~/Music/Ableton', 'data')));
  assert.ok(isValid(windows('%USERPROFILE%\\Documents\\Example', 'user')));
  assert.ok(!isValid(windows('%USERPROFILE%\\documents\\Example', 'cache')));
  assert.ok(!isValid(linux('~/Pictures/Example', 'state')));
});

test('a folder that only starts like a personal one is not personal', () => {
  assert.ok(isValid(macos('~/Documents-example', 'data')));
  assert.ok(isValid(windows('%USERPROFILE%\\Documents-example', 'data')));
});

test('refuses other variables', () => {
  assert.ok(!isValid(macos('~/Library/$USER/example')));
  assert.ok(!isValid(windows('%APPDATA%\\%USERNAME%\\example')));
  assert.ok(!isValid(linux('$XDG_DATA_HOME/$USER/example')));
});

test('windows paths use backslashes', () => {
  assert.ok(!isValid(windows('%APPDATA%\\Example/Sub')));
  assert.ok(!isValid(windows('%APPDATA%/Example')));
});

test('checks kinds and shared_with', () => {
  assert.ok(!isValid(macos('~/.example', 'junk')));
  const noKind = macos('~/.example');
  delete noKind.macos.paths[0].kind;
  assert.ok(!isValid(noKind));
  assert.ok(isValid(macos('~/.example', 'data', { shared_with: ['com.example.other'] })));
  assert.ok(!isValid(macos('~/.example', 'data', { shared_with: [] })));
  assert.ok(!isValid(macos('~/.example', 'data', { shared_with: 'com.example.other' })));
});

test('warns when a cache folder is called data', () => {
  assert.equal(validate(macos('~/Library/Caches/com.example.test', 'data')).warnings.length, 1);
  assert.equal(validate(macos('~/Library/Caches/com.example.test', 'cache')).warnings.length, 0);
});

test('refuses duplicates', () => {
  const document = macos('~/.example');
  document.macos.paths.push({ path: '~/.example', kind: 'cache' });
  assert.ok(!isValid(document));
  const upper = windows('%APPDATA%\\Example');
  upper.windows.paths.push({ path: '%APPDATA%\\EXAMPLE', kind: 'cache' });
  assert.ok(!isValid(upper));
});

test('checks registry keys', () => {
  assert.ok(isValid(registry('HKCU\\Software\\Example\\Notes')));
  assert.ok(isValid(registry('HKCU\\Software\\Classes\\joplin')));
  assert.ok(isValid(registry('HKLM\\SOFTWARE\\Classes\\.torrent')));
  for (const id of ['HKCU\\Software', 'HKCU\\Software\\Classes', 'HKLM\\SOFTWARE\\Microsoft', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\', 'HKCR\\joplin', 'Software\\Example']) {
    assert.ok(!isValid(registry(id)), id);
  }
});

test('registration types belong to their platform', () => {
  const document = macos('~/.example');
  document.macos.registrations = [{ type: 'service', id: 'Example' }];
  assert.ok(!isValid(document));
  document.macos.registrations = [{ type: 'launchd', id: 'com.example.test.helper' }];
  assert.ok(isValid(document));
});

test('checks the top level', () => {
  assert.ok(!isValid([]));
  assert.ok(!isValid({ spec: 0, name: 'Test' }));
  assert.ok(!isValid({ ...macos('~/.example'), spec: 1 }));
  const noName = macos('~/.example');
  delete noName.name;
  assert.ok(!isValid(noName));
  const noId = macos('~/.example');
  delete noId.macos.id;
  assert.ok(!isValid(noId));
});

test('ignores unknown fields', () => {
  assert.ok(isValid({ ...macos('~/.example'), future: true }));
});

const repoFile = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the examples in the spec and both READMEs are valid', () => {
  for (const name of ['SPEC.md', 'README.md', 'README_CN.md']) {
    const example = /```json\n([\s\S]*?)```/.exec(repoFile(name))[1];
    assert.deepEqual(validate(JSON.parse(example)), { errors: [], warnings: [] }, name);
  }
});

test('the kinds and registration types in the spec match the schema and the validator', () => {
  const spec = repoFile('SPEC.md');
  const schema = JSON.parse(repoFile('appfiles.schema.json'));
  const section = (title) => spec.slice(spec.indexOf(`## ${title}`), spec.indexOf('\n## ', spec.indexOf(`## ${title}`) + 1));

  const kinds = [...section('5. Kinds').matchAll(/^\| `([a-z]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual(kinds, schema.$defs.path.properties.kind.enum);
  for (const kind of kinds) {
    assert.ok(isValid(macos('~/Library/Application Support/Example', kind)), kind);
  }

  const platforms = { macOS: 'macos', Windows: 'windows', Linux: 'linux' };
  const listed = { macos: [], windows: [], linux: [] };
  for (const match of section('7. Registrations').matchAll(/^\| (macOS|Windows|Linux) \| `([a-z-]+)` \|/gm)) {
    listed[platforms[match[1]]].push(match[2]);
  }
  for (const platform of Object.values(platforms)) {
    const allowed = schema.properties[platform].allOf[1].properties.registrations.items.properties.type.enum;
    assert.deepEqual(listed[platform], allowed, platform);
    for (const type of allowed) {
      const id = type === 'registry' ? 'HKCU\\Software\\Example\\Notes' : 'example';
      const document = { spec: 0, name: 'Test', [platform]: { id: 'example', paths: [], registrations: [{ type, id }] } };
      assert.ok(isValid(document), `${platform} ${type}`);
    }
  }
});

test('the command line checks the file when run through a symlink, as npx does', () => {
  const folder = mkdtempSync(join(tmpdir(), 'appfiles-'));
  const link = join(folder, 'appfiles');
  symlinkSync(fileURLToPath(new URL('./validate.mjs', import.meta.url)), link);
  const run = (document) => {
    const file = join(folder, 'appfiles.json');
    writeFileSync(file, JSON.stringify(document));
    return spawnSync(process.execPath, [link, file], { encoding: 'utf8' });
  };

  const good = run(macos('~/Library/Application Support/Example'));
  assert.equal(good.status, 0);
  assert.match(good.stdout, /: valid/);

  const bad = run(macos('~/Library/Caches'));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /names a shared root/);
});

test('relative links in the docs point at files in the repository', () => {
  for (const name of ['README.md', 'README_CN.md', 'SPEC.md', 'CHANGELOG.md', 'appfiles.md']) {
    for (const [, target] of repoFile(name).matchAll(/\]\((?!https?:|#)([^)#]+)[^)]*\)/g)) {
      assert.ok(existsSync(new URL(`./${target}`, import.meta.url)), `${name} links to ${target}`);
    }
  }
});
