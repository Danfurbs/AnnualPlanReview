# Continuation Prompt: Forecast Builder Preview Phase 4

> **Completion note:** Phase 4 and the subsequent Phase 5 profile chart are now
> implemented in the Preview. This file is retained as the delivery contract
> and regression checklist, not as an instruction to repeat the phase.

Continue work in `/workspace/AnnualPlanReview` from the completed Phase 3
Forecast Builder Preview.

Before editing, read every applicable `AGENTS.md`, inspect Git status/history,
review `FORECAST_BUILDER_SPECIFICATION.md` and
`FORECAST_IMPLEMENTATION_PLAN_UPDATED.md`, and run the Phase 1–3 tests. Do not
discard or amend unrelated work.

## Objective

Implement **Phase 4 only: Historical Planning Context and copy-forward** in the
parallel Forecast Builder Preview. Do not start the Standard Job profile graph
or any other Phase 5 work. The graph is intentionally not visible in Phase 4;
it remains a Phase 5 deliverable.

Retain the production Forecast Builder unchanged and available. Use the same
forecast store, current organisation hierarchy, selected Delivery Unit context,
FY-relative discovery path, V0-only Phase 3 editor, Work Group Set comments,
planning metadata, and explicit per-Standard-Job save transaction.

## Phase 3 presentation and interaction baseline to retain

- Every Standard Job card must fit within the Preview content width; no card,
  discipline heading, action row, or expanded content may be cut off on the
  right or cause document-level horizontal overflow.
- Clicking non-interactive space anywhere on a Standard Job card expands or
  collapses it. Buttons, links, inputs, textareas, the Forecasted control, grid
  interactions, and modal actions must perform only their own action.
- Keep the explicit expand/collapse button keyboard accessible with accurate
  `aria-expanded` state.
- The P1–P13 Work Group Set table must remain inside its own clearly visible,
  keyboard-focusable horizontal scrolling region. Its scrollbar must be usable
  at desktop, tablet, and mobile widths; the document itself must not scroll
  horizontally.
- Current-year V0 comments remain **one comment per Work Group Set**, using the
  existing forecast-comment storage shape. Several Work Group Set comments and
  period edits remain one dirty Standard Job draft and save together only via
  **Save Standard Job**.
- Preserve dirty drafts through expand/collapse, discipline grouping, search,
  Forecasted filtering, and Phase 4 Planning Context expansion.
- Marking Forecasted must not save a draft; saving must not mark Forecasted.

## Phase 4 Planning Context

Replace the Phase 3 placeholder for each Work Group Set with an accessible,
lazy-loaded Planning Context expander. Implement the complete Phase 4 rules in
`FORECAST_BUILDER_SPECIFICATION.md`, including:

1. Show prior-FY final effective forecast totals (explicit V1 periods over V0),
   corrected Work Done totals, and explicit Work Done coverage (`through Pn`,
   `full year`, or `not uploaded`). A real zero is not `not uploaded`.
2. Show relevant historical Delivery Unit, Engineer, and Work Group Set
   comments with FY, scope, and source/RF stage. Keep historical comments
   read-only and do not copy them into current commentary automatically.
3. Provide Copy Forecast and Copy Work Done actions using the specified final
   effective forecast and corrected-Work-Done-plus-forecast-tail semantics.
4. Copy actions update only the current unsaved V0 Work Group Set draft and add
   the specified current-year source comment. They do not save automatically.
5. Load older history lazily where practical. Only the selected FY minus 1,
   minus 2, and minus 3 seed automatic discovery; viewing older years must not
   change queue membership.
6. Do not infer ownership from Standard Job discipline, MNT, names, or
   historical metadata. Current Work Group Set ownership remains authoritative.

## Data-preservation constraints

Do not migrate, delete, normalise, compact, reinterpret, or rewrite historical
V0/V1, current or historical comments, Work Done, Work Order corrections,
review data, planning metadata, or organisation data. Do not modify V1 writers
or sparse-V1 semantics. Do not add a global save. Do not change organisation
ownership. Do not hard-code an FY.

The separately specified temporary lightweight Work Done evidence importer is
not part of Phase 4 unless it receives separate explicit authorisation.

## Required tests and browser checks

Retain all Phase 1–3 tests and add focused tests for lazy history, effective
V1-over-V0 values including explicit zero, Work Done coverage, historical
comment scope/source, copy semantics, source comments, dirty-state retention,
and complete save rollback. Also test that card-wide clicking ignores all
interactive descendants, comments remain per Work Group Set, and the grid
scrollbar is contained and visible.

Run at minimum:

- `node --check forecast-builder-preview.js`
- `npm test`
- `npm --prefix backend test`
- `git diff --check`

If browser tooling is available, validate desktop, tablet, and mobile widths,
confirm `document.documentElement.scrollWidth ===
document.documentElement.clientWidth`, and capture screenshots of Planning
Context, copy-forward results, the visible grid scrollbar, and narrow cards.
Update `FORECAST_BUILDER_SPECIFICATION.md` with the actual Phase 4 state. Commit
the completed work and create a pull request; do not claim Phase 5 has started.
