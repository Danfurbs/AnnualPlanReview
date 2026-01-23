# Annual Plan Review - Backend API

This backend server provides persistent storage for forecasts, baselines, and comments across multiple computers. It uses Express.js with SQLite database.

## Features

- **RESTful API**: Full CRUD operations for forecasts, baselines, and comments
- **SQLite Database**: Lightweight, file-based database for easy deployment
- **CORS Enabled**: Supports cross-origin requests
- **Automatic Fallback**: Frontend maintains localStorage as cache/fallback
- **Data Migration**: Built-in utilities to export/import data between localStorage and backend

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Initialize Database

```bash
npm run init-db
```

This creates the SQLite database at `backend/db/apr.db` with all necessary tables.

### 3. Start Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

The server will start on **http://localhost:3000**

### 4. Access Application

Open your browser and navigate to:

```
http://localhost:3000
```

The backend serves both the API endpoints and the frontend application.

## Database Schema

### Tables

#### forecasts
Stores forecast data for each job/work group/period combination.

- `id` - Auto-increment primary key
- `job_number` - Job number (string)
- `work_group` - Work group name (string)
- `fiscal_year` - Fiscal year (e.g., "FY27")
- `plan_version` - Plan version (e.g., "v0", "v1")
- `period` - Period identifier (e.g., "P1", "P2", ...)
- `value` - Forecast value (number)
- `created_at`, `updated_at` - Timestamps

#### forecast_comments
Work-group specific forecast comments.

- `id` - Auto-increment primary key
- `job_number` - Job number
- `work_group` - Work group name
- `fiscal_year` - Fiscal year
- `plan_version` - Plan version
- `comment` - Comment text
- `created_at`, `updated_at` - Timestamps

#### job_comments
Standalone review comments (general commentary).

- `id` - Unique comment ID
- `job_number` - Job number
- `category` - Comment category (General, RF3, RF6, RF9, RF11, IME)
- `text` - Comment text
- `timestamp` - Comment timestamp
- `fiscal_year` - Fiscal year
- `rf_stage` - RF stage
- `created_at` - Created timestamp

#### baselines
Baseline values per job.

- `job_number` - Job number (primary key)
- `total_value` - Total baseline value
- `created_at`, `updated_at` - Timestamps

#### v1_overrides
Tracks which jobs have been explicitly edited in plan v1.

- `id` - Auto-increment primary key
- `job_number` - Job number
- `fiscal_year` - Fiscal year
- `created_at` - Created timestamp

## API Endpoints

### Forecasts

- `GET /api/forecasts/:fiscalYear/:planVersion` - Get all forecasts
- `GET /api/forecasts/:fiscalYear/:planVersion/job/:jobNumber` - Get forecast for specific job
- `POST /api/forecasts/:fiscalYear/:planVersion` - Save all forecasts
- `POST /api/forecasts/:fiscalYear/:planVersion/job/:jobNumber` - Save forecast for specific job
- `GET /api/forecasts/v1-overrides/:fiscalYear` - Get v1 overrides
- `POST /api/forecasts/v1-overrides/:fiscalYear/:jobNumber` - Add v1 override
- `DELETE /api/forecasts/v1-overrides/:fiscalYear/:jobNumber` - Remove v1 override

### Baselines

- `GET /api/baselines` - Get all baselines
- `GET /api/baselines/:jobNumber` - Get baseline for specific job
- `POST /api/baselines` - Save all baselines
- `POST /api/baselines/:jobNumber` - Save baseline for specific job
- `DELETE /api/baselines/:jobNumber` - Delete baseline

### Comments

- `GET /api/comments` - Get all job comments
- `GET /api/comments/:jobNumber` - Get comments for specific job
- `POST /api/comments` - Save single comment
- `POST /api/comments/bulk` - Save multiple comments
- `DELETE /api/comments/:commentId` - Delete comment

### Health Check

- `GET /api/health` - Check if API is running

## Frontend Integration

### Enable Backend Mode

The frontend automatically detects the backend if it's running on the same host. To manually enable/disable:

```javascript
// In browser console
window.toggleApiMode(true);  // Enable backend
window.toggleApiMode(false); // Disable backend (localStorage only)
```

### Check Backend Status

```javascript
// In browser console
await window.checkApiHealth();
```

### Data Migration

#### Export from localStorage to Backend

```javascript
// In browser console
await window.migrateAllDataToBackend();
```

This exports all existing data from localStorage to the backend database.

#### Import from Backend to localStorage

```javascript
// In browser console
await window.migrateAllDataFromBackend();
```

This imports all data from the backend to localStorage (useful for offline access).

## Deployment

### Local Network Access

To allow access from other computers on your local network:

1. Find your local IP address:
   ```bash
   # Windows
   ipconfig

   # Mac/Linux
   ifconfig
   ```

2. Update `server.js` to listen on all interfaces:
   ```javascript
   app.listen(PORT, '0.0.0.0', () => {
     // ...
   });
   ```

3. Access from other computers using your IP:
   ```
   http://YOUR_IP_ADDRESS:3000
   ```

### Production Deployment

For production deployment:

1. **Use a production database**: Consider PostgreSQL or MySQL instead of SQLite
2. **Add authentication**: Implement user authentication and authorization
3. **Enable HTTPS**: Use SSL/TLS certificates
4. **Use a process manager**: Use PM2 or similar to keep the server running
5. **Set up reverse proxy**: Use Nginx or Apache as reverse proxy
6. **Configure firewall**: Open only necessary ports
7. **Set environment variables**: Use .env file for configuration

Example with PM2:

```bash
# Install PM2
npm install -g pm2

# Start server with PM2
pm2 start server.js --name "apr-backend"

# Configure to start on boot
pm2 startup
pm2 save
```

## Troubleshooting

### Server won't start

- Check if port 3000 is already in use
- Ensure Node.js is installed: `node --version`
- Reinstall dependencies: `npm install`

### Database errors

- Reinitialize database: `npm run init-db`
- Check database file permissions: `ls -la db/`

### Frontend can't connect

- Verify server is running: `curl http://localhost:3000/api/health`
- Check browser console for CORS errors
- Ensure you're accessing via `http://localhost:3000`, not `file://`

### Data not syncing

- Check API mode is enabled: `window.isApiEnabled()`
- Check browser console for API errors
- Verify backend health: `await window.checkApiHealth()`

## Development

### Project Structure

```
backend/
├── db/                 # Database files (SQLite)
├── routes/             # API route handlers
│   ├── forecasts.js    # Forecast endpoints
│   ├── baselines.js    # Baseline endpoints
│   └── comments.js     # Comment endpoints
├── scripts/            # Utility scripts
│   └── init-db.js      # Database initialization
├── services/           # Business logic layer
│   └── database.js     # Database service
├── package.json        # Dependencies
├── server.js           # Main server file
└── README.md          # This file
```

### Adding New Endpoints

1. Create route handler in `routes/`
2. Add route to `server.js`
3. Add corresponding frontend API call in `api-client.js`
4. Update this README

## License

MIT
