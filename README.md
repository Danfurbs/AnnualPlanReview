# AnnualPlanReview

This project is configured for **Render + PostgreSQL** as the canonical deployment path.

## Production storage model (Render)

- Backend API is served by `backend/server.js`.
- Persistent data is stored in Render PostgreSQL via `DATABASE_URL`.
- Browser `localStorage` is used only as a cache/offline fallback.
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
