import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
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
