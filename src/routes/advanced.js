const express = require('express');
const router = express.Router();
const multer = require('multer');
const { aiController, bankStatementController, anomalyController } = require('../controllers/advancedController');
const { authenticate } = require('../middleware/auth');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/csv',
      'application/pdf',
      'text/plain'
    ];
    
    const allowedExtensions = ['.csv', '.pdf'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and PDF files are allowed'));
    }
  }
});

// ==================== AI Routes ====================

/**
 * @route GET /api/ai/insights
 * @desc Get AI-powered spending insights
 * @access Private
 */
router.get('/ai/insights', authenticate, aiController.getInsights);

/**
 * @route GET /api/ai/report
 * @desc Get AI-generated financial report
 * @query period - weekly, monthly, yearly
 * @access Private
 */
router.get('/ai/report', authenticate, aiController.getReport);

/**
 * @route GET /api/ai/budget-recommendations
 * @desc Get AI budget recommendations
 * @access Private
 */
router.get('/ai/budget-recommendations', authenticate, aiController.getBudgetRecommendations);

/**
 * @route POST /api/ai/categorize
 * @desc Categorize a transaction using AI
 * @body description, amount
 * @access Private
 */
router.post('/ai/categorize', authenticate, aiController.categorizeTransaction);

/**
 * @route POST /api/ai/chat
 * @desc Chat with AI financial assistant
 * @body message, conversationHistory (optional)
 * @access Private
 */
router.post('/ai/chat', authenticate, aiController.chat);

// ==================== Bank Statement Import Routes ====================

/**
 * @route POST /api/import/statement
 * @desc Import bank statement (CSV or PDF)
 * @body file (multipart), skipDuplicates, autoCategorize
 * @access Private
 */
router.post('/import/statement', authenticate, upload.single('statement'), bankStatementController.importStatement);

/**
 * @route GET /api/import/history
 * @desc Get import history
 * @access Private
 */
router.get('/import/history', authenticate, bankStatementController.getImportHistory);

// ==================== Anomaly Detection Routes ====================

/**
 * @route GET /api/anomalies
 * @desc Detect spending anomalies
 * @access Private
 */
router.get('/anomalies', authenticate, anomalyController.detectAnomalies);

/**
 * @route GET /api/anomalies/velocity
 * @desc Get spending velocity
 * @access Private
 */
router.get('/anomalies/velocity', authenticate, anomalyController.getSpendingVelocity);

/**
 * @route GET /api/anomalies/trends
 * @desc Get anomaly trends
 * @access Private
 */
router.get('/anomalies/trends', authenticate, anomalyController.getAnomalyTrends);

module.exports = router;
