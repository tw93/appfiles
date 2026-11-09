// The reference reader: it shows what a file claims about a package and what section 9
// of SPEC.md rejects on sight. It lists and acts on nothing, so it does not follow links
// or expand wildcards, which section 9 asks of a tool before it acts. It never writes,
// moves or deletes anything, and it runs nothing from the file.

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { MAX_FILE_BYTES, canonical, printable, validate } from './validate.mjs';

const SUPPORTED_SPEC = 0;
const PLUTIL = '/usr/bin/plutil';
const PLATFORMS = ['macos', 'windows', 'linux'];
const HERE = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform];

const isSection = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
// A hostile value can be nested too deep to stringify, so only text is shown as itself.
const brief = (value) => (typeof value === 'string' ? value : Array.isArray(value) ? '[list]' : `[${typeof value}]`);
const shownId = (id) => (Array.isArray(id) ? id.map(brief).join(', ') : brief(id));

// A package can hold a FIFO, a link out of the package or something huge at these paths.
function readRegularFile(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return { missing: true };
  }
  if (!stat.isFile()) return { error: 'is not a regular file' };
  if (stat.size > MAX_FILE_BYTES) return { error: 'is too large' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)) };
  } catch (error) {
    return { error: error.message };
  }
}

// plutil reads what the system reads, binary plists included. With no real parser there
// is no identity, and section 9 then ignores the file.
function bundleIdentifier(app) {
  const plist = join(app, 'Contents', 'Info.plist');
  if (readRegularFile(plist).text === undefined || !existsSync(PLUTIL)) return null;
  const run = spawnSync(PLUTIL, ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist], { encoding: 'utf8', timeout: 5000 });
  return run.status === 0 ? run.stdout.trim() : null;
}

function linksElsewhere(path) {
  try {
    return realpathSync(path) !== path;
  } catch {
    return false;
  }
}

function expand(path) {
  const xdg = { XDG_CONFIG_HOME: '.config', XDG_DATA_HOME: '.local/share', XDG_STATE_HOME: '.local/state', XDG_CACHE_HOME: '.cache' };
  return path
    .replace(/^~(?=\/)/, homedir())
    .replace(/^\$(XDG_[A-Z_]+)/, (_, name) => process.env[name] || join(homedir(), xdg[name] ?? ''))
    .replace(/^%([A-Z]+)%/, (_, name) => process.env[name] ?? '');
}

const entryErrors = (platform, field, entry) => {
  const section = { id: 'x', paths: [] };
  section[field] = [entry];
  return validate({ spec: SUPPORTED_SPEC, name: 'x', [platform]: section }).errors;
};

const reason = (message) => printable(message.replace(/^.*?\[\d+\]\.?(path|id|type|kind)?\s*/, ''));

// Only what this machine can answer, one lstat per entry.
function presence(platform, path) {
  if (platform !== HERE) return '';
  if (path.includes('*')) return 'wildcard not expanded';
  try {
    return lstatSync(expand(path)).isSymbolicLink() ? 'link not followed' : 'present';
  } catch {
    return 'absent';
  }
}

export function runInspect(given) {
  const target = realpathSync(given);
  const looksLikeApp = /\.app$/i.test(target) || existsSync(join(target, 'Contents', 'Info.plist'));
  const file = looksLikeApp ? join(target, 'Contents', 'Resources', 'appfiles.json') : join(target, 'appfiles.json');

  // A link above the file is a way out of the package too.
  if (looksLikeApp && (linksElsewhere(join(target, 'Contents')) || linksElsewhere(dirname(file)))) {
    console.log(`${printable(given)}: its Contents or Resources folder is a link, ignoring the file`);
    return 1;
  }

  const read = readRegularFile(file);
  if (read.missing) {
    console.log(`${printable(given)}: no appfiles.json at ${printable(file)}`);
    return 1;
  }
  if (read.error) {
    console.log(`${printable(file)} ${printable(read.error)}, ignoring it`);
    return 1;
  }

  let document;
  try {
    document = JSON.parse(read.text);
  } catch (error) {
    console.error(`cannot read ${printable(file)}: ${printable(error.message)}`);
    return 2;
  }
  if (typeof document !== 'object' || document === null || typeof document.spec !== 'number') {
    console.log(`${printable(file)}: not an appfiles document, ignoring it`);
    return 1;
  }
  if (document.spec > SUPPORTED_SPEC) {
    console.log(`${printable(file)}: spec ${document.spec} is newer than this tool understands, ignoring the file`);
    return 1;
  }
  if (document.spec !== SUPPORTED_SPEC) {
    console.log(`${printable(file)}: spec ${document.spec} is not a valid version, ignoring the file`);
    return 1;
  }
  if (typeof document.name !== 'string' || document.name === '') {
    console.log(`${printable(file)}: has no name, ignoring it`);
    return 1;
  }

  // An app has one identity to check. A folder may hold every platform, and a bad section
  // must not hide behind a good one, so each is judged, this machine's first.
  const named = looksLikeApp ? ['macos'] : PLATFORMS.filter((name) => document[name] !== undefined);
  const present = named.filter((name) => isSection(document[name])).sort((a, b) => (b === HERE) - (a === HERE));
  if (present.length === 0) {
    console.log(`${printable(file)}: no ${looksLikeApp ? 'macos' : 'platform'} section`);
    return 1;
  }

  let identity = 'identity not checked, a folder has none to read';
  if (looksLikeApp) {
    const actual = bundleIdentifier(target);
    if (actual === null) {
      console.log(`${printable(given)}: cannot read its bundle identifier, ignoring the file`);
      return 1;
    }
    if (actual !== document.macos.id) {
      console.log(`${printable(file)}: id ${printable(shownId(document.macos.id))} does not match the package ${printable(actual)}, ignoring the file`);
      return 1;
    }
    identity = 'identity matches';
  }

  let rejected = named.length - present.length;
  const show = (left, middle, right = '') => console.log(`  ${left.padEnd(10)} ${printable(middle)}${right ? `  (${printable(right)})` : ''}`);
  const reject = (what, why) => {
    rejected += 1;
    show('rejected', what, why);
  };

  for (const platform of present) {
    const section = document[platform];
    const shape = validate({ spec: SUPPORTED_SPEC, name: 'x', [platform]: { id: section.id, paths: Array.isArray(section.paths) ? [] : section.paths } }).errors;
    if (shape.length > 0) {
      console.log(`${printable(document.name)}  ${platform}: ${printable(shape[0])}, ignoring this section`);
      rejected += 1;
      continue;
    }
    const where = platform === HERE ? '' : `  ${platform}, not this machine`;
    console.log(`${printable(document.name)}  ${printable(shownId(section.id))}  ${identity}${where}`);

    const seen = new Set();
    for (const entry of section.paths) {
      const errors = entryErrors(platform, 'paths', entry);
      const shown = brief(entry?.path ?? entry);
      if (errors.length > 0) {
        reject(shown, reason(errors[0]));
        continue;
      }
      const key = canonical(platform, entry.path);
      if (seen.has(key)) {
        reject(shown, 'listed twice');
        continue;
      }
      seen.add(key);
      const shared = entry.shared_with ? `shared with ${entry.shared_with.join(', ')}` : '';
      show(entry.kind, entry.path, [presence(platform, entry.path), shared].filter(Boolean).join(', '));
    }
    for (const entry of Array.isArray(section.registrations) ? section.registrations : []) {
      const errors = entryErrors(platform, 'registrations', entry);
      if (errors.length > 0) {
        reject(brief(entry?.id ?? entry), reason(errors[0]));
      } else {
        show(entry.type, entry.id);
      }
    }
  }
  if (rejected > 0) {
    console.log(`${rejected} entr${rejected === 1 ? 'y' : 'ies'} rejected, the valid ones stand`);
    return 1;
  }
  return 0;
}
