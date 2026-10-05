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

As of 5 October 2026, RF6 is complete for development planning. The legacy Builder has been retired with user approval; V1 changes are made individually in the Standard Job review screen. Read these files in order:

1. This README for architecture and setup.
2. [Business rules](FORECAST_BUSINESS_RULES_UPDATED.md) for authoritative semantics.
3. [Implementation plan](FORECAST_IMPLEMENTATION_PLAN_UPDATED.md) for current status and the ordered post-RF6 backlog.
4. [Builder specification](FORECAST_BUILDER_SPECIFICATION.md) for target behaviour and known implementation gaps.

[Deployment and recovery](RENDER_DEPLOYMENT.md) describes the Work Done purge. [Backend guide](backend/README.md) covers local SQLite and API operation. Older governance, phase-continuation and conflicting setup/troubleshooting documents have been retired.

## Work Done sessions

Upload the report for an explicit FY. Successful uploads replace that FY in memory; failed uploads retain its previous valid data. Navigation and FY switching reuse current-page uploads. Reloading or opening a new page starts empty. Work Done files and aggregates are never sent to the backend or written to browser storage.

Saved Work Order corrections are reapplied to matching fresh uploads. Preview can use session evidence or its compact temporary importer. Copying a profile into V0 remains an explicit forecast operation. A missing upload is not confirmed zero delivery.

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
