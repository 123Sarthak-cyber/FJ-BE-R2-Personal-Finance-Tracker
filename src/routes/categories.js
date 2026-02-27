const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/categoryController');
const { authenticate } = require('../middleware/auth');
const { validate, categoryValidation, uuidParam, dateRangeValidation } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Get all categories
router.get('/', categoryController.getCategories);

// Get single category
router.get('/:id', uuidParam('id'), validate, categoryController.getCategory);

// Get category statistics
router.get('/:id/stats', uuidParam('id'), dateRangeValidation, validate, categoryController.getCategoryStats);

// Create new category
router.post('/', categoryValidation, validate, categoryController.createCategory);

// Update category
router.put('/:id', uuidParam('id'), validate, categoryController.updateCategory);

// Delete category (with optional moveTransactionsTo query param)
router.delete('/:id', uuidParam('id'), validate, categoryController.deleteCategory);

module.exports = router;
