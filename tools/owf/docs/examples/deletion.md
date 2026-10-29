# Permanent deletion walkthrough

Use a fresh disposable schema 9 Workspace initialized with `owf init`. The CLI
discovers it from its root or descendants and needs no server. Replace IDs below
with real UUIDs from command results. Deletion executes immediately without a
confirmation prompt or flag, undo, trash or force bypass.

```sh
owf create action --title "Prerequisite" --state completed --json
owf create action --title "Dependent" --json
owf set action DEPENDENT_ID --add-dependency PREREQUISITE_ID
owf delete action PREREQUISITE_ID --json
```

The last command fails with `ACTION_IN_USE`, exit 1, identifying the dependent's
URI and title. A completed prerequisite is still referenced. Explicitly remove
that dependency before deleting:

```sh
owf set action DEPENDENT_ID --remove-dependency PREREQUISITE_ID
owf delete action owf:action:PREREQUISITE_ID --json
owf get action PREREQUISITE_ID --json
```

Deletion returns a receipt with `status: "deleted"`, type, root, ID, title and
Action URI. Get or repeated delete returns `ACTION_NOT_FOUND`, exit 1, without
creating another deletion event. The dependent survives without that dependency.

Copy [work-board.md](work-board.md) into the Workspace's `_views/` directory and
create two instances referencing the same definition:

```sh
owf create view --title "First" --definition /_views/work-board.md --json
owf create view --title "Second" --definition /_views/work-board.md --json
owf create action --title A --json
owf create action --title B --json
owf create action --title C --json
owf move action A_ID --view FIRST_VIEW_ID --column todo
owf move action B_ID --view FIRST_VIEW_ID --column todo
owf move action C_ID --view FIRST_VIEW_ID --column todo
owf delete action B_ID
owf show view FIRST_VIEW_ID
owf show view SECOND_VIEW_ID
owf delete view FIRST_VIEW_ID --json
owf list views
owf get action A_ID
```

The first View retains Todo order A, C at positions 1, 2; both Views omit B.
Deleting the first instance preserves all surviving Actions, dependencies,
the definition file and the second instance's independent organization.
View receipts omit the Action URI. View selectors are instance UUIDs, not titles
or definition paths. Default Kanban has no deletable instance ID.

Repeat in another disposable instance after temporarily removing or breaking its
definition, including changing its stable ID. Both deletions use stored relations
and still work. Action deletion also works with an unavailable Markdown owner.
Historical events remain; Markdown links, screenshots and navigation indexes are
not rewritten. In a running browser use Refresh to see deletions; a deleted
selected View reports the existing disappeared-instance error.
