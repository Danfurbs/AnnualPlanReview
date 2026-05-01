/**
 * Annual Plan Review - Backend Server
 * Express server with database for forecasts, baselines, and comments
 * Supports both SQLite (local dev) and PostgreSQL (production)
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');

// Select database service based on environment
const isProduction = process.env.NODE_ENV === 'production';
const USE_POSTGRESQL = process.env.USE_POSTGRESQL === 'true' || Boolean(process.env.DATABASE_URL) || isProduction;
const DatabaseService = USE_POSTGRESQL
  ? require('./services/database-pg')
  : require('./services/database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// In production we require PostgreSQL connection details to guarantee persistent storage.
if (isProduction && !process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required in production to guarantee persistent server storage.');
  process.exit(1);
}

// Initialize database service
const db = new DatabaseService();

console.log(`Using ${USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite'} database`);

// Middleware
function parseCorsOrigin(value) {
  if (!value || value === '*') return '*';
  const origins = value.split(',').map(origin => origin.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

const parsedCorsOrigin = parseCorsOrigin(CORS_ORIGIN);
const allowCredentials = parsedCorsOrigin !== '*';

const corsOptions = {
  origin: parsedCorsOrigin,
  credentials: allowCredentials,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions)); // Enable CORS for all routes
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev')); // HTTP request logging

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    environment: NODE_ENV,
    database: USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite',
    storage: USE_POSTGRESQL ? 'persistent-postgresql' : 'local-sqlite',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health/db', async (req, res) => {
  try {
    const ok = await db.ping();
    res.status(ok ? 200 : 503).json({
      success: ok,
      database: USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      database: USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
const forecastRoutes = require('./routes/forecasts')(db);
const baselineRoutes = require('./routes/baselines')(db);
const commentRoutes = require('./routes/comments')(db);
const groupRoutes = require('./routes/groups')(db);
const workDoneRoutes = require('./routes/work-done')(db);

app.use('/api/forecasts', forecastRoutes);
app.use('/api/baselines', baselineRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/work-done', workDoneRoutes);

// Fallback route for SPA - serve index.html for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  } else {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`Annual Plan Review Backend Server`);
  console.log(`========================================`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Database: ${USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite'}`);
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`API endpoints available at: http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
  console.log(`========================================\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await db.close();
  process.exit(0);
});
