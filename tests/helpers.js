const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Generate test JWT token
const generateTestToken = (userId = 'test-user-id', email = 'test@example.com') => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'test-jwt-secret',
    { expiresIn: '1h' }
  );
};

// Generate hashed password
const hashPassword = async (password = 'TestPassword123') => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Mock user data
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456', // hashed 'TestPassword123'
  first_name: 'Test',
  last_name: 'User',
  preferred_currency: 'USD',
  email_notifications: true,
  created_at: new Date(),
  updated_at: new Date()
};

// Mock category data
const mockCategory = {
  id: 'test-category-id',
  user_id: 'test-user-id',
  name: 'Salary',
  type: 'income',
  color: '#22c55e',
  icon: 'briefcase',
  is_default: false,
  created_at: new Date()
};

// Mock transaction data
const mockTransaction = {
  id: 'test-transaction-id',
  user_id: 'test-user-id',
  category_id: 'test-category-id',
  type: 'income',
  amount: '5000.00',
  currency: 'USD',
  description: 'Monthly salary',
  transaction_date: new Date(),
  receipt_url: null,
  is_refund: false,
  original_transaction_id: null,
  created_at: new Date(),
  updated_at: new Date()
};

// Mock budget data
const mockBudget = {
  id: 'test-budget-id',
  user_id: 'test-user-id',
  category_id: 'test-category-id',
  amount: '1000.00',
  period: 'monthly',
  start_date: new Date(),
  end_date: null,
  alert_threshold: 80,
  is_active: true,
  created_at: new Date()
};

// Mock request object
const mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  user: mockUser,
  file: null,
  ...overrides
});

// Mock response object
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// Mock next function
const mockNext = jest.fn();

module.exports = {
  generateTestToken,
  hashPassword,
  mockUser,
  mockCategory,
  mockTransaction,
  mockBudget,
  mockRequest,
  mockResponse,
  mockNext
};
