import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tiedToApp, validate } from './validate.mjs';

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
const EXAMPLES = readdirSync(new URL('./examples/', import.meta.url), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

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

test('the schema accepts every valid document and refuses the wrong shapes', async (t) => {
  let Ajv;
  try {
    ({ default: Ajv } = await import('ajv/dist/2020.js'));
  } catch (error) {
    if (process.env.CI) throw error;
    t.skip('ajv is not installed, see CONTRIBUTING.md');
    return;
  }
  const check = new Ajv({ strict: false }).compile(JSON.parse(repoFile('appfiles.schema.json')));
  const vectors = JSON.parse(repoFile('tests/vectors.json'));
  // A valid file must never turn red in an editor. The schema only checks the shape, so most
  // refusals stay with the validator, and these are the ones it must catch by itself.
  for (const { name, valid, document } of vectors.filter((vector) => vector.valid)) {
    assert.ok(check(document), `${name} ${JSON.stringify(check.errors)}`);
  }
  for (const example of EXAMPLES) {
    assert.ok(check(JSON.parse(repoFile(`examples/${example}/appfiles.json`))), `${example} ${JSON.stringify(check.errors)}`);
  }
  const shapes = ['spec is too high', 'no name', 'no platform', 'an unknown kind', 'a type from another platform'];
  for (const name of shapes) {
    const vector = vectors.find((candidate) => candidate.name === name);
    assert.equal(vector.valid, false, name);
    assert.equal(check(vector.document), false, name);
  }
});

test('a path is tied to the app by its id or the package name, and by nothing else', () => {
  const cases = JSON.parse(repoFile('tests/selection.json'));
  assert.ok(cases.some((item) => item.tied) && cases.some((item) => !item.tied));
  for (const { name, platform, path, id, package_name: packageName, tied } of cases) {
    assert.equal(tiedToApp(platform, path, id, packageName), tied, name);
  }
  // Each of these stalled a reader for a minute or more before the check was bounded.
  const started = Date.now();
  const marks = `a${'́'.repeat(170000)}${'̣'.repeat(170000)}`;
  assert.equal(tiedToApp('macos', `~/${'a/'.repeat(250000)}b`, 'com.other.app', 'Absent Name'), false);
  assert.equal(tiedToApp('macos', `~/${'a'.repeat(1000000)}/*`, 'com.other.app', 'Absent Name'), false);
  assert.equal(tiedToApp('macos', '~/.example', marks, marks), false);
  assert.ok(Date.now() - started < 10000);
  assert.equal(tiedToApp('macos', undefined, 'com.example.notes', 'Example Notes'), false);
  assert.equal(tiedToApp('beos', '~/.example', 'com.example.notes', 'Example Notes'), false);
});

test('every reserved registry key is refused, and what an app adds inside a container is not', () => {
  const { registry_keys: keys, registry_subtrees: subtrees } = JSON.parse(repoFile('reserved.json')).windows;
  const registry = (id) => ({ spec: 0, name: 'T', windows: { id: 'x', paths: [], registrations: [{ type: 'registry', id }] } });
  const key = (name) => `HKCU\\${name}`;
  for (const name of [...keys, ...subtrees]) assert.equal(isValid(registry(key(name))), false, name);
  for (const name of subtrees) assert.equal(isValid(registry(key(`${name}\\Example`))), false, `${name} child`);
  // A child of a container stays open unless the list reserves that child, or something inside it.
  const inside = new Set([...keys, ...subtrees].map((name) => name.toLowerCase()));
  for (const name of keys.filter((candidate) => !subtrees.some((root) => candidate === root || candidate.startsWith(`${root}\\`)))) {
    const child = `${name}\\ExampleNotes`;
    if (inside.has(child.toLowerCase())) continue;
    assert.ok(isValid(registry(key(child))), child);
  }
});

test('the examples folder holds valid files, each linked from its README', () => {
  assert.ok(EXAMPLES.length >= 3);
  const readme = repoFile('examples/README.md');
  for (const example of EXAMPLES) {
    assert.deepEqual(validate(JSON.parse(repoFile(`examples/${example}/appfiles.json`))), { errors: [], warnings: [] }, example);
    assert.ok(readme.includes(`(${example}/appfiles.json)`), example);
  }
});

test('the command line checks the file when run through a symlink, as npx does', () => {
  const folder = mkdtempSync(join(tmpdir(), 'appfiles-'));
  const link = join(folder, 'appfiles');
  symlinkSync(fileURLToPath(new URL('./cli.mjs', import.meta.url)), link);
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
  for (const name of ['README.md', 'README_CN.md', 'SPEC.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'appfiles.md']) {
    for (const [, target] of repoFile(name).matchAll(/\]\((?!https?:|#)([^)#]+)[^)]*\)/g)) {
      assert.ok(existsSync(new URL(`./${target}`, import.meta.url)), `${name} links to ${target}`);
    }
  }
});

test('every conformance vector reaches its verdict', () => {
  const vectors = JSON.parse(repoFile('tests/vectors.json'));
  assert.ok(vectors.length > 50);
  for (const { name, valid, document } of vectors) {
    const { errors } = validate(document);
    assert.equal(errors.length === 0, valid, `${name}: ${errors.join('; ')}`);
  }
});

test('every reserved path is refused whichever kind it claims, and in another case on macOS and Windows', () => {
  const reserved = JSON.parse(repoFile('reserved.json'));
  const builders = { macos, windows, linux };
  for (const [platform, lists] of Object.entries(reserved)) {
    for (const path of [...lists.shared_roots, ...lists.protected]) {
      for (const kind of ['user', 'data', 'cache']) {
        assert.ok(!isValid(builders[platform](path, kind)), `${platform} ${path} ${kind}`);
      }
      if (platform !== 'linux') {
        assert.ok(!isValid(builders[platform](path.toUpperCase())), `${platform} ${path} upper`);
      }
    }
  }
});

test('the spec does not call the validator the authority', () => {
  const spec = repoFile('SPEC.md');
  assert.match(spec, /this text is right and the tool has a bug/);
  assert.doesNotMatch(spec, /passes the validator/);
});

const hasPlutil = existsSync('/usr/bin/plutil');
const makeApp = (folder, { id = 'com.example.test', file } = {}) => {
  const app = join(folder, 'Example.app');
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true });
  writeFileSync(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>`);
  if (file) writeFileSync(join(app, 'Contents', 'Resources', 'appfiles.json'), JSON.stringify(file));
  return app;
};
const cli = (target) => spawnSync(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), target], { encoding: 'utf8' });

test('the reference reader lists a matching package and changes nothing', { skip: !hasPlutil }, () => {
  const app = makeApp(mkdtempSync(join(tmpdir(), 'appfiles-')), { file: macos('~/Library/Application Support/Example') });
  const before = readFileSync(join(app, 'Contents', 'Resources', 'appfiles.json'), 'utf8');
  const run = cli(app);
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /identity matches/);
  assert.match(run.stdout, /data\s+~\/Library\/Application Support\/Example/);
  assert.equal(readFileSync(join(app, 'Contents', 'Resources', 'appfiles.json'), 'utf8'), before);
});

test('the reference reader ignores a file whose id is not the package', { skip: !hasPlutil }, () => {
  const app = makeApp(mkdtempSync(join(tmpdir(), 'appfiles-')), { id: 'com.other.app', file: macos('~/.example') });
  const run = cli(app);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /does not match/);
  assert.doesNotMatch(run.stdout, /~\/\.example/);
});

test('the reference reader leaves a path it cannot tie to the package unselected', { skip: !hasPlutil }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'appfiles-'));
  const app = join(folder, 'Evil.app');
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true });
  writeFileSync(join(app, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.evil.app</string><key>CFBundleName</key><string>Evil</string></dict></plist>');
  writeFileSync(join(app, 'Contents', 'Resources', 'appfiles.json'), JSON.stringify({ spec: 0, name: 'Google', macos: { id: 'com.evil.app', paths: [{ path: '~/Library/Application Support/Google/Chrome', kind: 'cache' }, { path: '~/Library/Caches/com.evil.app', kind: 'cache' }] } }));
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), app], { encoding: 'utf8' });
  assert.match(run.stdout, /Google\/Chrome.*not tied to the app/);
  assert.doesNotMatch(run.stdout, /com\.evil\.app\s+\(\w+\)\s+not tied/);
});

test('the reference reader ties a path to the package name, and judges nothing in a folder', { skip: !hasPlutil }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'appfiles-'));
  const app = join(folder, 'Evil.app');
  const bare = join(folder, 'bare');
  const paths = [{ path: '~/Library/Application Support/Evil', kind: 'data' }, { path: '~/Library/Application Support/Google', kind: 'cache' }];
  const document = JSON.stringify({ spec: 0, name: 'Google', macos: { id: 'com.other.app', paths } });
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true });
  mkdirSync(bare);
  writeFileSync(join(app, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.other.app</string><key>CFBundleName</key><string>Evil</string></dict></plist>');
  writeFileSync(join(app, 'Contents', 'Resources', 'appfiles.json'), document);
  writeFileSync(join(bare, 'appfiles.json'), document);
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [cli, app], { encoding: 'utf8' });
  assert.doesNotMatch(run.stdout, /Support\/Evil\s.*not tied/);
  assert.match(run.stdout, /Support\/Google.*not tied/);
  assert.doesNotMatch(spawnSync(process.execPath, [cli, bare], { encoding: 'utf8' }).stdout, /not tied/);
});

test('the reference reader rejects bad entries and keeps the valid ones', { skip: !hasPlutil }, () => {
  const file = { spec: 0, name: 'T', macos: { id: 'com.example.test', paths: [{ path: '~/.example', kind: 'data' }, { path: '~/.ssh/id_rsa', kind: 'cache' }] } };
  const run = cli(makeApp(mkdtempSync(join(tmpdir(), 'appfiles-')), { file }));
  assert.equal(run.status, 1);
  assert.match(run.stdout, /data\s+~\/\.example/);
  assert.match(run.stdout, /rejected\s+~\/\.ssh\/id_rsa/);
});

test('the reference reader ignores a file with a newer spec, and says when there is no file', { skip: !hasPlutil }, () => {
  const newer = cli(makeApp(mkdtempSync(join(tmpdir(), 'appfiles-')), { file: { ...macos('~/.example'), spec: 1 } }));
  assert.equal(newer.status, 1);
  assert.match(newer.stdout, /newer than this tool/);
  assert.doesNotMatch(newer.stdout, /~\/\.example/);

  const none = cli(makeApp(mkdtempSync(join(tmpdir(), 'appfiles-'))));
  assert.equal(none.status, 1);
  assert.match(none.stdout, /no appfiles\.json/);
});

const tempDir = () => mkdtempSync(join(tmpdir(), 'appfiles-'));
const resourceFile = (app) => join(app, 'Contents', 'Resources', 'appfiles.json');

test('a crafted wildcard neither crashes nor stalls the validator', () => {
  assert.ok(!isValid(macos('~/abc*??')));
  const started = Date.now();
  validate(macos(`~/Library/Application Support/${'a*'.repeat(40)}zzz`));
  assert.ok(Date.now() - started < 2000);
});

test('the reference reader survives fields of the wrong type', { skip: !hasPlutil }, () => {
  for (const file of [
    { spec: 0, name: { toString: 1 }, macos: { id: 'com.example.test', paths: [{ path: { toString: 1 }, kind: 'data' }] } },
    { spec: 0, name: 'T', macos: { id: 'com.example.test', paths: [1, null], registrations: [1] } },
  ]) {
    const run = cli(makeApp(tempDir(), { file }));
    assert.equal(run.status, 1, run.stderr);
    assert.doesNotMatch(run.stderr, /TypeError/);
  }
  const noSection = cli(makeApp(tempDir(), { file: { spec: 0, windows: true } }));
  assert.equal(noSection.status, 1);
  assert.doesNotMatch(noSection.stdout, /undefined/);
});

test('the reference reader judges a bundle by what it is, not by its name', { skip: !hasPlutil }, () => {
  const folder = tempDir();
  const app = makeApp(folder, { id: 'com.other.app', file: macos('~/.example') });
  const renamed = join(folder, 'Example.APP');
  symlinkSync(app, join(folder, 'Link.app'));
  for (const target of [join(folder, 'Link.app'), existsSync(renamed) ? renamed : app]) {
    assert.match(cli(target).stdout, /does not match/);
  }
  const noSuffix = makeApp(tempDir(), { id: 'com.other.app', file: macos('~/.example') });
  const plain = `${noSuffix}.folder`;
  symlinkSync(noSuffix, plain);
  assert.match(cli(plain).stdout, /does not match/);
});

test('the reference reader ignores a commented-out identifier', { skip: !hasPlutil }, () => {
  const app = makeApp(tempDir(), { file: macos('~/.example') });
  writeFileSync(join(app, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><!-- <key>CFBundleIdentifier</key><string>com.example.test</string> --><key>CFBundleIdentifier</key><string>com.other.app</string></dict></plist>');
  assert.match(cli(app).stdout, /does not match/);
});

test('the reference reader refuses a file that is not a regular file', { skip: !hasPlutil }, () => {
  const app = makeApp(tempDir());
  const outside = join(tempDir(), 'appfiles.json');
  writeFileSync(outside, JSON.stringify(macos('~/.example')));
  symlinkSync(outside, resourceFile(app));
  const linked = cli(app);
  assert.equal(linked.status, 1);
  assert.match(linked.stdout, /not a regular file/);

  rmSync(resourceFile(app));
  mkdirSync(resourceFile(app));
  assert.match(cli(app).stdout, /not a regular file/);

  const plist = makeApp(tempDir(), { file: macos('~/.example') });
  rmSync(join(plist, 'Contents', 'Info.plist'));
  mkdirSync(join(plist, 'Contents', 'Info.plist'));
  const run = cli(plist);
  assert.equal(run.status, 1);
  assert.doesNotMatch(run.stderr, /Error/);
});

test('the reference reader sees duplicates, and tells a bad spec from a newer one', { skip: !hasPlutil }, () => {
  const file = { spec: 0, name: 'T', macos: { id: 'com.example.test', paths: [{ path: '~/.example', kind: 'data' }, { path: '~/.EXAMPLE', kind: 'data' }] } };
  assert.match(cli(makeApp(tempDir(), { file })).stdout, /listed twice/);
  assert.match(cli(makeApp(tempDir(), { file: { ...macos('~/.example'), spec: -1 } })).stdout, /not a valid version/);
  const { spec, ...noSpec } = macos('~/.example');
  assert.match(cli(makeApp(tempDir(), { file: noSpec })).stdout, /not an appfiles document/);
});

test('the reference reader escapes control characters from the file', { skip: !hasPlutil }, () => {
  const file = { spec: 0, name: 'T\u001b[2J', macos: { id: 'com.example.test', paths: [{ path: '~/.example\u001b[2J', kind: 'data' }] } };
  const { stdout } = cli(makeApp(tempDir(), { file }));
  assert.doesNotMatch(stdout, /\u001b/);
  assert.match(stdout, /\\u001b/);
});

const inFolder = (home, file) => {
  const folder = tempDir();
  writeFileSync(join(folder, 'appfiles.json'), typeof file === 'string' ? file : JSON.stringify(file));
  return spawnSync(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), folder], { encoding: 'utf8', env: { ...process.env, HOME: home } });
};
const here = process.platform === 'darwin' ? 'macos' : 'linux';
const local = (...paths) => ({ spec: 0, name: 'T', [here]: { id: 'x', paths: paths.map(([path, kind = 'data']) => ({ path, kind })) } });

test('the reference reader judges every section, and this machine first', () => {
  const other = here === 'macos' ? 'linux' : 'macos';
  const file = { spec: 0, name: 'T', windows: { id: 'x', paths: [{ path: '%APPDATA%\\Example', kind: 'data' }] }, [other]: { id: 'x', paths: [{ path: '~/.ssh', kind: 'cache' }] }, [here]: { id: 'x', paths: [{ path: '~/.example', kind: 'data' }] } };
  const run = inFolder(tempDir(), file);
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /rejected\s+~\/\.ssh/);
  assert.match(run.stdout, /absent/);
  const [first, second] = process.platform === 'win32' ? ['%APPDATA%', '~/.example'] : ['~/.example', '%APPDATA%'];
  assert.ok(run.stdout.indexOf(first) < run.stdout.indexOf(second));
});

test('the reference reader ignores a file with no name, or a section with no id', () => {
  const noName = inFolder(tempDir(), { spec: 0, linux: { paths: [] } });
  assert.equal(noName.status, 1);
  assert.doesNotMatch(noName.stdout, /undefined/);
  const noId = inFolder(tempDir(), { spec: 0, name: 'T', linux: { paths: [{ path: '~/.example', kind: 'data' }] } });
  assert.equal(noId.status, 1);
  assert.doesNotMatch(noId.stdout, /undefined/);
});

test('the reference reader keeps valid entries next to one nested too deep to show', () => {
  const deep = `${'['.repeat(100000)}${']'.repeat(100000)}`;
  const file = `{"spec":0,"name":"T","${here}":{"id":"x","paths":[{"path":${deep},"kind":"data"},{"path":"~/.example","kind":"data"}]}}`;
  const run = inFolder(tempDir(), file);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /data\s+~\/\.example/);
});

test('a file over the size limit is refused before it is parsed', () => {
  const big = join(tempDir(), 'appfiles.json');
  writeFileSync(big, ' '.repeat(1024 * 1024 + 1));
  const run = cli(big);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /1 MiB/);
});

test('the reference reader refuses a package whose folders link out of it', { skip: !hasPlutil }, () => {
  const folder = tempDir();
  const outside = makeApp(folder, { file: macos('~/.example') });
  const app = join(folder, 'Other.app');
  mkdirSync(app);
  symlinkSync(join(outside, 'Contents'), join(app, 'Contents'));
  const run = cli(app);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /is a link/);
  assert.doesNotMatch(run.stdout, /identity matches/);
});

test('a Mac app with no plutil to ask is ignored', { skip: hasPlutil }, () => {
  const run = cli(makeApp(tempDir(), { file: macos('~/.example') }));
  assert.equal(run.status, 1);
  assert.match(run.stdout, /cannot read its bundle identifier/);
});

test('the reference reader says what it does not follow, and a deep path cannot stall it', { skip: process.platform === 'win32' }, () => {
  const home = tempDir();
  mkdirSync(join(home, '.real'));
  symlinkSync(join(home, '.real'), join(home, '.link'));
  const run = inFolder(home, local(['~/.link'], ['~/.exam*'], [`~/${'a/'.repeat(400000)}a`]));
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /~\/\.link\s+\(link not followed\)/);
  assert.match(run.stdout, /~\/\.exam\*\s+\(wildcard not expanded\)/);
});

test('the reference reader treats a section of the wrong shape as a rejection', () => {
  const other = here === 'macos' ? 'linux' : 'macos';
  assert.equal(inFolder(tempDir(), { ...local(['~/.example']), [other]: [1] }).status, 1);
  assert.equal(inFolder(tempDir(), { spec: 0, name: 'T', [here]: { id: 'x' } }).status, 1);
  assert.equal(inFolder(tempDir(), { spec: 0, name: 'T', [here]: { id: 'x', paths: 'x' } }).status, 1);
});

test('a file that is not UTF-8 is refused', () => {
  const bad = join(tempDir(), 'appfiles.json');
  writeFileSync(bad, Buffer.from('{"spec":0,"name":"T\xff","macos":{"id":"x","paths":[]}}', 'latin1'));
  assert.equal(cli(bad).status, 2);
});

test('an app folder with no Resources has no file, rather than a link', { skip: !hasPlutil }, () => {
  const app = join(tempDir(), 'Empty.app');
  mkdirSync(app);
  assert.match(cli(app).stdout, /no appfiles\.json/);
});
