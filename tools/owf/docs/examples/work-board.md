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
its own placement; Action state and content are shared. Members use ascending
Action ID order; manual ordering is deferred. Refresh the browser to see CLI moves.
