const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const apiLogger = require('../middleware/apiLogger');
const { getCountries, getCountry, getStates, getCities, getUsage, getUsageHistory } = require('../controllers/geoController');

// All geo routes require authentication + rate limiting
router.use(authenticate);

// ─── Usage Stats ─────────────────────────────────────
// GET /api/v1/usage  — how many calls used today/month (does NOT consume a token)
router.get('/usage', getUsage);

// GET /api/v1/usage/history
router.get('/usage/history', getUsageHistory);

// Rate limiter & API logger apply to all data routes below this line
// API logger must run BEFORE rateLimiter so that rate-limited requests (429) are still logged
router.use(apiLogger);
router.use(rateLimiter);

// ─── Geographical Data ───────────────────────────────
// GET /api/v1/countries
router.get('/countries', getCountries);

// GET /api/v1/countries/:iso2
router.get('/countries/:iso2', getCountry);

// GET /api/v1/countries/:iso2/states
router.get('/countries/:iso2/states', getStates);

// GET /api/v1/countries/:iso2/states/:stateCode/cities
router.get('/countries/:iso2/states/:stateCode/cities', getCities);

module.exports = router;
