# 0015 — Repair development dependency vulnerabilities

> Status: completed
> Description: Remove the reported npm audit vulnerabilities while retaining the existing release workflow.
> Depends on: [0001 — Workspace initialization](0001-workspace-init.md).

The user authorized completion of the dependency repair on 2026-10-06, after
running `npm audit fix` on main. Preserve that lockfile change on a dedicated
branch; implementation agreement is recorded here before further dependency edits.

## Goal and scope

Repair the reported development dependency vulnerabilities. Keep release-it
21.0.3, runtime dependencies, OWF behavior and local release configuration.
No release, tag, publishing, CI or unrelated dependency updates are included.
Follow the [architecture](../architecture.md) and
[development guidelines](../development-guidelines.md).

## Proposed solution

Retain the user's compatible source-map-js update from 1.2.1 to 1.2.2.
Add exact npm overrides scoped to release-it 21.0.3: undici 7.29.1 and,
under get-uri 8.0.1, basic-ftp 6.2.1. Regenerate the lockfile with npm and
verify a reproducible install. The current upstream release-it 21.1.0 still
pins undici 7.29.0 and proxy-agent 8.0.2; get-uri 8.0.1 still requires
basic-ftp ^5.3.1. Updating release-it alone therefore does not repair the chain.

basic-ftp 6 disables separate transfer hosts by default for security. Preserve
that default and verify get-uri's FTP download including its `client.list()` fallback
against a local server. Do not enable the insecure legacy behavior.

References:

- [basic-ftp advisory](https://github.com/advisories/GHSA-c475-qrg2-pj4r)
- [basic-ftp 6 migration](https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0)
- [undici fixes](https://github.com/nodejs/undici/releases/tag/v7.29.1)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

## Acceptance criteria

AC1: Full `npm audit` and `npm audit --omit=dev` report zero vulnerabilities.

AC2: `npm ci` installs the committed dependency graph; the overrides affect
only the release-it chain. jsdom's undici 8 and production dependencies remain
unchanged. No downgrade of release-it or audit suppression is introduced.

AC3: get-uri can obtain file metadata through `client.list()` (MLSD) and download an FTP file
from a local server with basic-ftp 6.2.1. release-it starts successfully in a
dry run with Git/npm/remote release actions disabled.

AC4: `npm run verify` passes on Windows. The diff is reviewed against these
criteria; record actual results and limitations before completion.

## Verification plan

Inspect the manifest/lockfile diff and resolved dependency tree; run npm ci,
both audits, a disposable local FTP compatibility probe, a release-it dry run,
and the full existing verify command. Reuse existing behavioral tests rather
than adding tests that merely repeat package version strings.

Human trial: `npm ci`, `npm audit`, `npm run verify` on the repair branch.

## Implementation and review outcome

Delivered on branch `fix/owf-dependency-audit`, based on main revision
`307bb4c`. The user's uncommitted source-map-js repair was preserved when
creating the branch. Added the two scoped overrides; npm regenerated the
lockfile with changes limited to basic-ftp, source-map-js and undici versions,
tarball URLs and integrity hashes. No application code or release configuration
changed.

Verification on Windows, Node.js `v24.21.0`, npm `11.4.1`:

- `npm ci` passed (568 installed packages).
- `npm audit` and `npm audit --omit=dev` each reported zero vulnerabilities.
- `npm ls basic-ftp source-map-js undici release-it` confirmed the intended
  versions, scoped overrides and unchanged jsdom undici `8.11.2`.
- A disposable Node probe used a local FTP server rejecting MDTM and providing
  MLSD metadata, then verified get-uri's `client.list()` fallback, modification
  date and exact downloaded content. A local HTTP request through undici also
  verified status and exact response content. Both passed; the probe was removed.
  An initial Unix LIST fixture had no `modifiedAt` metadata, which get-uri
  requires; the completed probe used MLSD metadata supported by basic-ftp.
- `node node_modules/release-it/bin/release-it.js patch --dry-run --ci --no-git
--no-npm --no-github --no-gitlab` passed without a release or version change.
- Full `npm run verify` passed: typecheck, lint, formatting, architecture
  (46 modules, no violations), build, 90 unit tests, 145 integration tests,
  25 acceptance scenarios / 127 steps, 22 CLI E2E tests and 4 Chromium browser
  journeys. Subsequent edits changed only increment documentation; the focused
  formatting and whitespace checks were repeated before commit.

Independent review in a separate agent session inspected the actual diff,
acceptance criteria, resolved tree and FTP APIs. No blocking dependency findings.
The review found a blank line that detached the new increment index row from
its Markdown table; removed the line and reformatted the table.

Limitations: validation was on Windows only. The compatibility probes covered
local plain FTP with MLSD and HTTP, not FTPS, external PAC/proxy servers or remote
release operations. basic-ftp 6 intentionally rejects a separate PASV transfer
host by default. No push, merge, tag or release was performed.

## Decision changes and follow-up

Remove these scoped overrides when upstream dependency declarations adopt
fixed versions, with a fresh audit and compatibility verification.
