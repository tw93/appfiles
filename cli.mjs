#!/usr/bin/env node
// npx github:tw93/appfiles <appfiles.json | Example.app | folder>
// A file is validated. An app or folder goes to the read-only reference reader.
// Exit codes: 0 fine, 1 invalid or ignored, 2 could not read the input.

import { readFileSync, statSync } from 'node:fs';
import { runInspect } from './inspect.mjs';
import { MAX_FILE_BYTES, printable, validate } from './validate.mjs';

const target = process.argv[2];
if (!target) {
  console.error('usage: appfiles <appfiles.json | Example.app | folder>');
  process.exit(2);
}

let document;
try {
  const stat = statSync(target);
  if (stat.isDirectory()) process.exit(runInspect(target));
  if (!stat.isFile()) throw new Error('not a regular file');
  if (stat.size > MAX_FILE_BYTES) throw new Error('larger than the 1 MiB limit');
  document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(target)));
} catch (error) {
  console.error(`cannot read ${printable(target)}: ${printable(error.message)}`);
  process.exit(2);
}
const { errors, warnings } = validate(document);
for (const warning of warnings) console.log(`warning: ${printable(warning)}`);
for (const error of errors) console.log(`error: ${printable(error)}`);
if (errors.length > 0) {
  console.log(`${printable(target)}: invalid, ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`${printable(target)}: valid`);
