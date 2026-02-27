const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { getExchangeRates, convertCurrency, getSupportedCurrencies } = require('../services/currencyService');

// All routes require authentication
router.use(authenticate);

// Get dashboard overview
router.get('/', dashboardController.getDashboard);

// Get all-time account balance
router.get('/balance', dashboardController.getAccountBalance);

// Get daily spending data for charts
router.get('/daily', dashboardController.getDailySpending);

// Currency routes (public within authenticated context)
router.get('/currencies', getSupportedCurrencies);
router.get('/exchange-rates', getExchangeRates);
router.get('/convert', convertCurrency);

module.exports = router;
