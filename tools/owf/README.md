# OWF Tool

The CLI initializes a named local OWF Workspace, discovers it from descendant
directories, creates Markdown Projects and Outcomes, and creates, retrieves or
lists Actions and changes their execution state in the Workspace Operational Store. Inbox operations and the
future web interface are not yet implemented.

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
installed. Platform/runtime evidence for each change is recorded in its increment
outcome; increment 0002 also passed Linux verification on Node 24.19.0.

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

The first call creates `README.md`, `index.md`, `log.md`, `AGENTS.md` and `_store/owf.sqlite`.
The second returns `already_initialized`, the original title and the same absolute
root, without changing existing artifacts. Omit `--title` to use the directory
basename. Omit `--json` for human output. No prompts are required.

`npm run dev -- init ...` runs through tsx, but npm uses the package directory as
the working directory. Use the absolute built CLI path above for a user Workspace.
Alternatively, run `npm link` in the package directory, then use `owf init` from
the intended Workspace. Local linking is optional.

### Create Projects, Outcomes and Actions

From the trial Workspace root, using the same absolute `$cli` path:

```powershell
node $cli create project --title "Rekonštrukcia kuchyne" --slug kitchen --json
Set-Location _projects/kitchen
node $cli create outcome --title "Schválený návrh kuchyne"
node $cli create outcome --title "Materiály" --owner /_projects/kitchen/ --expected-result "Materiály sú vybrané." --json
node $cli create outcome --help
$action = node $cli create action --title "Call the supplier" --json | ConvertFrom-Json
node $cli create action --title "Confirm delivery" --owner / --description "Check the delivery date."
node $cli get action $action.result.action.id
node $cli get action $action.result.uri --json
node $cli set action $action.result.action.id --state waiting --waiting-for "Supplier reply" --json
node $cli set action $action.result.uri --state waiting --waiting-for "New reply date"
node $cli list actions --state open --state waiting --owner /_projects/kitchen/ --recursive --json
node $cli set action $action.result.uri --state completed
node $cli set action $action.result.uri --state open
node $cli list actions --json
node $cli list actions --owner / --json
node $cli list actions --owner /_projects/kitchen/ --json
node $cli list actions --owner /_projects/kitchen/ --recursive --json
```

Projects always become top-level entries in `/_projects/`. Outcomes use the nearest
Project/Outcome from the physical working directory; explicit `--owner` overrides
that context. Owners are Workspace-rooted directory URLs with a trailing slash,
not native filesystem paths. Encode special characters in each URL segment.
Owner paths use physical directories; explicit symlinks/junctions are rejected.
Archived owners and malformed owner hierarchies are rejected. A recognized,
accessible store remains required; Project/Outcome creation does not modify it.

Titles are trimmed single-line literal text. An Outcome's Expected Result defaults
to its title. `--slug` accepts lowercase ASCII letters/digits separated by single
hyphens (excluding Windows device names); otherwise it is derived from the title.
Existing targets, including case-only collisions, are errors. Existing navigation
indexes stay unchanged and can be maintained manually.

Actions start in `open`. Creation uses explicit `--owner` when supplied,
otherwise the nearest Project or Outcome in the working directory ancestry,
otherwise the Workspace (`/`). Use `--owner /` to select the Workspace
explicitly. Descriptions are literal Markdown text and may contain newlines.
The successful result includes all Action fields, its stable UUID and
`owf:action:<uuid>` URI. `get action` accepts either identifier from anywhere
inside that Workspace and returns the stored owner reference without resolving
the current Markdown owner. Human output shows title, ID, URI, state, owner,
description and timestamps; `--json` emits the complete result envelope.
The PowerShell example saves the creation response and passes its real ID/URI
to get. In the generated Workspace guide, `{id}` denotes that returned UUID.

`list actions` returns every Action in the discovered Workspace, even when run
from inside a Project. `--owner /` selects only Workspace-owned Actions;
`--owner /_projects/kitchen/` selects only Actions directly owned by that
Project. Add `--recursive` to include Actions whose stored owner URLs are below
that Project, including nested Outcomes. Recursive matching uses stored URL
references and complete path segments; a moved or missing Markdown owner does
not repair or change those references. Valid filters with no matches succeed
with an empty list. `--recursive` requires `--owner`.

`set action ID --state STATE` accepts `open`, `in_progress`, `waiting`,
`completed` and `cancelled`, including reopening terminal Actions. The optional
`--waiting-for` is valid only with `waiting` and must contain nonblank text;
it is preserved literally. Entering waiting without it starts without a reason.
While already waiting, supplying it replaces the reason, and omitting it keeps
the current reason. Leaving waiting clears the reason atomically. Clearing a
reason while remaining waiting is deferred.

A real change preserves ID, owner, title, description and `created_at`, updates
`updated_at`, and commits one `action.state_changed` event with old/new states
and waiting reasons. JSON uses the Action envelope with status `updated`.
An identical request succeeds as `unchanged`, with no new event or timestamp.
A failed transaction saves neither change nor event. `ACTION_NOT_FOUND` means
the ID is absent; invalid stored data and store errors remain distinct.
`ACTION_CONFLICT` reports a rejected conditional write; `ACTION_UPDATE_FAILED`
reports other transaction failures, including competing writer lock timeout.
If the system clock precedes the Action's creation time, a real change returns
`ACTION_UPDATE_FAILED` without changing the Action or its events. Correct the
clock and retry. An identical request still succeeds unchanged.
State changes work even after the Markdown owner directory disappears.

Repeat `list actions --state STATE` to match any listed state; duplicates do not
repeat Actions. Owner scope and state selection combine with AND. Comma-separated
states are invalid. Without state selection, terminal Actions are included.
Get and list stay read-only and include `waiting_for` only when present.
Archive, dependencies and derived blocking are not implemented.

Successful Project/Outcome JSON creation returns `ok`, `result` (status, type, title, root, url,
path, owner) and `warnings`. Log failures keep the usable object and return exit 0
with `LOG_WRITE_FAILED`; do not retry creation. Invalid arguments return exit 2;
Workspace, owner, collision and I/O errors return exit 1.

Action create/get return `{ ok: true, result: { status, type, root, uri, action },
warnings: [] }`. Action creation and its `action.created` event commit together;
a failure returns `ACTION_CREATE_FAILED` and saves neither record. Get is
read-only; a valid absent ID returns `ACTION_NOT_FOUND`, while store failures
retain their store diagnostics. Both commands use exit 2 for invalid arguments
or titles and exit 1 for operational errors.

Fresh initialization provides command examples in `AGENTS.md`. Repeat init never
overwrites or backfills that guide. Schema 1 and 2 Workspaces require a fresh
disposable directory for this version; existing instructions can be updated
manually using the commands documented here. An
existing `AGENTS.md` in a fresh directory prevents initialization.

The tool refuses target collisions and unavailable/unsupported stores. It does
not rename, repair, overwrite, or create nested Workspaces. Fresh initialization
creates `owf_metadata`, Actions, and the Operational Event Log with format
`owf-tool-operational` and schema version `3`; profile version `0.1` and package
version `0.0.0` are independent. Schema 1, 2 and unknown versions are rejected
without upgrade. Use a fresh disposable directory to try this version; do not
overwrite an existing Workspace. This is
limited profile support, not a claim of complete conformance.

Caught Workspace/Project/Outcome creation failures clean up owned artifacts and report paths if cleanup
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

## Read-only Action board

After `npm ci` and `npm run build` in `tools/owf`, enter an initialized Workspace
and run `node <absolute-path-to-tools/owf>/dist/bootstrap/cli.js serve` (or
`owf serve` when installed on PATH). Open **http://127.0.0.1:4317**.
The process serves its built assets; Vite is not needed. Ctrl+C stops it.
Use `serve --port 4318` for an occupied port. Only loopback access is supported.

The five columns retain listing order. Cards show title, ID, stored owner URL and
optional waiting reason. The board is read-only: change Actions through the CLI,
then return to the window/tab or press Refresh. Refresh retains cards; errors
mark existing data not current and offer Retry. There is no polling, filtering,
Action detail, drag and drop or multi-Workspace registration.

Install the Chromium test browser once with `npx playwright install chromium`.
`npm run verify` includes the one browser journey against the built server and
real CLI. `npm run test:browser` runs it alone after building; technical errors
and response races are covered in integration and component tests. Failure
screenshots and traces are diagnostics in `test-results/`, not snapshot assertions.
