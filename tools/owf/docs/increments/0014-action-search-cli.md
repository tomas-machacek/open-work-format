# 0014 — Search Action text through the CLI

> Status: in_progress
> Description: Find Actions by a literal case-insensitive substring in the title or description, combined with existing list filters.
> Depends on: [0004 — Action listing](0004-action-list.md) and [0005 — Action state changes](0005-action-state.md).

The user agreed on 2026-10-06 to separate CLI text search from the later
Kanban filtering increment. The user reviewed and approved the expanded design for implementation on
2026-10-06. Implementation and independent code review have not yet happened.

## Goal and scope

Let a person or agent find an Action without knowing its ID or downloading the
entire list for manual filtering. Extend the existing list operation, keeping
CLI access independent of the web server.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md), and
[MVP scope](../../../../docs/design/mvp-scope.md).

Included: an optional `--search` argument to `owf list actions`, shared application
semantics, combination with existing owner/recursive/state filters, and updated
CLI help, tool README and generated Workspace AGENTS.md.

Kanban filters and HTTP search exposure belong to a separate subsequent increment.
Waiting reason, owner names and IDs are not searched. Fuzzy matching,
regular expressions, ranking, pagination and custom sorting are deferred.

## Proposed solution

### CLI and matching

```text
owf list actions --search "dodávateľ"
owf list actions --search "delivery" --state open --state waiting --json
owf list actions --search "návrh" --owner /_projects/kitchen/ --recursive --json
```

Accept `--search` once, with a required text value. Trim leading/trailing whitespace;
reject a missing value, empty or whitespace-only value, or repeated option as
`INVALID_ARGUMENT`, exit 2. Validate the application input before Workspace
discovery so non-CLI callers receive the same empty-input rejection.

Match the whole search value as a contiguous substring anywhere in the Action
title or description, without distinguishing case. Return each matching Action
once, including when both fields match. Missing or empty descriptions contribute
no match. Match each field separately: a match cannot span their boundary.
Search stored description text literally, including Markdown syntax and newlines.
Use deterministic locale-independent JavaScript `toLowerCase()` semantics for
both searchable fields and the normalized query; SQLite's built-in ASCII-only
case conversion is insufficient for Slovak text.
Case pairs such as `NÁVRH` and `návrh` match. Diacritics remain significant:
`navrh` does not match `návrh`. Do not introduce Unicode normalization,
transliteration, tokenization or locale-dependent collation.

Internal whitespace remains literal. Percent signs, underscores, quotes,
backslashes and regular-expression characters are ordinary search text, not
wildcards or query syntax. No user text is interpolated into SQL.

(Title match OR description match) AND owner scope AND state selection determine
the result. Repeated state
options retain their existing OR semantics. Owner filtering continues to use
stored canonical URLs, including existing recursive-prefix rules; it must not
require current Markdown owner discovery.

Without `--search`, listing retains its existing behavior. Search does not rank
results: keep `created_at DESC, id ASC` order and complete Action records.
A valid search with no matches succeeds with the existing empty result, exit 0.
JSON envelopes and human rendering remain the existing list formats.

### Layers, read validation and compatibility

Extend `ListActionsInput` and the shared application list path with search.
Keep parsing/rendering in the CLI and database access in infrastructure.
Use the existing validated read path and apply title/description matching to validated
Actions in the shared application layer; this local unpaged PoC already
validates every stored Action before selecting results.

Preserve the existing corruption contract: a malformed stored Action causes
`ACTION_READ_FAILED` even when its title/description, owner or state would not match.
Do not hide corruption behind an SQL search predicate or return partial results.
Unavailable, corrupt and unsupported stores retain their existing diagnostics.

The operation remains read-only: no Action, timestamp, event, Workspace file,
schema or index changes. No schema version change, migration, dependency or
release is required. Existing CLI callers remain compatible.

Update command help, tool README and the single generated Workspace AGENTS.md
template with search semantics and a runnable combined-filter example.
Existing user-edited guides remain untouched; repeat initialization stays a no-op.

## Acceptance criteria

AC1: Searching finds an Action when its title OR description contains the
contiguous case-insensitive substring, including Slovak uppercase/lowercase
letters. Each Action appears once, even when both fields match. Absent/empty
descriptions are safe. Matching uses literal stored Markdown text and cannot
span the field boundary. Diacritics remain significant and wildcard/query
characters are literal. Waiting reasons, owner names and IDs are excluded.

AC2: Search combines with direct or recursive owner scope and one or more states
using AND; selected states retain OR semantics. Stored owner references,
Workspace-wide discovery and stable existing ordering remain unchanged.

AC3: Omitted search preserves listing behavior. A valid unmatched search returns
successful empty JSON/human output. Missing, blank or repeated CLI search values
return argument errors; application blank-input validation is equivalent.

AC4: Search does not mutate the store or Workspace. A malformed nonmatching
Action still fails the read; unavailable/unsupported/corrupt stores remain errors,
never successful empty or partial results.

AC5: Built CLI help, tool README and generated Workspace guidance document the
same implemented behavior. The command works without a web server and produces
the existing JSON envelope and complete Action records.

## Verification plan

- Add a concise application acceptance scenario for text search combined with
  recursive owner scope and multiple states (AC1–AC2).
- Use focused tests for Slovak case pairs, significant diacritics, literal special
  characters, internal whitespace, matches in either/both fields, absent/empty
  descriptions, raw Markdown/newlines, field-boundary and excluded-field rejection,
  and blank input (AC1, AC3).
- Extend real-store integration coverage for corruption outside the search result
  and unchanged data; reuse existing read/order/filter evidence where applicable
  (AC2, AC4).
- Add a small built-CLI journey covering argument parsing, combined filtering,
  empty results, JSON/human output and generated examples (AC3, AC5).
  Avoid repeating the matching matrix at every layer.
- Run `npm run verify` before implementation handoff and record the actual
  revision, platform and results. No new browser scenario is required.

Manual trial: create Actions named "Zavolať dodávateľovi", "NÁVRH kuchyne" and
"Zaplatiť faktúru". Search for "DODÁVATEĽ" and "návrh", then combine the search
with an owner and states. Confirm that "navrh" does not match "NÁVRH kuchyne";
give "Zaplatiť faktúru" the description "Overiť navrh zmluvy" and confirm that
"navrh" finds it through its description. Use a returned ID with `owf get action {id}`.

## Implementation and review outcome

Pending implementation, independent code review and required verification.

## Decision changes and follow-up

- CLI text search is increment 0014. Kanban filtering will be designed separately
  and should reuse this search behavior.

- The initial proposal searched titles only. On 2026-10-06 the user expanded
  the scope to title OR description using the same `--search` option.
