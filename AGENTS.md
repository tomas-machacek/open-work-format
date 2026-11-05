# OWF Repository Agent Instructions

Open Work Format (OWF) is a lightweight, tool-independent model for personal
knowledge work. This repository contains the specification, design material
and a reference CLI/web implementation under `tools/owf/`.

## Repository map

- [spec/core-v0.md](spec/core-v0.md): normative Core semantics.
- [docs/design/](docs/design/): design decisions, rationale and profile notes.
- [tools/owf/](tools/owf/): reference implementation and its development guidance.
- [examples/](examples/): reserved for non-normative Workspace examples;
  concrete examples are deferred until the representation profile is defined.

## Choose a task route

For specification or design work, start with the relevant sections of
[Core v0](spec/core-v0.md) and the design document for the topic, such as the
[representation profile](docs/design/representation-profile-notes.md),
[Operational Store](docs/design/operational-store-notes.md) or
[Views profile](docs/design/views-profile-notes.md). Core owns normative semantics;
design notes describe their representation and supporting design decisions.

For tool planning, implementation or review, first read
[tools/owf/AGENTS.md](tools/owf/AGENTS.md), including before changing files under
`tools/owf/`. Use the [increment index](tools/owf/docs/increments/README.md) to
locate the current increment. The nested entry point routes tool work to the
code map and applicable engineering rules.

These repository instructions guide development. The tool also generates
operational `AGENTS.md` guidance inside user Workspaces for working with their
OWF data; that guidance serves a separate audience and purpose.
