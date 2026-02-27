const express = require('express');
const router = express.Router();

const budgetController = require('../controllers/budgetController');
const { authenticate } = require('../middleware/auth');
const { validate, budgetValidation, uuidParam } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Get budget progress / overview
router.get('/progress', budgetController.getBudgetProgress);

// Get all budgets
router.get('/', budgetController.getBudgets);

// Get single budget
router.get('/:id', uuidParam('id'), validate, budgetController.getBudget);

// Create new budget
router.post('/', budgetValidation, validate, budgetController.createBudget);

// Update budget
router.put('/:id', uuidParam('id'), validate, budgetController.updateBudget);

// Delete budget
router.delete('/:id', uuidParam('id'), validate, budgetController.deleteBudget);

module.exports = router;
