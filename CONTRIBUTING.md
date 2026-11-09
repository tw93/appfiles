# Contributing

The most useful report is an app the format cannot describe, or a file the steps missed. Please [open an issue](https://github.com/tw93/appfiles/issues/new/choose) with the app, the platform and the path.

Added the file to your app? Open an issue or PR and it goes in the table in the README.

## Changing the format

`SPEC.md` is the source of truth, so a change starts there. The same pull request updates what follows from it:

- `appfiles.schema.json`, when the shape changes
- `reserved.json`, when a name is added or removed, with where you saw it on a real machine
- `validate.mjs`, for anything a program can check
- `tests/vectors.json`, one case that fails without the change and, for a new refusal, one close neighbour that stays valid
- `appfiles.md`, when an author has to do something differently
- `CHANGELOG.md`, what changed and why
- `README.md` and `README_CN.md`, when what they say changes

A change to the path rules also has to be run against every path in Homebrew's `zap` lists, which are in the `artifacts` of [its cask API](https://formulae.brew.sh/api/cask.json), and the pull request says how many are newly refused and why. A rule that looked right on its own nearly refused 934 real third-party files.

## Running the tests

```bash
npm install --no-save --no-package-lock ajv@8.17.1
node --test validate.test.mjs
```

The validator and reader have no dependencies and that stays true. `ajv` is only for the test that runs the schema, which is skipped without it locally and required in CI.
