# OWF Tool

The CLI initializes a named local OWF Workspace and discovers it from descendant
directories. Actions, Inbox operations and the future web interface are not yet
implemented. Increment 0001 is complete.

See the [MVP scope](../../docs/design/mvp-scope.md) for included capabilities,
deferred features, and acceptance scenarios.

Keeping the tool in the specification repository allows related design, code,
and test changes to be reviewed together. The tool's technology choices and
Kanban interface are implementation decisions, not OWF Core requirements.

## Development documents

- [Architecture](docs/architecture.md) — layers, processes, persistence and technologies.
- [Development guidelines](docs/development-guidelines.md) — testing, lint, local verification and releases.
- [Increment index](docs/increments/README.md) — individual designs and implementation outcomes.
- [Agent instructions](AGENTS.md) — entry point for implementation and review agents.

## Setup and verification (Windows PowerShell)

Use Node.js **24.21.0** (also pinned in `.nvmrc`) and npm **11.4.1**, the versions
used for validation. Dependencies are pinned in the committed lockfile.

```powershell
Set-Location C:\Users\tomas\Projects\open-work-format\tools\owf
node --version
npm --version
npm ci
npm run build
npm run verify
```

`verify` checks types (including tests/configuration), lint, formatting and module
boundaries, builds production code, then runs unit, integration, Cucumber and CLI
process suites. `npm run test:e2e` runs only CLI tests and requires a prior build.
`npm run format` applies formatting. All checks are local; no Git hooks or CI are
installed. Linux verification also passed; platform/runtime details are recorded in the
increment outcome.

### Windows: Vitest cannot find the current suite

If Vitest reports "failed to find the current suite", enter the package directory
with an uppercase drive letter before running tests. This workaround was confirmed
locally by the user with Node 24.21.0 and Vitest 5.0.1:

```powershell
cd C:\Users\tomas\Projects\open-work-format\tools\owf
npm run verify
```

Use your own checkout path and preserve the uppercase `C:` (or your drive letter).
See [Vitest issue 10692](https://github.com/vitest-dev/vitest/issues/10692).

## Try it outside the checkout

```powershell
$cli = (Resolve-Path .\dist\bootstrap\cli.js).Path
$trial = Join-Path $env:TEMP ('owf-trial-' + [guid]::NewGuid())
New-Item -ItemType Directory $trial | Out-Null
Set-Location $trial
node $cli init --title "Moja práca" --json
Get-Content README.md, index.md, log.md
New-Item -ItemType Directory child | Out-Null
Set-Location child
node $cli init --title "Iný názov" --json
node $cli --help
node $cli --version
```

The first call creates `README.md`, `index.md`, `log.md` and `_store/owf.sqlite`.
The second returns `already_initialized`, the original title and the same absolute
root, without changing existing artifacts. Omit `--title` to use the directory
basename. Omit `--json` for human output. No prompts are required.

`npm run dev -- init ...` runs through tsx, but npm uses the package directory as
the working directory. Use the absolute built CLI path above for a user Workspace.
Alternatively, run `npm link` in the package directory, then use `owf init` from
the intended Workspace. Local linking is optional.

The tool refuses target collisions and unavailable/unsupported stores. It does
not rename, repair, overwrite, or create nested Workspaces. The initial store
contains only `owf_metadata` with format `owf-tool-operational` and schema version
`1`; profile version `0.1` and package version `0.0.0` are independent. This is
limited profile support, not a claim of complete conformance.

Caught creation failures clean up owned artifacts and report paths if cleanup
fails. Process termination or power loss can leave partial artifacts requiring
manual inspection. Concurrent initialization and crash recovery are deferred.

## Local releases

After independent review and successful verification of the intended revision,
start with a clean working tree and run `npm run release -- --increment patch`
(or another explicitly chosen version). Configuration updates both package files,
creates `chore(owf): release <version>` and tag `owf-v<version>`, and disables push,
npm publication, GitHub and GitLab releases. Verification is not repeated by the
release command. A dry run uses `npm run release -- --ci --dry-run --increment patch`;
run it in a disposable repository copy when validating release configuration.
No actual release has been created for this increment.

## License

Copyright 2026 Tomáš Macháček.

Except where otherwise noted, the code and accompanying tool documentation
under this directory are licensed under the [Apache License 2.0](LICENSE)
(SPDX: `Apache-2.0`).

The OWF specification, design documents, and Workspace examples outside this
directory remain under CC BY 4.0, as described in the
[repository README](../../README.md#license). Third-party components retain
their respective licenses.
