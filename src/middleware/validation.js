const { body, param, query: queryValidator, validationResult } = require('express-validator');
const Decimal = require('decimal.js');

// Validation result handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// User registration validation
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('First name must be less than 100 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters')
];

// User login validation
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Transaction validation
const transactionValidation = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .custom((value) => {
      try {
        const decimal = new Decimal(value);
        // Allow negative amounts for refunds
        if (decimal.isNaN()) {
          throw new Error('Invalid decimal format');
        }
        return true;
      } catch (error) {
        throw new Error('Amount must be a valid decimal number');
      }
    }),
  body('type')
    .isIn(['income', 'expense'])
    .withMessage('Type must be either "income" or "expense"'),
  body('categoryId')
    .optional()
    .isUUID()
    .withMessage('Invalid category ID'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid date format'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .isAlpha()
    .toUpperCase()
    .withMessage('Currency must be a 3-letter code'),
  body('isRefund')
    .optional()
    .isBoolean()
    .withMessage('isRefund must be a boolean')
];

// Category validation
const categoryValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ max: 100 })
    .withMessage('Category name must be less than 100 characters'),
  body('type')
    .isIn(['income', 'expense'])
    .withMessage('Type must be either "income" or "expense"'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color code'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon name must be less than 50 characters')
];

// Budget validation
const budgetValidation = [
  body('categoryId')
    .isUUID()
    .withMessage('Valid category ID is required'),
  body('amount')
    .notEmpty()
    .withMessage('Budget amount is required')
    .custom((value) => {
      const decimal = new Decimal(value);
      if (decimal.isNaN() || decimal.lessThanOrEqualTo(0)) {
        throw new Error('Budget amount must be a positive number');
      }
      return true;
    }),
  body('period')
    .isIn(['daily', 'weekly', 'monthly', 'yearly'])
    .withMessage('Period must be daily, weekly, monthly, or yearly'),
  body('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid start date format'),
  body('alertThreshold')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Alert threshold must be between 0 and 100')
];

// UUID param validation
const uuidParam = (paramName) => [
  param(paramName)
    .isUUID()
    .withMessage(`Invalid ${paramName}`)
];

// Date range query validation
const dateRangeValidation = [
  queryValidator('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  queryValidator('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  queryValidator('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .isAlpha()
    .toUpperCase()
    .withMessage('Currency must be a 3-letter code')
];

// Profile update validation
const profileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('First name must be less than 100 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters'),
  body('preferredCurrency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .isAlpha()
    .toUpperCase()
    .withMessage('Currency must be a 3-letter code'),
  body('emailNotifications')
    .optional()
    .isBoolean()
    .withMessage('Email notifications must be a boolean')
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  transactionValidation,
  categoryValidation,
  budgetValidation,
  uuidParam,
  dateRangeValidation,
  profileValidation
};
