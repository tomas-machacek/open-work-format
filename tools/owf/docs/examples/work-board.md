---
type: OWF View Definition
title: Work board
description: Shared configuration for organizing work.
owf:
  purpose: focus
  renderer: kanban
  defaults:
    open: new-actions
  columns:
    - id: new-actions
      title: New to organize
      status: open
    - id: todo
      title: Todo
      status: open
    - id: active
      title: Active
      status: [in_progress, waiting]
      include_blocked: true
    - id: blocked
      title: Blocked
      type: blocked
    - id: done
      title: Done
      status: completed
---

# Work board

Reusable state and blocking configuration. `get view` validates configuration;
`show view` evaluates current Actions without writing. Unplaced unblocked Open
Actions route to New to organize. Use `owf move action ACTION_ID --view VIEW_ID
--column todo` to organize one in Todo without changing state. Each instance keeps
its own placement and column order; Action state and content are shared. Add
`--position 1` to insert or reorder at the first position. Omission appends on
cross-column entry or preserves same-column order. Refresh the browser to see
CLI ordering changes. New instances start in ascending Action ID order; later
arrivals append and departures discard their old position.

In the browser choose this instance and use **+ Add Action** under Todo to create
an Open Action directly there. Active creates In Progress (its default); Blocked
has no creation control. The owner defaults to Workspace, not the View. Open a
card's detail and choose **Delete action** to confirm global permanent deletion.
