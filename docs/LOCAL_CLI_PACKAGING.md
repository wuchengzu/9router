# Local CLI Packaging Notes

This document records the local packaging flow for `9routerd` and the versioning rule used for downstream builds.

## Version Rule

- The base semver, for example `0.4.18`, represents the upstream base version.
- Do not change the base semver unless the branch has been rebased onto a newer upstream release.
- Local/downstream rebuilds only increment the build metadata suffix, for example:
  - `0.4.18+1`
  - `0.4.18+2`
  - `0.4.18+3`
- The root app package can remain at the upstream base version. For the CLI npm package, update `packages/cli/package.json`.
- Keep `tests/unit/cli-package.test.js` in sync with the CLI package version.

## Local Build And Install Flow

Run these commands from the repository root unless noted otherwise:

```bash
npm test -- cli-package.test.js --prefix tests
npm test -- translator-request-normalization.test.js -t "maps Chat Completions token limits to Responses max_output_tokens" --prefix tests
npm run build
npm --prefix packages/cli run prepare:app
npm pack --pack-destination /Users/admin/coding/9router --prefix packages/cli
npm install -g /Users/admin/coding/9router/9routerd-<version>.tgz
```

After install, verify the globally installed CLI version:

```bash
command -v 9routerd
node -e "const fs=require('fs'), path=require('path'), cp=require('child_process'); const bin=fs.realpathSync(cp.execSync('command -v 9routerd',{encoding:'utf8'}).trim()); const pkg=path.resolve(path.dirname(bin),'..','package.json'); console.log(JSON.parse(fs.readFileSync(pkg,'utf8')).version);"
```

## 2026-05-07 Operation Record

Context:

- Fixed OpenAI-compatible Responses model testing by mapping Chat Completions token limits to Responses `max_output_tokens`.
- Kept upstream base version unchanged at `0.4.18`.
- Bumped only the CLI build metadata suffix from `0.4.18+1` to `0.4.18+2`.

Files changed for the package version:

- `packages/cli/package.json`: `0.4.18+1` -> `0.4.18+2`
- `tests/unit/cli-package.test.js`: expected package version updated to `0.4.18+2`

Commands run:

```bash
npm test -- cli-package.test.js --prefix tests
npm test -- translator-request-normalization.test.js -t "maps Chat Completions token limits to Responses max_output_tokens" --prefix tests
npm run build
npm --prefix packages/cli run prepare:app
npm pack --pack-destination /Users/admin/coding/9router --prefix packages/cli
npm install -g /Users/admin/coding/9router/9routerd-0.4.18+2.tgz
```

Observed results:

- `cli-package.test.js`: 2 tests passed.
- Responses token mapping regression test: 1 test passed.
- Next production build completed successfully.
- CLI app bundle prepared at `packages/cli/app`.
- Local tarball generated at `/Users/admin/coding/9router/9routerd-0.4.18+2.tgz`.
- Global install completed with npm.
- Installed global package version verified as `0.4.18+2`.

Note:

- `packages/cli/app` and `.next` are generated build artifacts and may change during the build/pack flow.
- The generated tarball is a local install artifact; decide separately whether to keep it in the working tree.
