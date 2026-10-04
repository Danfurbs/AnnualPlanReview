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

As of 4 October 2026, RF6 is complete for development planning. Read these files in order:

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

## Forecast Builder Preview

The new Engineer → Standard Job → Work Group Set Builder now includes historical Planning Context, individual/aggregate profile charts, Show all history, Undo/Redo/Discard, Future Work import, V0 CSV/JSON export and full V0 CSV/Excel/JSON replacement. Its maintenance controls clear all V0 in the selected DU, one selected Engineer or one selected Work Group Set, after typed confirmation. Other DUs, V1, historical FYs and review/planning flags are retained. Exceptional rows follow current ownership for scope; adding them to a workspace does not transfer ownership.

Keep the legacy Builder available until explicit user acceptance. Use tests/browser/forecast-builder.cjs and tests/browser/work-done.cjs for browser acceptance with Playwright installed. Set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE where the module/browser are not on default paths. These scripts use an isolated local server and browser data; workbook/chart decoding is stubbed, so real Excel parsing and Chart.js rendering still need validation with operational files.
