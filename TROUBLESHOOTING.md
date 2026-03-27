# Troubleshooting Forecast Persistence

## Symptom

Forecasts are missing after refresh, redeploy, or switching machines.

## How persistence works now

- Server store: `/api/forecast/:year/:planVersion` (source of truth).
- Browser cache: `localStorage` key prefix `aprForecastDataV1:`.

If local cache is missing, app attempts server fetch and rehydrates cache automatically.

## Quick checks

1. Verify API health: open `/api/health`.
2. Verify data exists in API: open `/api/forecast/FY27/v1` (replace FY/plan).
3. Verify Render service type is Web Service and `npm start` is used.
4. Verify persistent disk is mounted and `DATA_DIR` points to mount path.
5. Verify browser localStorage keys beginning with `aprForecastDataV1:`.

## Common causes

- App deployed as static site (no Node API running).
- Missing persistent disk or `DATA_DIR` set to ephemeral filesystem.
- Different year/plan version selected than expected.
- Local cache cleared (server data should still restore if API store is healthy).

## Recovery

- If API has data, re-select FY/plan and refresh.
- If API store is empty, restore using **Load Forecast File** from exported backup.

## Prevention

- Keep persistent disk attached and `DATA_DIR` configured.
- Continue exporting forecast JSON after major updates.
- Consider scheduled backup of `forecast-store.json`.
