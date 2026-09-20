# Implementation Increments

Each increment has its own design document, agreed before development and
retained after implementation. This applies to the MVP and later features.

Use stable sequential names such as `0001-short-title.md`. Numbers identify
increments, not releases; one release may contain several increments.
Do not reuse numbers or rename completed documents merely to reorder the list.

Start from the [template](template.md). Keep the document proportionate to the
change. The [development guidelines](../development-guidelines.md#increment-documents)
define the workflow and how to keep the record useful after implementation.

## Index

The first increment is complete. Add each subsequent increment with a document
link and a one-line description; keep its status in sync.

| Increment                                                 | Description                                                            | Status    |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| [0001 — Workspace initialization](0001-workspace-init.md) | Establish CLI tooling and initialize/discover a named local Workspace. | completed |

Statuses: `draft`, `agreed`, `in_progress`, `completed`, `cancelled`.
Completed means implemented, reviewed and verified against the agreed criteria;
it does not imply a release has been published.
