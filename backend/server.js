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
const USE_POSTGRESQL = process.env.USE_POSTGRESQL === 'true' || process.env.DATABASE_URL;
const DatabaseService = USE_POSTGRESQL
  ? require('./services/database-pg')
  : require('./services/database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Initialize database service
const db = new DatabaseService();

console.log(`Using ${USE_POSTGRESQL ? 'PostgreSQL' : 'SQLite'} database`);

// Middleware
const corsOptions = {
  origin: CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions)); // Enable CORS for all routes
app.use(bodyParser.json({ limit: '50mb' })); // Parse JSON bodies (increased limit for bulk data)
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
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
    timestamp: new Date().toISOString()
  });
});

// API Routes
const forecastRoutes = require('./routes/forecasts')(db);
const baselineRoutes = require('./routes/baselines')(db);
const commentRoutes = require('./routes/comments')(db);

app.use('/api/forecasts', forecastRoutes);
app.use('/api/baselines', baselineRoutes);
app.use('/api/comments', commentRoutes);

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
