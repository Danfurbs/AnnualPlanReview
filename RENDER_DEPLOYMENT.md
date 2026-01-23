# Render Deployment Guide

This guide will help you deploy the Annual Plan Review backend to Render.com.

## Prerequisites

1. A [Render.com](https://render.com) account (free tier available)
2. Your GitHub repository pushed to GitHub
3. Basic knowledge of environment variables

## Deployment Steps

### 1. Connect GitHub Repository to Render

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** in the top right
3. Select **"Blueprint"** from the dropdown
4. Connect your GitHub account if you haven't already
5. Select this repository (`AnnualPlanReview`)
6. Render will automatically detect the `render.yaml` file

### 2. Configure Environment Variables

Render will prompt you to set environment variables. Here's what you need to configure:

#### Required Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Already set in render.yaml |
| `PORT` | `3000` | Already set in render.yaml |
| `DATABASE_PATH` | `./db/apr.db` | Already set in render.yaml |
| `CORS_ORIGIN` | Your frontend URL | **IMPORTANT: Set this to your frontend URL** |

#### Setting CORS_ORIGIN

**Option 1: Frontend on same server (recommended for simple setup)**
- Set `CORS_ORIGIN` to `*` (allows all origins)
- Your backend will serve both API and frontend files
- Access your app at: `https://your-service-name.onrender.com`

**Option 2: Separate frontend deployment**
- Deploy frontend separately (Render static site, Netlify, Vercel, etc.)
- Set `CORS_ORIGIN` to your frontend URL (e.g., `https://yourapp.netlify.app`)
- Update `api-client.js` in your frontend to point to your backend URL

### 3. Review and Deploy

1. Review the service configuration:
   - **Service Name**: `annual-plan-review-backend`
   - **Environment**: `node`
   - **Build Command**: `cd backend && npm install && npm run init-db`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free
   - **Persistent Disk**: 1GB mounted at `/opt/render/project/src/backend/db`

2. Click **"Apply"** to create the service

3. Render will:
   - Clone your repository
   - Install dependencies (`npm install`)
   - Initialize the database (`npm run init-db`)
   - Start the server (`npm start`)

### 4. Verify Deployment

Once deployed, your service will be available at: `https://your-service-name.onrender.com`

Test the following endpoints:

```bash
# Health check
curl https://your-service-name.onrender.com/api/health

# Should return:
{
  "success": true,
  "message": "API is running",
  "environment": "production",
  "timestamp": "2026-01-23T..."
}
```

### 5. Update Frontend Configuration

If you're using the frontend with the deployed backend:

1. Open `api-client.js` in your local repository
2. Update the API base URL to point to your Render service:

```javascript
// Option 1: Auto-detect (works if frontend is on same domain)
const API_BASE_URL = window.location.origin;

// Option 2: Hardcode your Render URL
const API_BASE_URL = 'https://your-service-name.onrender.com';
```

3. Commit and push the changes

## Database Persistence

The `render.yaml` configuration includes a persistent disk for your SQLite database:

- **Mount Path**: `/opt/render/project/src/backend/db`
- **Size**: 1GB (free tier)
- **Persistence**: Data survives across deploys and restarts

**Important Notes:**
- Free tier services sleep after 15 minutes of inactivity
- First request after sleep may take 30-60 seconds
- Database data is preserved during sleep
- For production use, consider upgrading to a paid plan

## Environment-Specific Configuration

### Development (Local)
```bash
cd backend
cp .env.example .env
# Edit .env with your local settings
npm install
npm run init-db
npm start
```

### Production (Render)
- Environment variables are set in Render Dashboard
- Database is automatically initialized during build
- HTTPS is automatically provided by Render

## Troubleshooting

### Service Won't Start

Check the logs in Render Dashboard:
1. Go to your service
2. Click **"Logs"** tab
3. Look for errors during build or startup

Common issues:
- Missing dependencies: Check `package.json`
- Database initialization failed: Check build logs
- Port conflicts: Ensure `PORT` env var is set to `3000`

### Database Not Persisting

Ensure the disk is properly mounted:
1. Go to service settings
2. Check **"Disks"** section
3. Verify mount path is `/opt/render/project/src/backend/db`
4. Verify disk is attached and healthy

### CORS Errors

If you see CORS errors in browser console:
1. Check `CORS_ORIGIN` environment variable in Render
2. Ensure it matches your frontend URL exactly
3. Restart the service after changing env vars
4. Use `*` for development (not recommended for production)

### API Health Check Failing

If Render shows "Service Unavailable":
1. Check that server is listening on `0.0.0.0` (already configured)
2. Verify `PORT` environment variable
3. Check server logs for startup errors
4. Ensure `/api/health` endpoint returns 200 status

### Free Tier Limitations

Render free tier:
- Services sleep after 15 minutes of inactivity
- 750 hours/month of runtime
- Slower cold starts (30-60 seconds)
- No custom domains on free tier
- 1GB persistent disk storage

For production use, consider:
- **Starter Plan**: $7/month, always-on service
- **Standard Plan**: $25/month, includes monitoring

## Updating Your Deployment

When you push changes to your GitHub repository:

1. Render automatically detects the changes
2. Triggers a new build
3. Runs build commands
4. Deploys the new version
5. Database data is preserved

**Manual Deploy:**
1. Go to your service in Render Dashboard
2. Click **"Manual Deploy"**
3. Select **"Deploy latest commit"**

## Security Best Practices

1. **Set specific CORS origin** instead of `*` in production
2. **Add authentication** for sensitive operations (not included in basic setup)
3. **Use environment variables** for all secrets
4. **Enable HTTPS only** (Render does this automatically)
5. **Implement rate limiting** for API endpoints
6. **Add input validation** for all user inputs
7. **Consider migrating to PostgreSQL** for production (Render offers free PostgreSQL)

## Next Steps

1. **Set up monitoring**: Use Render's built-in metrics or integrate external tools
2. **Add authentication**: Implement user authentication and authorization
3. **Upgrade database**: Consider PostgreSQL for better concurrency and reliability
4. **Custom domain**: Add your own domain in Render settings (paid plans)
5. **Automated backups**: Set up database backup strategy
6. **CI/CD enhancements**: Add automated testing before deployment

## Support

- **Render Documentation**: https://render.com/docs
- **Render Community**: https://community.render.com
- **Backend README**: See `backend/README.md` for API documentation

## Quick Reference

```bash
# Local development
cd backend
npm install
npm run init-db
npm run dev

# Check database
sqlite3 backend/db/apr.db ".tables"

# Test API locally
curl http://localhost:3000/api/health

# View Render logs
# Go to Dashboard → Your Service → Logs tab
```

---

**Deployment Checklist:**
- [ ] GitHub repository is up to date
- [ ] Render account created
- [ ] Repository connected to Render
- [ ] `CORS_ORIGIN` environment variable set
- [ ] Service deployed successfully
- [ ] Health check endpoint returns 200
- [ ] Frontend updated with backend URL (if separate)
- [ ] Tested API endpoints
- [ ] Database persistence verified
