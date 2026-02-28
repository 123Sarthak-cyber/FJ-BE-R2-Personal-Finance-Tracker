const jwt = require('jsonwebtoken');
const { mockRequest, mockResponse, mockNext } = require('../helpers');

// Create auth middleware mock
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('should reject request without authorization header', () => {
      const req = mockRequest({
        headers: {}
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('token')
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      const req = mockRequest({
        headers: {
          authorization: 'InvalidFormat token123'
        }
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with expired token', () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 'test-id', email: 'test@example.com' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '-1h' } // Already expired
      );

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid signature', () => {
      // Create token with different secret
      const invalidToken = jwt.sign(
        { userId: 'test-id', email: 'test@example.com' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${invalidToken}`
        }
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request with valid token', () => {
      const validToken = jwt.sign(
        { userId: 'test-user-id', email: 'test@example.com' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '1h' }
      );

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });
      const res = mockResponse();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('test-user-id');
      expect(req.user.email).toBe('test@example.com');
    });

    it('should attach user info to request object', () => {
      const validToken = jwt.sign(
        { userId: 'specific-id', email: 'specific@example.com', role: 'user' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '1h' }
      );

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });
      const res = mockResponse();
      const next = jest.fn();

      authMiddleware(req, res, next);

      expect(req.user.userId).toBe('specific-id');
      expect(req.user.email).toBe('specific@example.com');
    });
  });
});

describe('Validation Middleware', () => {
  // Simple validation function
  const validateRequired = (fields) => (req, res, next) => {
    const missing = fields.filter(field => !req.body[field]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }
    next();
  };

  it('should reject request with missing required fields', () => {
    const validate = validateRequired(['email', 'password']);
    const req = mockRequest({ body: { email: 'test@example.com' } });
    const res = mockResponse();
    const next = jest.fn();

    validate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow request with all required fields', () => {
    const validate = validateRequired(['email', 'password']);
    const req = mockRequest({
      body: { email: 'test@example.com', password: 'password123' }
    });
    const res = mockResponse();
    const next = jest.fn();

    validate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  describe('Email Validation', () => {
    const validateEmail = (req, res, next) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
      next();
    };

    it('should reject invalid email format', () => {
      const req = mockRequest({ body: { email: 'invalid-email' } });
      const res = mockResponse();
      const next = jest.fn();

      validateEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid email format', () => {
      const req = mockRequest({ body: { email: 'valid@example.com' } });
      const res = mockResponse();
      const next = jest.fn();

      validateEmail(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Amount Validation', () => {
    const validateAmount = (req, res, next) => {
      const amount = parseFloat(req.body.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }
      next();
    };

    it('should reject negative amounts', () => {
      const req = mockRequest({ body: { amount: -100 } });
      const res = mockResponse();
      const next = jest.fn();

      validateAmount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject zero amount', () => {
      const req = mockRequest({ body: { amount: 0 } });
      const res = mockResponse();
      const next = jest.fn();

      validateAmount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should accept positive amounts', () => {
      const req = mockRequest({ body: { amount: 100.50 } });
      const res = mockResponse();
      const next = jest.fn();

      validateAmount(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle decimal precision', () => {
      const req = mockRequest({ body: { amount: 99.99 } });
      const res = mockResponse();
      const next = jest.fn();

      validateAmount(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
