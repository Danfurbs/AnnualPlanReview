# AnnualPlanReview

This project is configured for **Render + PostgreSQL** as the canonical deployment path.

## Production storage model (Render)

- Backend API is served by `backend/server.js`.
- Persistent data is stored in Render PostgreSQL via `DATABASE_URL`.
- Forecasts, comments, reviews, planning metadata and Work Order corrections remain persistent.
- Work Done is memory-only and must be uploaded again after reload/new session. Legacy browser snapshots are removed when the updated page opens.
- On `*.onrender.com`, API mode is forced on to prevent local-only mode.

## Local development

```bash
cd backend
npm install
npm run init-db-pg   # recommended (matches production)
npm start
```

For convenience from repo root:

```bash
npm start
```

This forwards to `backend` scripts.

## Render deployment

Use the included `render.yaml` Blueprint:

- Creates a free PostgreSQL instance
- Injects `DATABASE_URL` into the backend service
- Initializes schema via `npm run init-db-pg`

Health endpoints:

- `GET /api/health`
- `GET /api/health/db`

For long-term safety, take periodic external PostgreSQL backups (`pg_dump "$DATABASE_URL"`).

## Current development state

As of 5 October 2026, RF6 is complete for development planning. The legacy Builder has been replaced by the Engineer → Standard Job Forecast Builder for V0 planning; V1 changes are made individually in the Standard Job review screen. Read these files in order:

1. This README for architecture and setup.
2. [Business rules](FORECAST_BUSINESS_RULES_UPDATED.md) for authoritative semantics.
3. [Implementation plan](FORECAST_IMPLEMENTATION_PLAN_UPDATED.md) for current status and the ordered post-RF6 backlog.
4. [Builder specification](FORECAST_BUILDER_SPECIFICATION.md) for target behaviour and known implementation gaps.

[Deployment and recovery](RENDER_DEPLOYMENT.md) describes the Work Done purge. [Backend guide](backend/README.md) covers local SQLite and API operation. Older governance, phase-continuation and conflicting setup/troubleshooting documents have been retired.

## Work Done sessions

Upload the report for an explicit FY. Successful uploads replace that FY in memory; failed uploads retain its previous valid data. Navigation and FY switching reuse current-page uploads. Reloading or opening a new page starts empty. Work Done files and aggregates are never sent to the backend or written to browser storage.

Saved Work Order corrections are reapplied to matching fresh uploads. Preview can use session evidence or its compact temporary importer. Copying a profile into V0 remains an explicit forecast operation. A missing upload is not confirmed zero delivery.

### Work Order correction review

New corrections identify an order by SJN, Work Order number and canonical Work Group Set, independently of upload row order. Existing row-index corrections can match a uniquely identified SJN/Work Order; ambiguous or duplicate matches stay flagged and cannot be amended automatically. Work Order numbers and SJN identities must be present for safe editing.

After a validated fresh Work Done upload, matching ELLIPSE units automatically resolve the saved correction through a revision-checked server transaction. Resolution retains the correction and its history, stops future overriding, clears the resolved order's warning flags, and removes it from the default outstanding-corrections export. Zero is a valid confirmed value. A later source value is used as uploaded rather than being overwritten by a retired correction. A newly arising anomaly can still require review.

The breakdown opens with **Needs review only** selected. Clear it to view resolved orders, labelled **Confirmed in ELLIPSE**. Identified active corrections missing from an upload remain visible as outstanding and are included in the correction export with unavailable source values; they do not contribute invented Work Done to totals. Duplicate/uncertain matches remain flagged. Legacy records without enough identity are retained rather than guessed or deleted. An already loaded source invalidated by another session's resolution requires a fresh upload before reporting continues.

A failed reconciliation retains the previous upload and shows a retryable error. Revision conflicts never overwrite another planner's newer correction. Only successful fresh-upload reconciliation changes correction status; normal reads and exports do not resolve records. No uploaded Work Done snapshots are stored on the server. Deploy the updated browser assets and backend together and reload older clients; no schema migration is required for the new status/identity metadata in correction JSON.

Run `node tests/browser/work-order-review.cjs` for end-to-end acceptance against the production correction routes and an isolated in-memory SQLite store. Tests cover reordered uploads, resolution and durable history, explicit zero, source changes, missing/duplicate rows, a failed resolution and retry, and a simultaneous planner edit. PostgreSQL resolution transaction checks use a mocked client; production PostgreSQL acceptance remains separate.

## Tests

```sh
npm test
npm --prefix backend test
```

Tests include in-memory SQLite cleanup integration and mocked PostgreSQL checks. Real PostgreSQL cleanup tests additionally require an explicitly supplied disposable TEST_DATABASE_URL. Do not use a production URL for tests.

API status polling is a connectivity check, not live cross-device synchronisation. Refresh to load saved business data from another device; this also clears session Work Done. There is no authentication yet. Enabling API mode does not automatically migrate local forecasts; migration utilities are explicit operations.

## Forecast Builder

The new Engineer → Standard Job → Work Group Set Builder now includes historical Planning Context, individual/aggregate profile charts, Show all history, Undo/Redo/Discard, Future Work import, V0 CSV/JSON export and full V0 CSV/Excel/JSON replacement. Its maintenance controls clear all V0 in the selected DU, one selected Engineer or one selected Work Group Set, after typed confirmation. Other DUs, V1, historical FYs and review/planning flags are retained. Exceptional rows follow current ownership for scope; adding them to a workspace does not transfer ownership.

The Engineer → Standard Job Builder is now the V0 planning interface. Bulk V1 editing/copying/import controls have been removed. Review a Standard Job and edit individual Work Group periods for V1; blank means inherit V0, zero means an explicit override. Resetting V1 keeps forecast comments, including comment-only records on database reload.

Reporting Period is a manual P0–P13 selection saved per browser/FY, independent of RF stage. Missing Work Done or an unselected period makes delivery performance unavailable. Compatible-unit selections show period-to-date performance, full-year Actual and V0-to-Reforecast movement. Work Done remains memory-only.

Server connectivity and save status are separate. Failed API saves keep drafts and do not fall back to a misleading local success. Forecast conflicts fetch server values and merge unrelated edits; overlapping edits require an explicit choice. Work Order corrections use revision-checked per-order updates, with a Retry corrections action for pending drafts.

The backend serves only an explicit frontend asset allowlist. Startup adds the work_order_amendment_revisions table without changing existing corrections. Older clients attempting whole-store correction writes receive HTTP 409 and must reload the application; reload clears session Work Done. Authentication remains outside this release.

Use tests/browser/forecast-builder.cjs, tests/browser/work-done.cjs and tests/browser/review-fixes.cjs for browser acceptance. Set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE where necessary. The first two suites stub external workbook/chart libraries; set REAL_BROWSER_LIBRARIES=true for review-fixes.cjs to exercise the pinned real XLSX and Chart.js libraries with synthetic workbooks. Browser checks use an isolated local server and browser data. Operational-file and production PostgreSQL acceptance are still required before deployment.

Work Order corrections are server-only. Browser correction caches are ignored and never imported automatically over shared records. Loads and refreshes require a successful server response; otherwise reporting and corrected exports are blocked with Retry corrections. Edits and reverts affect totals only after a confirmed server save and refresh. Failed drafts remain in memory for retry, not localStorage. Uploaded Work Done remains session-only; changing FY or retrying reapplies current server corrections to the original uploaded units.

## Integrated review tools

### Exports

Top 10 Variances has no ranking control in the sidebar. Its slide view offers List and Graphs, with Graphs selected initially. Each graph shows the selected plan's individual P1–P13 forecast values and completed Work Done only through the reporting cutoff, using that SJN's unit. Ranking by units/percentage remains available in the slide view and applies to both presentations. Run `node tests/browser/top-variances.cjs` for real Chart.js browser checks covering period values, cutoff exclusion, switching, ranking, responsive widths and chart cleanup.

Open **Exports** in the left menu for standalone Excel reports. Each report independently selects the entire selected Delivery Unit, an Engineer or a Work Group Set. The shared Delivery Unit selector can widen to all DUs. Reports start from the current dashboard selection; additional job filters can be retained or cleared without changing the dashboard.

Reports cover SJN performance, P1–P13 performance, V0/latest forecast comparison, comments, corrected/all Work Orders, multi-year Work Group coverage, review progress and the Top 10 variance brief. Unit rankings select ten SJNs per unit type rather than comparing incompatible units. Preview shows up to twenty rows; the variance brief's print action includes its full result. Each report downloads separately with its own scope. The About sheet records scope, FY, review stage, cutoff, Work Done source, read times and definitions. Blank performance cells mean unavailable; explicit forecast zeros remain numeric zeros. The Exports window opens without reading report data or preparing reports. Only the requested report is built, using cached scope lookups and small batches that yield to browser events. Report downloads read saved shared data again and block unsaved drafts or failed required reads.

**Saved data backups (JSON)** is a separate collapsed section in Exports. Comments and prior submissions retain their import-compatible payloads, contain all saved FYs/DUs and explicitly ignore report filters. These files are not full database backups and exclude session Work Done. Forecast CSV/JSON exports remain in Forecast Builder, including the saved-file downloads formerly in Settings. Saved V1 JSON preserves sparse amendments; the upload-template CSV resolves V0 inheritance without including Work Done. Comments Excel keeps the existing upload column names.

Run `npm run test:exports` for the isolated exports browser checks, using synthetic data and the application's pinned real XLSX CDN library for workbook round trips. Set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE as for the other browser checks.

The main page shows reporting context, the private Work Done filename, shared-data load time, active filters, a refresh action, and an unreviewed-job queue. Refresh reloads shared forecasts and corrections without clearing the private upload. Save/discard drafts before refreshing or moving between jobs. The breakdown provides previous/next and server-confirmed Mark reviewed & next actions. Group explanations list unique members and their Work Group Set contributions under the current dashboard scope; unavailable Work Done remains unavailable and incompatible units are not summed in the explanation.

Saved history is available within each job breakdown and from Saved history on Forecast Builder job cards. Startup creates the additive change_history table and index in SQLite/PostgreSQL. Forecast cell changes, comment changes and per-order corrections are recorded in the same transaction as the saved data. History begins when this version is deployed; no historical edits or named editors are invented. Correction reasons are optional. Existing correction identities remain shared across uploads, so their history is explicitly not financial-year-specific. Read-only history is paged at 50 records. Back up the production database before deployment and validate the additive schema in staging.

Settings > Advanced > Show developer diagnostics reveals read-only session checks. It does not execute server commands or deploy the app. GitHub Release checks runs the unit/integration suite and isolated browser acceptance checks on pushes and pull requests. To run locally: npm run test:all and npm run test:browser after installing the development dependencies and Playwright Chromium. Browser tests use synthetic data and stub workbook/chart CDNs; production database and operational-file acceptance remain separate. Set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE to use a preinstalled browser runtime.
