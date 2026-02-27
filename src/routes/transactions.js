const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const transactionController = require('../controllers/transactionController');
const { authenticate } = require('../middleware/auth');
const { validate, transactionValidation, uuidParam, dateRangeValidation } = require('../middleware/validation');

// Configure multer for receipt uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `receipt-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// All routes require authentication
router.use(authenticate);

// Get all transactions (with filtering)
router.get('/', dateRangeValidation, validate, transactionController.getTransactions);

// Get single transaction
router.get('/:id', uuidParam('id'), validate, transactionController.getTransaction);

// Create new transaction
router.post('/', transactionValidation, validate, transactionController.createTransaction);

// Update transaction
router.put('/:id', uuidParam('id'), validate, transactionController.updateTransaction);

// Delete transaction
router.delete('/:id', uuidParam('id'), validate, transactionController.deleteTransaction);

// Upload receipt for transaction
router.post('/:id/receipt', uuidParam('id'), validate, upload.single('receipt'), transactionController.uploadReceipt);

// Delete receipt from transaction
router.delete('/:id/receipt', uuidParam('id'), validate, transactionController.deleteReceipt);

// Error handler for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  next(error);
});

module.exports = router;
