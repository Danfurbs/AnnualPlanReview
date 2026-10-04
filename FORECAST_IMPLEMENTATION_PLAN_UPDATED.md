# Post-RF6 implementation plan

Status: 4 October 2026. RF6 is complete for development planning. The active-RF6 freeze is lifted; outstanding work is eligible for prioritisation, not implicitly delivered.

## Authority and reading order

Read README.md, FORECAST_BUSINESS_RULES_UPDATED.md, this plan, then FORECAST_BUILDER_SPECIFICATION.md. The business rules govern semantics; the Builder specification governs the V0 planning workflow. Retired governance recommendations and phase prompts are not requirements.

## Current release: session-only Work Done

Work Done is uploaded into browser memory, isolated by FY, and lost on reload/new session. Dashboard navigation can reuse uploads during the open page. Preview can read that session's uploads and accept additional temporary evidence. There is no Work Done API, localStorage cache, or database writer. Missing evidence must be labelled “Work Done not uploaded”, not treated as confirmed zero delivery.

Saved Work Order corrections remain persistent and are reapplied to matching Work Orders using existing identifiers. Explicit copying of a profile into a V0 draft and saving that forecast remains supported. Forecasts, comments, reviews, planning metadata and corrections retain their existing persistence.

The user explicitly authorised purging legacy Work Done snapshots. This supersedes previous requirements to preserve those snapshots, and only those snapshots. Old browser caches are removed on startup. Database cleanup is a separate idempotent command after deployment; it retains empty legacy tables. See RENDER_DEPLOYMENT.md. External backups are outside the cleanup.

Implementation and production execution must be reported separately. Production deployment, snapshot purge and backup/restore verification have not been evidenced in this repository.

## Verified baseline and limitations

- Effective V1 reads inherit missing periods from V0 and preserve explicit zero; legacy writers still need period-level intent handling.
- API non-negative forecast validation, national RAG boundaries, revision checks and transactional forecast saves exist.
- Reporting Period still offers Auto; manual selection persistence and P0 remain outstanding.
- Preview has current-ownership discovery, Engineer/Standard Job queues, V0 editing, per-job saves, independent Forecasted status and historical profile copying.
- Preview now renders per-WGS Planning Context with historical comments, a default aggregate chart, individual WGS navigation and all-history overlays. V0 CSV/JSON exports, full V0 import, Undo/Redo/Discard, and DU/Engineer/WGS clears are implemented.
- Future Work import patches reported cells into V0 and supplies a source comment for discovery. Affected dirty jobs block confirmation; unrelated drafts remain. The forecast save is the sole persistence operation, avoiding partial metadata rollback.
- Tests include source assertions and mocked database calls. Passing them is not evidence of complete browser/PostgreSQL acceptance.

## Ordered backlog

1. Review the completed Builder with the product owner against operational planning files. Local acceptance covers history, scope, explicit zero, draft retention and clear operations; verify production persistence before retirement.
2. Keep the legacy builder available, as explicitly requested on 4 October 2026. Retirement requires a later explicit acceptance decision and a separate change.
3. Introduce one sparse V1 write model across editing, paste, import, copy and reset paths. Missing means inherit, zero means explicit override; never compact or reinterpret existing V1 records. Resetting a period must retain comments.
4. Require manual Reporting Period, independent of RF stage, persisted per browser/FY; add P0 and an unselected state. No database reporting-context entity.
5. Centralise corrected Work Done, effective forecast and Actual calculations; prominently show period-to-date and full-year comparisons. Missing session evidence must remain distinguishable from zero.
6. Add annual V0 → effective Reforecast movement, including safe zero-denominator presentation.
7. Deliver resolved V0/Reforecast exports for portfolio, Engineer and Work Group Set, preserving JSON compatibility and comment/corrected-order exports.
8. Consider simple authentication and an engineer review PDF later. Do not introduce approvals, immutable RF submissions, mandatory structured commentary or notification workflows.

## Preservation and acceptance

Preserve V0, existing V1 including explicit zeros, forecast/review comments, FY/RF review identities, planning metadata, organisation ownership and Work Order amendment identities. Forecasted and Reviewed remain independent. No automatic resets or historical rewrites.

For each release run frontend/backend tests and relevant browser workflows. Add actual interaction tests for draft retention, fresh-upload correction application, FY isolation, explicit zero, save failure/conflict and exports. Use seeded real database fixtures for persistence/cleanup integration where available; record unavailable checks honestly.

Deploy in separate increments: session-only Work Done and documentation first, Builder/draft improvements next, sparse V1 writes, then reporting/calculation and export changes. Do not combine database constraints with writer and dashboard redesign. The user explicitly requested keeping the legacy builder on 4 October 2026. Retirement requires later explicit approval.
