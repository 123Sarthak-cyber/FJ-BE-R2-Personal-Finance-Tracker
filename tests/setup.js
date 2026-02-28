// Test setup file
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SESSION_SECRET = 'test-session-secret';

// Mock database for unit tests
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
  },
  transaction: jest.fn()
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});
