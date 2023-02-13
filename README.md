# SiennaJS [![](https://img.shields.io/github/package-json/v/SiennaNetwork/siennajs?label=siennajs&style=flat-square)](https://github.com/SiennaNetwork/siennajs/releases)

Official API client for [Sienna Network](https://sienna.network/).

## Install

SiennaJS does not depend on NPM. The official way to install latest SiennaJS
is from the tarballs published on GitHub, e.g:

See the [SiennaJS releases page](https://github.com/SiennaNetwork/siennajs/releases)
for a list of available versions.

```sh
npm i --save https://github.com/SiennaNetwork/siennajs/releases/download/X.Y.Z/siennajs-X.Y.Z.tgz
# now you can `import "siennajs"` using your regular toolchain
```

See the [API documentation for the last released version](https://siennanetwork.github.io/siennajs/modules.html)
for usage details.

This way, SiennaJS will appear in your `node_modules` as any other NPM package,
and will be available in your usual TS/ESM/CJS context.

## Developing

### PNPM is recommended
 - `npm install -g pnpm` if PNPM is not installed.
 - Subsequent examples are given with PNPM.

### Setting up
 - `pnpm i`

### Checking types
 - `pnpm check` to see if the types all check out

### Generating documentation
 - `pnpm typedoc` to generate typedoc in `./docs`

### The pre-commit linter 
 - With great reluctance I introduce `husky` and `lint-staged`.
 - Loose ends from multiple simultaneous refactors can add up to 500 type errors real quick.
 - 500 type errors means you can't publish until you fix them, because there's no point
   releasing invalid typings, incomplete builds, etc. (TS is annoying enough as it is.)

### Using SiennaJS as a Git submodule
 - In a downstream project: `git submodule add https://github.com/SiennaNetwork/siennajs`

### The CI
 - FIXME TODO write docs

### Upgrading Fadroma/Toolbox dependencies:
 - FIXME TODO write docs
