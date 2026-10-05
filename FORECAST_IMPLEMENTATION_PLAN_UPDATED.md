# Post-RF6 implementation plan

Status: 5 October 2026. RF6 is complete for development planning. The active-RF6 freeze is lifted; outstanding work is eligible for prioritisation, not implicitly delivered.

## Authority and reading order

Read README.md, FORECAST_BUSINESS_RULES_UPDATED.md, this plan, then FORECAST_BUILDER_SPECIFICATION.md. The business rules govern semantics; the Builder specification governs the V0 planning workflow. Retired governance recommendations and phase prompts are not requirements.

## Current release: session-only Work Done

Work Done is uploaded into browser memory, isolated by FY, and lost on reload/new session. Dashboard navigation can reuse uploads during the open page. Preview can read that session's uploads and accept additional temporary evidence. There is no Work Done API, localStorage cache, or database writer. Missing evidence must be labelled “Work Done not uploaded”, not treated as confirmed zero delivery.

Saved Work Order corrections remain persistent and are reapplied to matching Work Orders using existing identifiers. Explicit copying of a profile into a V0 draft and saving that forecast remains supported. Forecasts, comments, reviews, planning metadata and corrections retain their existing persistence.

The user explicitly authorised purging legacy Work Done snapshots. This supersedes previous requirements to preserve those snapshots, and only those snapshots. Old browser caches are removed on startup. Database cleanup is a separate idempotent command after deployment; it retains empty legacy tables. See RENDER_DEPLOYMENT.md. External backups are outside the cleanup.

Implementation and production execution must be reported separately. Production deployment, snapshot purge and backup/restore verification have not been evidenced in this repository.

## Verified baseline and limitations

- Effective V1 reads inherit missing periods from V0 and preserve explicit zero; individual review edits retain period-level intent; the legacy bulk writer is retired.
- API non-negative forecast validation, national RAG boundaries, revision checks and transactional forecast saves exist.
- Reporting Period is manually selected (unselected or P0–P13), persists per browser/FY, and is independent of RF stage.
- Preview has current-ownership discovery, Engineer/Standard Job queues, V0 editing, per-job saves, independent Forecasted status and historical profile copying.
- Preview now renders per-WGS Planning Context with historical comments, a default aggregate chart, individual WGS navigation and all-history overlays. V0 CSV/JSON exports, full V0 import, Undo/Redo/Discard, and DU/Engineer/WGS clears are implemented.
- Future Work import patches reported cells into V0 and supplies a source comment for discovery. Affected dirty jobs block confirmation; unrelated drafts remain. The forecast save is the sole persistence operation, avoiding partial metadata rollback.
- Tests include source assertions and mocked database calls. Passing them is not evidence of complete browser/PostgreSQL acceptance.

## Implemented review changes — 5 October 2026

The user explicitly approved retiring the legacy Builder and removing bulk V1 updates. This supersedes the 4 October retention instruction. V0 planning uses the Engineer → Standard Job Builder; V1 edits occur individually in the job review screen without introducing approvals or locking.

Sparse V1 editing, explicit zero, comment-preserving resets, manual reporting periods, unavailable evidence states, compatible-unit summaries, annual movement, resolved scoped exports, separate connectivity/save feedback, per-order correction revisions, and static asset restrictions are implemented. No production deployment or historical data rewrite was performed.

## Remaining acceptance and backlog

1. Validate with representative operational planning files and an explicitly disposable PostgreSQL database, then verify production persistence during deployment.
2. Preserve existing JSON import/export compatibility and saved forecasts/comments/corrections; do not infer migration authority for business data.
3. Consider simple authentication and an Engineer review PDF separately. Do not add approvals, immutable RF submissions, mandatory structured commentary or notifications.

## Preservation and acceptance

Preserve V0, existing V1 including explicit zeros, forecast/review comments, FY/RF review identities, planning metadata, organisation ownership and Work Order amendment identities. Forecasted and Reviewed remain independent. No automatic resets or historical rewrites.

For each release run frontend/backend tests and relevant browser workflows. Add actual interaction tests for draft retention, fresh-upload correction application, FY isolation, explicit zero, save failure/conflict and exports. Use seeded real database fixtures for persistence/cleanup integration where available; record unavailable checks honestly.

Deploy the application and its additive correction-revision schema together. Refresh older clients after deployment; remind users that reload clears Work Done uploads. Production deployment and backup/restore verification are not evidenced by local test results.
