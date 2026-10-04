# Render Deployment (Canonical)

This repo is configured for **Render Web Service + Render PostgreSQL**.

## What matters for persistence

1. `render.yaml` provisions `annual-plan-review-db` (PostgreSQL, free tier).
2. `DATABASE_URL` is injected into the backend service.
3. `backend/server.js` refuses to boot in production if `DATABASE_URL` is missing.
4. App health can be checked via:
   - `/api/health`
   - `/api/health/db`

## Deploy steps

1. In Render, create a **Blueprint** from this repo.
2. Apply the generated resources.
3. Set `CORS_ORIGIN` to your frontend origin (or `*` for controlled internal use).
4. Wait for build/start to complete.
5. Validate:

```bash
curl https://<your-service>.onrender.com/api/health
curl https://<your-service>.onrender.com/api/health/db
```

Both should return `success: true`.

## Post-deploy robustness checks

- Restart the service and confirm existing records still load.
- Redeploy the service and confirm existing records still load.
- Verify app write path by editing:
  - a forecast,
  - a baseline,
  - a comment,
  then reloading from a second browser/device.

If these checks pass, persistence is correctly backed by PostgreSQL rather than local browser storage.

## Data-loss prevention checklist

- Keep the Render PostgreSQL instance active (free databases can be removed after long inactivity).
- Keep an external backup cadence (weekly/monthly) using Postgres dump tooling from a trusted machine:

```bash
pg_dump "$DATABASE_URL" > annual-plan-review-backup.sql
```

- Store backups outside Render (OneDrive/SharePoint/S3/GitHub private artifacts).
- If frontend shows a "server save failed" alert, treat the change as **not persisted** until re-saved successfully.

## Session-only Work Done rollout — 4 October 2026

1. Deploy this release and confirm old `/api/work-done` GET/POST requests return 404. No application path may write new Work Done snapshots.
2. On a trusted operator machine, set DATABASE_URL for the intended production database and run from `backend`:

```sh
npm run purge-work-done -- --postgres
```

The command transactionally deletes only rows in the existing `public.work_done_snapshots` table. It is safe to repeat, leaves the empty table in place, and does not create it on fresh databases. Forecasts, comments, reviews, planning data and saved Work Order corrections are untouched. A zero count means no remaining snapshots. Retain the successful command output as cleanup evidence.

For an existing local SQLite database, run from `backend`:

```sh
npm run purge-work-done -- --sqlite db/apr.db
```

The file must already exist. Browser caches are purged independently when each browser next opens the updated page. Dormant browsers cannot be cleaned remotely. Existing external backups are outside this cleanup; restoring an old backup requires running the purge again before exposing the restored service.

Production deployment and purge are not confirmed merely because this command exists. No production execution evidence has been recorded for this change. Reconciliation no longer requires a Work Done table, so it also works against fresh schemas.

## Troubleshooting

Use `/api/forecasts/<FY>/<v0-or-v1>` to inspect saved forecasts and `/api/health/db` to verify PostgreSQL. Work Done disappearing after reload is expected: upload a fresh report. Do not configure DATA_DIR or a forecast-store.json disk for the canonical backend. API connection settings default to the current origin, and Render forces API mode on.
