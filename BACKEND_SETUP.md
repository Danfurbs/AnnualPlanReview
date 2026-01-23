# Backend API Setup Guide

This guide will help you configure your Annual Plan Review application to sync forecasts across multiple PCs using your Render backend.

## Problem Overview

By default, forecasts are saved to **localStorage**, which is browser-specific and not shared across devices. This means:
- ❌ Forecast created on PC A is invisible to PC B
- ❌ Each PC has its own separate copy of data
- ❌ No automatic synchronization

## Solution: Enable Backend API

The application now supports syncing data via your Render PostgreSQL backend, enabling:
- ✅ Forecasts visible on all PCs
- ✅ Real-time synchronization
- ✅ Persistent cloud storage
- ✅ No data loss when switching devices

## Step-by-Step Setup

### 1. Find Your Render Backend URL

1. Go to your [Render Dashboard](https://dashboard.render.com/)
2. Find your `annual-plan-review-backend` service
3. Copy the URL (it should look like: `https://annual-plan-review-backend.onrender.com`)

### 2. Configure the Application (On Each PC)

On **EVERY PC** where you want to access forecasts:

1. Open the Annual Plan Review application
2. Click the **⚙️ Settings** button (top right corner)
3. In the **Backend API Configuration** section:
   - Paste your Render backend URL into the "Backend API URL" field
   - Click **"Test Connection"** to verify it works
   - Enable the **"Enable Backend API"** checkbox
   - Click **"Save Settings"**

### 3. Verify It's Working

You should see:
- ✅ "Connection successful!" message
- ☁️ "Synced" indicator in the top bar (instead of 💾 "Local")

### 4. Migrate Existing Data (Optional)

If you already have forecast data on one PC that you want to make available to all PCs:

1. On the PC with existing data:
   - Open the Settings
   - Configure and enable the backend API (steps above)
   - The app will automatically sync your data to the backend

2. On other PCs:
   - Configure the same backend URL
   - Enable the API
   - Your forecast data will automatically load from the backend

## Status Indicators

The application shows sync status in the top bar:

| Indicator | Meaning |
|-----------|---------|
| 💾 Local | Using localStorage only (not synced) |
| ☁️ Synced | Connected to backend API (synced across devices) |
| ⚠️ Offline | API enabled but unable to connect |
| ⚠️ Error | API connection error |

## Troubleshooting

### "Connection failed" Error

**Possible causes:**
1. **Wrong URL**: Double-check the URL from your Render dashboard
2. **Backend not running**: Check Render dashboard to ensure service is deployed
3. **CORS issues**: The backend is configured to allow all origins by default, but if you changed it, update `CORS_ORIGIN` in Render environment variables
4. **Network issues**: Check your internet connection

### Forecast Still Not Visible on Other PC

1. **Check both PCs have the SAME backend URL configured**
2. **Verify API is enabled on both PCs** (checkbox checked)
3. **Check the sync indicator** - it should show ☁️ "Synced" on both PCs
4. **Try refreshing** the page on the second PC

### Data Not Syncing in Real-Time

The application syncs data when:
- You save a forecast
- You load the application
- Every 30 seconds (automatic status check)

To force a sync, refresh the page.

## Backend Configuration Details

### Database

Your Render backend uses **PostgreSQL** (free tier) for persistent storage:
- Database: `annual-plan-review-db`
- Plan: Free (sufficient for most use cases)
- Region: Oregon
- Storage: Persistent (data is never lost)

### API Endpoints

The backend provides these endpoints:
- `GET /api/health` - Health check
- `GET/POST /api/forecasts/:year/:planVersion` - Forecast data
- `GET/POST /api/baselines` - Baseline data
- `GET/POST /api/comments` - Comment data

### Security Notes

⚠️ **Important:**
- The application currently has **NO authentication**
- Anyone with your backend URL can access the data
- Do not store sensitive/confidential information
- For production use, consider implementing authentication

## Advanced Configuration

### Change CORS Settings

If you want to restrict which domains can access your backend:

1. Go to Render dashboard → Your service → Environment
2. Update `CORS_ORIGIN` environment variable:
   - `*` = Allow all (default)
   - `https://yourdomain.com` = Allow specific domain
   - `https://domain1.com,https://domain2.com` = Allow multiple domains

### Monitor Database Usage

Check your database usage in the Render dashboard:
1. Go to your database service
2. Click "Metrics" tab
3. Monitor storage, connections, and queries

## Testing in Browser Console

You can test the API connection directly in the browser console:

```javascript
// Check if API is enabled
window.isApiEnabled()

// Get current backend URL
window.getApiBaseUrl()

// Test connection
await window.checkApiHealth()

// Load forecast from API
await window.loadForecastFromApi('FY27', 'v1')
```

## Need Help?

If you're still having issues:
1. Check browser console for errors (F12 → Console tab)
2. Verify backend logs in Render dashboard
3. Ensure PostgreSQL database is running in Render
4. Check that `USE_POSTGRESQL=true` in backend environment variables

## Summary

✅ **What you need to do:**
1. Get your Render backend URL
2. Open Settings (⚙️) on each PC
3. Paste URL, test connection, enable API, save
4. Verify ☁️ "Synced" indicator appears

That's it! Your forecasts will now be synced across all your devices.
