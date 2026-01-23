# Render Deployment Guide

This guide will help you deploy the Annual Plan Review backend to Render.com.

## ⚠️ CRITICAL: Free Tier Database Limitation

**The free tier does NOT support persistent disks. Your database will be reset on every deploy.**

**For production use, you have two options:**
1. **Upgrade to Starter plan** ($7/month) - Supports persistent disk for SQLite
2. **Use PostgreSQL** (Render offers free PostgreSQL) - See "PostgreSQL Migration" section below

**For testing/development only**, the free tier works but data will be lost on each deploy.

## Prerequisites

1. A [Render.com](https://render.com) account (free tier available)
2. Your GitHub repository pushed to GitHub
3. Basic knowledge of environment variables
4. **Decision**: Free tier (ephemeral) vs Paid tier (persistent) vs PostgreSQL (free + persistent)

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
   - **Plan**: Free ⚠️ **Database will be reset on each deploy**
   - **Persistent Disk**: None (not available on free tier)

2. Click **"Apply"** to create the service

3. Render will:
   - Clone your repository
   - Install dependencies (`npm install`)
   - Initialize the database (`npm run init-db`)
   - Start the server (`npm start`)

**⚠️ Important**: On the free tier, your database will be recreated empty on each deploy. Any data you save will be lost when:
- You push new code to GitHub (triggers auto-deploy)
- You manually deploy from the Render dashboard
- Render restarts your service

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

## Database Persistence Options

### Option 1: Free Tier with SQLite (⚠️ NOT PERSISTENT)

**Current configuration** - Database resets on each deploy:
- ❌ Data is **LOST** on every deploy
- ❌ Data is **LOST** when service restarts
- ✅ Works for testing/demos
- ✅ No cost

**When to use**: Testing, development, demos where data loss is acceptable

### Option 2: Paid Tier with SQLite (✅ PERSISTENT)

**Upgrade to Starter plan** ($7/month):
1. In render.yaml, uncomment the disk section:
   ```yaml
   disk:
     name: sqlite-data
     mountPath: /opt/render/project/src/backend/db
     sizeGB: 1
   ```
2. In Render Dashboard, upgrade your service to Starter plan
3. Redeploy

**Benefits**:
- ✅ Data persists across deploys
- ✅ Data persists across restarts
- ✅ No code changes needed
- ✅ Simple SQLite database

### Option 3: PostgreSQL (✅ PERSISTENT + FREE)

**Use Render's free PostgreSQL** (recommended for production):
1. Create a free PostgreSQL database in Render
2. Install `pg` package: `npm install pg`
3. Modify database service to support PostgreSQL
4. Update DATABASE_URL environment variable

See "PostgreSQL Migration Guide" section below for detailed steps.

**Benefits**:
- ✅ FREE and persistent
- ✅ Better for production (concurrent access, reliability)
- ✅ Automatic backups
- ⚠️ Requires code changes

**Important Notes (All Options):**
- Free tier services sleep after 15 minutes of inactivity
- First request after sleep may take 30-60 seconds
- Sleeping does NOT affect database (if persistent)

## PostgreSQL Migration Guide

To use Render's free PostgreSQL database instead of SQLite:

### Step 1: Create PostgreSQL Database in Render

1. In Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Name it (e.g., `annual-plan-review-db`)
3. Select **Free** plan
4. Click **"Create Database"**
5. Copy the **Internal Database URL** (format: `postgresql://user:pass@host/db`)

### Step 2: Update Backend Dependencies

```bash
cd backend
npm install pg
```

Add to `backend/package.json`:
```json
"dependencies": {
  "pg": "^8.11.3"
}
```

### Step 3: Create PostgreSQL Database Service

Create `backend/services/database-pg.js` (PostgreSQL version of database service).
This requires modifying SQL queries to use PostgreSQL syntax instead of SQLite.

**Key differences:**
- SQLite: `INTEGER PRIMARY KEY AUTOINCREMENT`
- PostgreSQL: `SERIAL PRIMARY KEY`
- Date handling differs between SQLite and PostgreSQL

### Step 4: Update Environment Variables

In Render web service settings, add:
- `DATABASE_URL`: (paste Internal Database URL from Step 1)
- `USE_POSTGRESQL`: `true`

### Step 5: Update server.js

Modify `backend/server.js` to conditionally use PostgreSQL:
```javascript
const DatabaseService = process.env.USE_POSTGRESQL
  ? require('./services/database-pg')
  : require('./services/database');
```

### Step 6: Deploy

Push changes to GitHub and Render will auto-deploy.

**Note:** Full PostgreSQL migration requires significant code changes. For a quick start, consider using an ORM like Prisma or Sequelize that abstracts database differences.

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

**If on free tier:** This is expected - free tier does NOT support persistent disks.
- Your options: Upgrade to paid plan OR use PostgreSQL (free)

**If on paid tier with disk:**
1. Go to service settings
2. Check **"Disks"** section
3. Verify mount path is `/opt/render/project/src/backend/db`
4. Verify disk is attached and healthy
5. Ensure render.yaml disk section is uncommented

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
- ❌ **NO persistent disk support** (database resets on deploy)
- Services sleep after 15 minutes of inactivity
- 750 hours/month of runtime
- Slower cold starts (30-60 seconds)
- No custom domains on free tier

For production use, consider:
- **Free PostgreSQL**: Free database with persistence (recommended)
- **Starter Plan**: $7/month, includes persistent disk for SQLite
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
