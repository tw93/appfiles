// Checks an appfiles.json against the rules in SPEC.md a program can check. No dependencies.

import { readFileSync } from 'node:fs';

const KINDS = new Set(['user', 'component', 'data', 'config', 'state', 'log', 'cache']);

// The reserved names live in reserved.json so readers in other languages use the same list.
const RESERVED = JSON.parse(readFileSync(new URL('./reserved.json', import.meta.url), 'utf8'));

const PLATFORMS = {
  macos: {
    registrations: new Set(['launchd', 'login-item', 'pkg', 'system-extension', 'kext']),
    prefixes: ['~/', '/Library/', '/usr/local/bin/'],
    binRoot: '/usr/local/bin/',
    expectedKinds: [
      ['~/library/caches/', 'cache', 'data', '~/Library/Caches/'],
      ['~/library/logs/', 'log', 'data', '~/Library/Logs/'],
    ],
  },
  windows: {
    registrations: new Set(['registry', 'run-value', 'service', 'scheduled-task', 'firewall-rule', 'path-entry', 'package']),
    prefixes: ['%APPDATA%\\', '%LOCALAPPDATA%\\', '%PROGRAMDATA%\\', '%USERPROFILE%\\'],
    expectedKinds: [],
  },
  linux: {
    registrations: new Set(['systemd-unit', 'package']),
    prefixes: ['~/', '$XDG_CONFIG_HOME/', '$XDG_DATA_HOME/', '$XDG_STATE_HOME/', '$XDG_CACHE_HOME/', '/etc/', '/var/lib/'],
    expectedKinds: [
      ['$XDG_CACHE_HOME/', 'cache', 'data', '$XDG_CACHE_HOME/'],
    ],
  },
};

// Two spellings of one folder are one folder.
const ALIASES = {
  macos: [],
  windows: [
    ['%userprofile%\\appdata\\roaming', '%appdata%'],
    ['%userprofile%\\appdata\\local', '%localappdata%'],
  ],
  linux: [
    ['~/.config', '$XDG_CONFIG_HOME'],
    ['~/.local/share', '$XDG_DATA_HOME'],
    ['~/.local/state', '$XDG_STATE_HOME'],
    ['~/.cache', '$XDG_CACHE_HOME'],
  ],
};

const MIN_WILDCARD_LITERAL = 3;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const WINDOWS_SHORT_NAME = /^[^.~]{1,6}~\d+(\.[^.]{0,3})?$/;

export const MAX_FILE_BYTES = 1024 * 1024;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
const separatorOf = (platform) => (platform === 'windows' ? '\\' : '/');

// Default volumes on macOS and Windows use Unicode case folding: APFS opens ~/.ſsh as ~/.ssh.
// Upper then lower reaches the same result for what JavaScript has no direct call for.
// Two rounds, since U+1E9E only reaches ss through ß.
const foldOnce = (value) => value.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
const fold = (value) => foldOnce(foldOnce(value));

export const canonical = (platform, path) => {
  const separator = separatorOf(platform);
  let value = platform === 'linux' ? path.normalize('NFC') : fold(path);
  if (value.length > 1 && value.endsWith(separator)) value = value.slice(0, -1);
  for (const [alias, target] of ALIASES[platform]) {
    if (value === alias || value.startsWith(alias + separator)) return target + value.slice(alias.length);
  }
  return value;
};

const isInside = (platform, path, root) => path === root || path.startsWith(root + separatorOf(platform));

// Never backtracks past the last *, so a crafted pattern cannot blow up the way a regex can.
function globMatches(pattern, value) {
  let p = 0;
  let v = 0;
  let star = -1;
  let mark = 0;
  while (v < value.length) {
    if (p < pattern.length && pattern[p] === '*') {
      star = p;
      mark = v;
      p += 1;
    } else if (p < pattern.length && pattern[p] === value[v]) {
      p += 1;
      v += 1;
    } else if (star !== -1) {
      p = star + 1;
      mark += 1;
      v = mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === '*') p += 1;
  return p === pattern.length;
}

function ancestorsOf(platform, path) {
  const separator = separatorOf(platform);
  const found = [];
  let at = path.lastIndexOf(separator);
  while (at > 0) {
    found.push(path.slice(0, at));
    at = path.lastIndexOf(separator, at - 1);
  }
  return found;
}

const memo = new Map();
function reservedFor(platform) {
  if (memo.has(platform)) return memo.get(platform);
  const lists = RESERVED[platform];
  const shared = lists.shared_roots.map((path) => canonical(platform, path));
  const personal = lists.personal.map((path) => canonical(platform, path));
  const all = lists.protected.map((path) => canonical(platform, path));
  const protectedExact = all.filter((path) => !path.includes('*'));
  const protectedGlobs = all.filter((path) => path.includes('*'));

  // What a wildcard must not reach: every reserved location, what contains one, and each
  // alias, since ~/.con* matches ~/.config. Deeper paths reach the list through canonical.
  const reachable = new Set();
  const add = (path) => {
    reachable.add(path);
    for (const parent of ancestorsOf(platform, path)) reachable.add(parent);
  };
  for (const path of [...shared, ...personal, ...protectedExact]) add(path);
  for (const [alias] of ALIASES[platform]) add(alias);
  const value = { shared, personal, protectedExact, protectedGlobs, reachable };
  memo.set(platform, value);
  return value;
}

const parentOf = (platform, path) => path.slice(0, path.lastIndexOf(separatorOf(platform)));
const lastOf = (platform, path) => path.slice(path.lastIndexOf(separatorOf(platform)) + 1);

function isProtected(platform, key, reserved) {
  if (reserved.protectedExact.some((root) => isInside(platform, key, root) || isInside(platform, root, key))) return true;
  const levels = [key, ...ancestorsOf(platform, key)];
  return reserved.protectedGlobs.some((pattern) => {
    if (!levels.some((level) => globMatches(pattern, level))) return false;
    // A shared root inside a protected family stays open for an app's own named file:
    // Apple's recent-documents folder holds one file per third-party app.
    return !reserved.shared.some((root) => globMatches(pattern, root) && key !== root && isInside(platform, key, root));
  });
}

function wildcardReachesReserved(platform, key, reserved) {
  // Win32 reads name.* as also matching name.
  const forms = platform === 'windows' && key.endsWith('.*') ? [key, key.slice(0, -2)] : [key];
  for (const path of reserved.reachable) {
    if (forms.some((form) => globMatches(form, path))) return true;
  }
  // Two wildcards: com.* and *.apple.* reach com.apple.*. A pattern closed by its own text,
  // such as *.com.1password or com.*.Olive.plist, is an ordinary name, and a reader checks
  // what it expands to on disk (section 9).
  const name = lastOf(platform, key);
  if (!name.endsWith('*')) return false;
  return reserved.protectedGlobs.some((pattern) => {
    if (parentOf(platform, pattern) !== parentOf(platform, key)) return false;
    return globMatches(name, `${lastOf(platform, pattern).split('*')[0]}x`);
  });
}

function checkPath(platform, rules, entry, where, errors, warnings) {
  if (!isObject(entry)) {
    errors.push(`${where} must be an object`);
    return;
  }

  if (!KINDS.has(entry.kind)) {
    errors.push(`${where}.kind must be one of ${[...KINDS].join(', ')}`);
  }
  if (entry.shared_with !== undefined) {
    const valid = Array.isArray(entry.shared_with) && entry.shared_with.length > 0 && entry.shared_with.every(isText);
    if (!valid) errors.push(`${where}.shared_with must be a non-empty list of app IDs`);
  }

  const path = entry.path;
  if (!isText(path)) {
    errors.push(`${where}.path must be a string`);
    return;
  }

  const separator = separatorOf(platform);
  const withoutTrailing = path.endsWith(separator) ? path.slice(0, -1) : path;
  const label = `${where}.path "${path}"`;

  if (!rules.prefixes.some((prefix) => path.startsWith(prefix))) {
    // A bare root such as %APPDATA% has no separator after it, so it gets the more useful message.
    const bare = rules.prefixes.some((prefix) => prefix.slice(0, -1) === withoutTrailing);
    errors.push(bare ? `${label} names a shared root` : `${label} must start with ${rules.prefixes.join(' or ')}`);
    return;
  }

  const components = withoutTrailing.split(separator);
  if (components.includes('..') || components.includes('.')) errors.push(`${label} must not contain . or ..`);
  if (components.slice(1).some((part) => part === '')) errors.push(`${label} has an empty component`);

  const rest = platform === 'windows' ? path.replace(/^%[A-Z]+%/, '') : path.replace(/^\$XDG_[A-Z]+_HOME/, '');
  if (rest.includes(platform === 'windows' ? '%' : '$')) errors.push(`${label} must not contain other variables`);
  if (/[?\[\]{}]/.test(path)) errors.push(`${label} supports only * as a wildcard`);

  // Windows reads several spellings as one file: trailing dots and spaces are dropped,
  // ~1 is a short name, a colon opens a stream, and NUL is a device.
  if (platform === 'windows') {
    if (path.includes('/')) errors.push(`${label} must use backslashes`);
    if (/[<>"|:]/.test(rest)) errors.push(`${label} has a character Windows does not allow in a name`);
    for (const part of components.slice(1)) {
      if (/[. ]$/.test(part)) errors.push(`${label} has a name ending in a dot or space`);
      if (WINDOWS_SHORT_NAME.test(part)) errors.push(`${label} uses a short 8.3 name`);
      if (WINDOWS_DEVICE.test(part)) errors.push(`${label} names a Windows device`);
    }
  }

  // A link in a shared bin folder is one named file that the app installed, and nothing else.
  if (rules.binRoot && path.startsWith(rules.binRoot)) {
    const name = path.slice(rules.binRoot.length);
    if (!name || name.includes('/') || name.includes('*') || name === '.' || name === '..') {
      errors.push(`${label} must name one file directly in ${rules.binRoot}`);
    }
    if (entry.kind !== 'component') errors.push(`${label} is in ${rules.binRoot}, so its kind must be component`);
    return;
  }

  let wildcardValid = true;
  const wildcard = components.findIndex((part) => part.includes('*'));
  if (wildcard !== -1) {
    const last = components[components.length - 1];
    const literal = last.replace(/\*/g, '');
    if (wildcard !== components.length - 1) {
      errors.push(`${label} allows * only in the last component`);
      wildcardValid = false;
    } else if (literal.length < MIN_WILDCARD_LITERAL) {
      errors.push(`${label} needs at least ${MIN_WILDCARD_LITERAL} literal characters beside *`);
      wildcardValid = false;
    }
    if (last.includes('**')) {
      errors.push(`${label} must not use **`);
      wildcardValid = false;
    }
  }

  const key = canonical(platform, path);
  const reserved = reservedFor(platform);
  const namesRoot = components.length === 1 || !key.includes(separator);
  if (namesRoot || reserved.shared.includes(key) || reserved.personal.includes(key)) errors.push(`${label} names a shared root`);
  if (isProtected(platform, key, reserved)) errors.push(`${label} is inside a protected location`);
  // A wildcard must not reach what the literal spelling could not: ~/.ss* is ~/.ssh.
  if (wildcard !== -1 && wildcardValid && wildcardReachesReserved(platform, key, reserved)) {
    errors.push(`${label} has a wildcard that matches a reserved location`);
  }

  const inPersonal = reserved.personal.some((root) => isInside(platform, key, root));
  if (inPersonal && entry.kind !== 'user') errors.push(`${label} is in a personal folder, so its kind must be user`);

  for (const [prefix, kind, wrong, shown] of rules.expectedKinds) {
    if (key.startsWith(prefix) && entry.kind === wrong) warnings.push(`${label} is under ${shown}, usually ${kind}`);
  }
}

// One spelling for each thing a registration can name, before comparing it with the list.
function normalizedRegistration(type, id) {
  const value = fold(id);
  const trimmed = (text) => (text.length > 1 && text.endsWith('\\') ? text.slice(0, -1) : text);
  switch (type) {
    case 'systemd-unit': {
      const unit = value.replace(/@[^.]*/, '');
      return /\.[a-z]+$/.test(unit) ? unit : `${unit.replace(/\.$/, '')}.service`;
    }
    case 'scheduled-task':
      return trimmed(value.startsWith('\\') ? value : `\\${value}`);
    case 'path-entry':
      // Win32 drops empty and . components, and trailing dots and spaces.
      return value
        .replace(/\//g, '\\')
        .replace(/^%systemdrive%/, 'c:')
        .split('\\')
        .map((part) => part.replace(/[. ]+$/, ''))
        .filter(Boolean)
        .join('\\');
    case 'launchd':
      return value.replace(/\.plist$/, '');
    case 'package':
      return value.replace(/:[^:]+$/, '');
    default:
      return value;
  }
}

function checkRegistration(platform, rules, entry, where, errors) {
  if (!isObject(entry)) {
    errors.push(`${where} must be an object`);
    return;
  }
  if (!rules.registrations.has(entry.type)) {
    errors.push(`${where}.type must be one of ${[...rules.registrations].join(', ')}`);
    return;
  }
  if (!isText(entry.id)) {
    errors.push(`${where}.id must be a string`);
    return;
  }
  const label = `${where}.id "${entry.id}"`;
  if (entry.id !== entry.id.trim()) {
    errors.push(`${label} has surrounding space`);
    return;
  }
  if (entry.type === 'launchd' && entry.id.includes('/')) {
    errors.push(`${label} must be a bare job label, with no domain`);
    return;
  }

  if ((entry.type === 'systemd-unit' && entry.id.includes('/')) || (entry.type === 'path-entry' && /(^|[\\/])\.\.([\\/]|$)/.test(entry.id))) {
    errors.push(`${label} must be one literal name, with no folders or ..`);
    return;
  }

  const reserved = RESERVED[platform];
  const names = (reserved.registration_names?.[entry.type] ?? []).map((name) => normalizedRegistration(entry.type, name));
  const prefixes = (reserved.registration_prefixes?.[entry.type] ?? []).map((prefix) => fold(prefix));
  const roots = (reserved.registration_roots?.[entry.type] ?? []).map((root) => normalizedRegistration(entry.type, root));

  if (entry.type === 'registry') {
    const match = /^(HKCU|HKLM)\\(.+)$/.exec(entry.id);
    if (!match) {
      errors.push(`${label} must start with HKCU\\ or HKLM\\`);
      return;
    }
    if (match[2].startsWith('\\') || /\\\\/.test(match[2])) {
      errors.push(`${label} has an empty component`);
      return;
    }
    if (match[2].split('\\').some((part) => part === '.' || part === '..')) {
      errors.push(`${label} must not contain . or ..`);
      return;
    }
    const key = fold(match[2])
      .replace(/\\+$/, '')
      .replace(/^wow6432node\\/, '')
      .replace(/\\wow6432node(?=\\|$)/g, '')
      .replace(/^system\\controlset\d+(?=\\|$)/, 'system\\currentcontrolset');
    const isKey = (list) => list.some((shared) => fold(shared) === key);
    const under = (list) => list.some((root) => key === fold(root) || key.startsWith(`${fold(root)}\\`));
    const holds = (list) => list.some((shared) => fold(shared).startsWith(`${key}\\`));
    if (isKey(reserved.registry_keys) || under(reserved.registry_subtrees) || holds(reserved.registry_keys) || holds(reserved.registry_subtrees)) {
      errors.push(`${label} names a shared registry key`);
      return;
    }
    const services = 'system\\currentcontrolset\\services\\';
    if (key.startsWith(services)) {
      const service = key.slice(services.length).split('\\')[0];
      if (reserved.registration_names.service.some((name) => fold(name) === service)) {
        errors.push(`${label} is reserved for the operating system`);
      }
    }
    return;
  }

  const id = normalizedRegistration(entry.type, entry.id);
  if (names.includes(id) || prefixes.some((prefix) => id.startsWith(prefix)) || roots.some((root) => id === root || id.startsWith(`${root}\\`))) {
    errors.push(`${label} is reserved for the operating system`);
  }
}

export function validate(document) {
  const errors = [];
  const warnings = [];

  if (!isObject(document)) return { errors: ['the file must contain a JSON object'], warnings };
  if (document.spec !== 0) errors.push('spec must be 0');
  if (!isText(document.name)) errors.push('name must be a string');
  // Section 4: text a tool may show or compare, anywhere in the document.
  const unsafe = (where, value) => {
    if (typeof value === 'string' && UNSAFE_TEXT.test(value)) errors.push(`${where} contains a control or bidirectional formatting character`);
  };
  unsafe('name', document.name);

  const present = Object.keys(PLATFORMS).filter((platform) => document[platform] !== undefined);
  if (present.length === 0) errors.push('the file needs at least one of macos, windows, linux');

  for (const platform of present) {
    const section = document[platform];
    const rules = PLATFORMS[platform];
    if (!isObject(section)) {
      errors.push(`${platform} must be an object`);
      continue;
    }
    const idValid = isText(section.id) || (platform === 'windows' && Array.isArray(section.id) && section.id.length > 0 && section.id.every(isText));
    if (!idValid) errors.push(`${platform}.id must be ${platform === 'windows' ? 'a string or a non-empty list of strings' : 'a string'}`);
    else [section.id].flat().forEach((id) => unsafe(`${platform}.id`, id));
    if (!Array.isArray(section.paths)) {
      errors.push(`${platform}.paths must be a list`);
    } else {
      section.paths.forEach((entry, index) => {
        const where = `${platform}.paths[${index}]`;
        checkPath(platform, rules, entry, where, errors, warnings);
        unsafe(`${where}.path`, entry?.path);
        if (Array.isArray(entry?.shared_with)) entry.shared_with.forEach((id) => unsafe(`${where}.shared_with`, id));
      });
      const seen = new Set();
      for (const entry of section.paths) {
        if (!isObject(entry) || !isText(entry.path)) continue;
        const key = canonical(platform, entry.path);
        if (seen.has(key)) errors.push(`${platform}.paths lists "${entry.path}" twice`);
        seen.add(key);
      }
    }
    if (section.registrations !== undefined) {
      if (!Array.isArray(section.registrations)) {
        errors.push(`${platform}.registrations must be a list`);
      } else {
        section.registrations.forEach((entry, index) => {
          const where = `${platform}.registrations[${index}]`;
          checkRegistration(platform, rules, entry, where, errors);
          unsafe(`${where}.id`, entry?.id);
        });
      }
    }
  }

  return { errors, warnings };
}

// Text from a hostile file goes to a terminal: an escape sequence must show as text.
export const printable = (value) =>
  String(value).replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
