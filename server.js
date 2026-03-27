const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'forecast-store.json');

app.use(express.json({ limit: '5mb' }));

function ensureStoreFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ forecasts: {} }, null, 2));
  }
}

function readStore() {
  ensureStoreFile();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (err) {
    console.warn('Store read failed; recreating:', err.message);
    return { forecasts: {} };
  }
}

function writeStore(store) {
  ensureStoreFile();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: STORE_FILE });
});

app.get('/api/forecast/:year/:planVersion', (req, res) => {
  const { year, planVersion } = req.params;
  const store = readStore();
  const entry = store?.forecasts?.[year]?.[planVersion] || null;

  if (!entry) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.json(entry);
});

app.put('/api/forecast/:year/:planVersion', (req, res) => {
  const { year, planVersion } = req.params;
  const payload = req.body;

  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const store = readStore();
  if (!store.forecasts) store.forecasts = {};
  if (!store.forecasts[year]) store.forecasts[year] = {};

  store.forecasts[year][planVersion] = {
    data: payload.data,
    rowCount: payload.rowCount ?? null,
    savedAt: payload.savedAt || new Date().toISOString()
  };

  writeStore(store);
  return res.json({ ok: true });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  ensureStoreFile();
  console.log(`AnnualPlanReview server listening on port ${PORT}`);
  console.log(`Forecast store file: ${STORE_FILE}`);
});
