# OWF Tool

This directory is the home of the first OWF implementation: a local web
interface and CLI sharing operational logic. Implementation has not started.

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

Development uses Node.js 24 LTS and TypeScript, with a standalone CLI and local
web GUI. Verification is local; GitHub Actions are deferred. These documents
record decisions only: commands/configuration do not exist yet, and the first
increment, [Workspace initialization](docs/increments/0001-workspace-init.md),
is defined in a draft for review.

## License

Copyright 2026 Tomáš Macháček.

Except where otherwise noted, the code and accompanying tool documentation
under this directory are licensed under the [Apache License 2.0](LICENSE)
(SPDX: `Apache-2.0`).

The OWF specification, design documents, and Workspace examples outside this
directory remain under CC BY 4.0, as described in the
[repository README](../../README.md#license). Third-party components retain
their respective licenses.
