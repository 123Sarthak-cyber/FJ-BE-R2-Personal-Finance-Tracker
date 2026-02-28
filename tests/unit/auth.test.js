const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../src/config/database');
const { mockRequest, mockResponse, mockUser, mockNext } = require('../helpers');

// Import controller functions
const authController = require('../../src/controllers/authController');

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const req = mockRequest({
        body: {
          email: 'newuser@example.com',
          password: 'SecurePass123',
          firstName: 'New',
          lastName: 'User'
        }
      });
      const res = mockResponse();

      // Mock database - no existing user
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock insert user
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          email: 'newuser@example.com',
          first_name: 'New',
          last_name: 'User',
          preferred_currency: 'USD'
        }]
      });
      // Mock insert default categories
      db.query.mockResolvedValueOnce({ rows: [] });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.any(String)
        })
      );
    });

    it('should return 400 if user already exists', async () => {
      const req = mockRequest({
        body: {
          email: 'existing@example.com',
          password: 'SecurePass123',
          firstName: 'Existing',
          lastName: 'User'
        }
      });
      const res = mockResponse();

      // Mock database - user exists
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password: 'SecurePass123',
          firstName: 'Test',
          lastName: 'User'
        }
      });
      const res = mockResponse();

      // Mock database error
      db.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123', 10);
      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password: 'TestPassword123'
        }
      });
      const res = mockResponse();

      // Mock database - user found
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockUser,
          password: hashedPassword
        }]
      });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          token: expect.any(String)
        })
      );
    });

    it('should return 401 for invalid email', async () => {
      const req = mockRequest({
        body: {
          email: 'nonexistent@example.com',
          password: 'TestPassword123'
        }
      });
      const res = mockResponse();

      // Mock database - no user found
      db.query.mockResolvedValueOnce({ rows: [] });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for invalid password', async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123', 10);
      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password: 'WrongPassword'
        }
      });
      const res = mockResponse();

      // Mock database - user found
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockUser,
          password: hashedPassword
        }]
      });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getProfile', () => {
    it('should return user profile for authenticated user', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'test-user-id',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          preferred_currency: 'USD'
        }]
      });

      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.any(Object)
        })
      );
    });

    it('should return 404 if user not found', async () => {
      const req = mockRequest({
        user: { userId: 'nonexistent-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] });

      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
