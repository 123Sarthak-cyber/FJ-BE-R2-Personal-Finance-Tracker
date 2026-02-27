const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { validate, dateRangeValidation } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Get monthly report
router.get('/monthly', reportController.getMonthlyReport);

// Get yearly report
router.get('/yearly', reportController.getYearlyReport);

// Get custom date range report
router.get('/custom', dateRangeValidation, validate, reportController.getCustomReport);

// Export report as CSV/JSON
router.get('/export', dateRangeValidation, validate, reportController.exportReport);

module.exports = router;
