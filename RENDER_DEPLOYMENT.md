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
