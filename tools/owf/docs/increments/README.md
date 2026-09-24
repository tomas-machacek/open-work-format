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

Add each subsequent increment with a document
link and a one-line description; keep its status in sync.

| Increment                                                               | Description                                                            | Status      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| [0001 — Workspace initialization](0001-workspace-init.md)               | Establish CLI tooling and initialize/discover a named local Workspace. | completed   |
| [0002 — Project and Outcome creation](0002-project-outcome-creation.md) | Create Markdown work contexts and generate Workspace CLI guidance.     | completed   |
| [0003 — Action creation and retrieval](0003-action-create-get.md)       | Create Actions in the Operational Store and retrieve them by ID.       | completed   |
| [0004 — Action listing](0004-action-list.md)                            | List Actions by direct owner or recursively by owner subtree.          | completed   |
| [0005 — Action state changes](0005-action-state.md)                     | Change Action state and filter Actions by state.                       | in_progress |

Statuses: `draft`, `agreed`, `reviewed`, `in_progress`, `completed`, `cancelled`.
`reviewed` means the design has been reviewed and approved for implementation;
it does not mean implementation or code review is complete.
Completed means implemented, reviewed and verified against the agreed criteria;
it does not imply a release has been published.
