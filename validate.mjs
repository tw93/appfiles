#!/usr/bin/env node
// Checks an appfiles.json against the rules in appfiles.md. No dependencies.
// Usage: node validate.mjs path/to/appfiles.json
// Exit codes: 0 valid, 1 invalid, 2 could not read the file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KINDS = new Set(['user', 'component', 'data', 'config', 'state', 'log', 'cache']);

const PLATFORMS = {
  macos: {
    registrations: new Set(['launchd', 'login-item', 'pkg', 'system-extension', 'kext']),
    prefixes: ['~/', '/Library/', '/usr/local/bin/'],
    binRoot: '/usr/local/bin/',
    sharedRoots: new Set([
      '~/Library',
      '~/Library/Application Support',
      '~/Library/Application Scripts',
      '~/Library/Caches',
      '~/Library/Containers',
      '~/Library/Cookies',
      '~/Library/Group Containers',
      '~/Library/HTTPStorages',
      '~/Library/LaunchAgents',
      '~/Library/Logs',
      '~/Library/Preferences',
      '~/Library/Preferences/ByHost',
      '~/Library/Saved Application State',
      '~/Library/WebKit',
      '~/Applications',
      '~/.config',
      '~/.cache',
      '~/.local',
      '~/.local/bin',
      '~/.local/share',
      '~/.local/state',
      '~/.ssh',
      '~/.gnupg',
      '~/.aws',
      '/Library/Application Support',
      '/Library/Audio',
      '/Library/Audio/Plug-Ins',
      '/Library/Audio/Plug-Ins/Components',
      '/Library/Audio/Plug-Ins/VST',
      '/Library/Audio/Plug-Ins/VST3',
      '/Library/Caches',
      '/Library/Extensions',
      '/Library/Fonts',
      '/Library/Frameworks',
      '/Library/LaunchAgents',
      '/Library/LaunchDaemons',
      '/Library/Logs',
      '/Library/Preferences',
      '/Library/PrivilegedHelperTools',
    ]),
    secretRoots: ['~/.ssh/', '~/.gnupg/', '~/.aws/'],
    personalRoots: ['~/Documents', '~/Desktop', '~/Downloads', '~/Movies', '~/Music', '~/Pictures'],
    expectedKinds: [
      ['~/Library/Caches/', 'cache', 'data'],
      ['~/Library/Logs/', 'log', 'data'],
    ],
  },
  windows: {
    registrations: new Set(['registry', 'run-value', 'service', 'scheduled-task', 'firewall-rule', 'path-entry', 'package']),
    prefixes: ['%APPDATA%\\', '%LOCALAPPDATA%\\', '%PROGRAMDATA%\\', '%USERPROFILE%\\'],
    sharedRoots: new Set([
      '%USERPROFILE%\\AppData',
      '%USERPROFILE%\\AppData\\Local',
      '%USERPROFILE%\\AppData\\LocalLow',
      '%USERPROFILE%\\AppData\\Roaming',
      '%USERPROFILE%\\.config',
      '%USERPROFILE%\\.cache',
      '%USERPROFILE%\\.local',
      '%USERPROFILE%\\.local\\share',
      '%USERPROFILE%\\.ssh',
      '%USERPROFILE%\\.aws',
      '%USERPROFILE%\\.gnupg',
      '%APPDATA%\\Microsoft',
      '%APPDATA%\\Microsoft\\Windows',
      '%APPDATA%\\Microsoft\\Windows\\SendTo',
      '%APPDATA%\\Microsoft\\Windows\\Start Menu',
      '%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs',
      '%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
      '%LOCALAPPDATA%\\Microsoft',
      '%LOCALAPPDATA%\\Microsoft\\WindowsApps',
      '%LOCALAPPDATA%\\Packages',
      '%LOCALAPPDATA%\\Programs',
      '%LOCALAPPDATA%\\Temp',
      '%PROGRAMDATA%\\Microsoft',
    ]),
    secretRoots: ['%USERPROFILE%\\.ssh\\', '%USERPROFILE%\\.aws\\', '%USERPROFILE%\\.gnupg\\'],
    personalRoots: [
      '%USERPROFILE%\\Documents',
      '%USERPROFILE%\\Desktop',
      '%USERPROFILE%\\Downloads',
      '%USERPROFILE%\\Videos',
      '%USERPROFILE%\\Music',
      '%USERPROFILE%\\Pictures',
    ],
    expectedKinds: [],
  },
  linux: {
    registrations: new Set(['systemd-unit', 'package']),
    prefixes: ['~/', '$XDG_CONFIG_HOME/', '$XDG_DATA_HOME/', '$XDG_STATE_HOME/', '$XDG_CACHE_HOME/', '/etc/', '/var/lib/'],
    sharedRoots: new Set([
      '~/.config',
      '~/.cache',
      '~/.local',
      '~/.local/bin',
      '~/.local/share',
      '~/.local/state',
      '~/.var',
      '~/.var/app',
      '~/.ssh',
      '~/.gnupg',
      '~/.aws',
      '$XDG_CONFIG_HOME/autostart',
      '$XDG_CONFIG_HOME/systemd',
      '$XDG_CONFIG_HOME/systemd/user',
      '$XDG_DATA_HOME/applications',
    ]),
    secretRoots: ['~/.ssh/', '~/.gnupg/', '~/.aws/'],
    personalRoots: ['~/Documents', '~/Desktop', '~/Downloads', '~/Videos', '~/Music', '~/Pictures'],
    expectedKinds: [
      ['$XDG_CACHE_HOME/', 'cache', 'data'],
      ['~/.cache/', 'cache', 'data'],
    ],
  },
};

// Keys too broad to hand to any tool, whatever the app says.
const SHARED_REGISTRY_KEYS = new Set([
  'software',
  'software\\classes',
  'software\\microsoft',
  'software\\microsoft\\windows',
  'software\\microsoft\\windows\\currentversion',
  'software\\microsoft\\windows\\currentversion\\run',
  'software\\microsoft\\windows\\currentversion\\runonce',
  'software\\microsoft\\windows\\currentversion\\uninstall',
  'software\\wow6432node',
  'software\\wow6432node\\microsoft',
  'system',
  'system\\currentcontrolset',
  'system\\currentcontrolset\\services',
]);

const startsWithAny = (value, prefixes) => prefixes.some((prefix) => value.startsWith(prefix));
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
const comparable = (platform, path) => (platform === 'windows' ? path.toLowerCase() : path);

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

  const separator = platform === 'windows' ? '\\' : '/';
  const withoutTrailing = path.endsWith(separator) ? path.slice(0, -1) : path;
  const label = `${where}.path "${path}"`;

  if (!rules.prefixes.some((prefix) => path.startsWith(prefix))) {
    // A bare root such as %APPDATA% has no separator after it, so it gets the more useful message.
    const bare = rules.prefixes.some((prefix) => prefix.slice(0, -1) === withoutTrailing);
    errors.push(bare ? `${label} names a shared root` : `${label} must start with ${rules.prefixes.join(' or ')}`);
    return;
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

  const components = withoutTrailing.split(separator);
  if (components.includes('..') || components.includes('.')) errors.push(`${label} must not contain . or ..`);
  if (components.slice(1).some((part) => part === '')) errors.push(`${label} has an empty component`);
  if (platform === 'windows' && path.includes('/')) errors.push(`${label} must use backslashes`);

  const variables = platform === 'windows' ? path.match(/%[^%\\]*%/g) ?? [] : path.match(/\$[A-Za-z_{]/g) ?? [];
  if (variables.length > 1 || (variables.length === 1 && components[0] !== variables[0] && platform === 'windows')) {
    errors.push(`${label} must not contain other variables`);
  }
  if (platform !== 'windows' && path.lastIndexOf('$') > 0) errors.push(`${label} must not contain other variables`);

  if (/[?\[\]{}]/.test(path)) errors.push(`${label} supports only * as a wildcard`);
  const wildcard = components.findIndex((part) => part.includes('*'));
  if (wildcard !== -1) {
    const last = components[components.length - 1];
    const literal = last.replace(/\*/g, '');
    if (wildcard !== components.length - 1) errors.push(`${label} allows * only in the last component`);
    else if (literal.length < 3) errors.push(`${label} needs at least three literal characters beside *`);
    if (last.includes('**')) errors.push(`${label} must not use **`);
  }

  const key = comparable(platform, withoutTrailing);
  const sharedRoots = [...rules.sharedRoots].map((root) => comparable(platform, root));
  const personalRoots = rules.personalRoots.map((root) => comparable(platform, root));
  if (sharedRoots.includes(key) || personalRoots.includes(key)) errors.push(`${label} names a shared root`);
  if (components.length === 1 || (components.length === 2 && components[0] === '~' && components[1] === '')) {
    errors.push(`${label} names a shared root`);
  }
  if (startsWithAny(comparable(platform, path), rules.secretRoots.map((root) => comparable(platform, root)))) {
    errors.push(`${label} is inside a credentials folder`);
  }

  const inPersonalRoot = personalRoots.some((root) => key === root || key.startsWith(root + comparable(platform, separator)));
  if (inPersonalRoot && entry.kind !== 'user') errors.push(`${label} is in a personal folder, so its kind must be user`);

  for (const [prefix, kind, wrong] of rules.expectedKinds) {
    if (path.startsWith(prefix) && entry.kind === wrong) warnings.push(`${label} is under ${prefix}, usually ${kind}`);
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
  if (entry.type === 'registry') {
    const match = /^(HKCU|HKLM)\\(.+)$/.exec(entry.id);
    if (!match) {
      errors.push(`${where}.id "${entry.id}" must start with HKCU\\ or HKLM\\`);
      return;
    }
    if (SHARED_REGISTRY_KEYS.has(match[2].replace(/\\+$/, '').toLowerCase())) {
      errors.push(`${where}.id "${entry.id}" names a shared registry key`);
    }
  }
}

export function validate(document) {
  const errors = [];
  const warnings = [];

  if (!isObject(document)) return { errors: ['the file must contain a JSON object'], warnings };
  if (document.spec !== 0) errors.push('spec must be 0');
  if (!isText(document.name)) errors.push('name must be a string');

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
    if (!Array.isArray(section.paths)) {
      errors.push(`${platform}.paths must be a list`);
    } else {
      section.paths.forEach((entry, index) => checkPath(platform, rules, entry, `${platform}.paths[${index}]`, errors, warnings));
      const seen = new Set();
      for (const entry of section.paths) {
        if (!isObject(entry) || !isText(entry.path)) continue;
        const key = comparable(platform, entry.path);
        if (seen.has(key)) errors.push(`${platform}.paths lists "${entry.path}" twice`);
        seen.add(key);
      }
    }
    if (section.registrations !== undefined) {
      if (!Array.isArray(section.registrations)) {
        errors.push(`${platform}.registrations must be a list`);
      } else {
        section.registrations.forEach((entry, index) => checkRegistration(platform, rules, entry, `${platform}.registrations[${index}]`, errors));
      }
    }
  }

  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node validate.mjs path/to/appfiles.json');
    process.exit(2);
  }
  let document;
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${file}: ${error.message}`);
    process.exit(2);
  }
  const { errors, warnings } = validate(document);
  for (const warning of warnings) console.log(`warning: ${warning}`);
  for (const error of errors) console.log(`error: ${error}`);
  if (errors.length > 0) {
    console.log(`${file}: invalid, ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`${file}: valid`);
}
