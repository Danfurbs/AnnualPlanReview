# AnnualPlanReview

Annual Plan Review now supports **server-side forecast persistence** with a local browser cache.

## Persistence model

Forecast data is stored in two places:

1. **Server-side JSON store** via API (`/api/forecast/:year/:planVersion`) for durable storage.
2. **Browser localStorage** (`aprForecastDataV1:<FY>:<planVersion>`) as a fast client cache.

The app load order is:

1. Try localStorage cache.
2. If cache is missing, load from server API and repopulate local cache.
3. If no server data exists, fall back to `forecast-library.js`.

On save, the app writes to localStorage and then mirrors to the server API.

## Render deployment notes

To keep data across deploys/restarts on Render:

- Run this repo as a **Web Service** (not static site).
- Start command: `npm start`
- Attach a **Persistent Disk**.
- Set `DATA_DIR` environment variable to a path on the mounted disk (example: `/var/data`).

The app stores forecasts in `${DATA_DIR}/forecast-store.json`.

## Backup / restore workflow

Use **Forecast Builder**:

1. **Save Forecast File** (download JSON backup).
2. Keep the file in shared storage (SharePoint/OneDrive/etc).
3. If data disappears, use **Load Forecast File** to restore.
