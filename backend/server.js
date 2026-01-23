/**
 * Annual Plan Review - Backend Server
 * Express server with SQLite database for forecasts, baselines, and comments
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');
const DatabaseService = require('./services/database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database service
const db = new DatabaseService();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json({ limit: '50mb' })); // Parse JSON bodies (increased limit for bulk data)
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev')); // HTTP request logging

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
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
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Annual Plan Review Backend Server`);
  console.log(`========================================`);
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`API endpoints available at: http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});
