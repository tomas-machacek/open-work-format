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
`show view` evaluates current Actions without persisting placements. Unblocked
Open Actions route to New to organize; Todo stays empty while all Actions are
unplaced. Shared-definition instances show the same current Workspace content.
