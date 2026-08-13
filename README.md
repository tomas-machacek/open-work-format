# Open Work Format

Open Work Format (OWF) is a lightweight, tool-independent model for personal
knowledge work. It defines shared semantics that humans, AI agents, and
independent tools can use without relying on hidden application state.

OWF is currently at **Core v0**. The conceptual model is defined; concrete
Markdown/YAML representation, schemas, and tooling are deliberately deferred.

## Documents

### Normative specification

- [OWF Core v0 Specification](spec/core-v0.md) — normative conceptual
  specification of Core objects, relationships, workflows, and conformance.

### Design material

- [Design Principles](docs/design/principles.md) — stable principles guiding the
  design of OWF.
- [Design Journal](docs/design/journal.md) — chronological decisions, rationale,
  and alternatives considered during design.
- [Core v0 Design Review](docs/design/core-v0-design-review.md) — consolidated
  review and formal closure of the Core v0 design.

### Examples

The [examples](examples/) directory is reserved for non-normative example
workspaces. Concrete examples will follow the representation profile.

## Status

Core v0 is a normative conceptual specification, but OWF is still evolving.
Representation syntax, lint diagnostics, schemas, and reference tooling are not
yet defined.

## Influences

OWF is informed by:

- David Allen's [Getting Things Done](https://gettingthingsdone.com/what-is-gtd/);
- Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f);
- Google's [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

These are influences rather than normative dependencies. OWF does not claim
compatibility or affiliation with them.
