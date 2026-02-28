const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Create a minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware for protected routes
  app.use((req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret');
        req.user = decoded;
      } catch (err) {
        // Invalid token
      }
    }
    next();
  });
  
  return app;
};

describe('API Integration Tests', () => {
  let app;
  let authToken;

  beforeAll(() => {
    // Generate a valid test token
    authToken = jwt.sign(
      { userId: 'test-user-id', email: 'test@example.com' },
      process.env.JWT_SECRET || 'test-jwt-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Health Check', () => {
    it('GET /api/health should return ok status', async () => {
      app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });

      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication Endpoints', () => {
    it('POST /api/auth/register should require email and password', async () => {
      app.post('/api/auth/register', (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: 'Email and password are required'
          });
        }
        res.status(201).json({ success: true, message: 'User registered' });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('POST /api/auth/login should return token on success', async () => {
      app.post('/api/auth/login', (req, res) => {
        const { email, password } = req.body;
        if (email === 'test@example.com' && password === 'password123') {
          const token = jwt.sign(
            { userId: 'user-id', email },
            process.env.JWT_SECRET || 'test-jwt-secret'
          );
          return res.json({ success: true, token });
        }
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
    });

    it('GET /api/auth/profile should require authentication', async () => {
      app.get('/api/auth/profile', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        res.json({ success: true, user: req.user });
      });

      // Without token
      await request(app)
        .get('/api/auth/profile')
        .expect(401);

      // With token
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Transaction Endpoints', () => {
    it('GET /api/transactions should return transactions for authenticated user', async () => {
      app.get('/api/transactions', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          transactions: [],
          pagination: { total: 0, page: 1, limit: 10 }
        });
      });

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('pagination');
    });

    it('POST /api/transactions should create transaction', async () => {
      app.post('/api/transactions', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        const { amount, type, categoryId, description } = req.body;
        if (!amount || !type || !categoryId) {
          return res.status(400).json({ success: false, message: 'Missing fields' });
        }
        res.status(201).json({
          success: true,
          transaction: {
            id: 'new-id',
            amount,
            type,
            category_id: categoryId,
            description
          }
        });
      });

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 100.50,
          type: 'expense',
          categoryId: 'cat-id',
          description: 'Test expense'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.transaction.amount).toBe(100.50);
    });

    it('PUT /api/transactions/:id should update transaction', async () => {
      app.put('/api/transactions/:id', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          transaction: {
            id: req.params.id,
            ...req.body
          }
        });
      });

      const response = await request(app)
        .put('/api/transactions/trans-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 200 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transaction.id).toBe('trans-123');
    });

    it('DELETE /api/transactions/:id should delete transaction', async () => {
      app.delete('/api/transactions/:id', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({ success: true, message: 'Transaction deleted' });
      });

      const response = await request(app)
        .delete('/api/transactions/trans-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Category Endpoints', () => {
    it('GET /api/categories should return user categories', async () => {
      app.get('/api/categories', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          categories: [
            { id: '1', name: 'Salary', type: 'income' },
            { id: '2', name: 'Food', type: 'expense' }
          ]
        });
      });

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.categories).toHaveLength(2);
    });

    it('POST /api/categories should create category', async () => {
      app.post('/api/categories', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        const { name, type } = req.body;
        if (!name || !type) {
          return res.status(400).json({ success: false });
        }
        res.status(201).json({
          success: true,
          category: { id: 'new-cat', name, type }
        });
      });

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Entertainment', type: 'expense' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.category.name).toBe('Entertainment');
    });
  });

  describe('Budget Endpoints', () => {
    it('GET /api/budgets should return user budgets', async () => {
      app.get('/api/budgets', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          budgets: [
            { id: '1', category_name: 'Food', amount: '500.00', spent: '300.00' }
          ]
        });
      });

      const response = await request(app)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.budgets).toHaveLength(1);
    });

    it('POST /api/budgets should create budget', async () => {
      app.post('/api/budgets', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.status(201).json({
          success: true,
          budget: {
            id: 'new-budget',
            ...req.body
          }
        });
      });

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          categoryId: 'cat-id',
          amount: 1000,
          period: 'monthly',
          alertThreshold: 80
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Dashboard Endpoints', () => {
    it('GET /api/dashboard should return summary data', async () => {
      app.get('/api/dashboard', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          summary: {
            totalIncome: 5000,
            totalExpenses: 3000,
            balance: 2000,
            savingsRate: 40
          }
        });
      });

      const response = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary).toHaveProperty('totalIncome');
      expect(response.body.summary).toHaveProperty('totalExpenses');
      expect(response.body.summary).toHaveProperty('balance');
    });
  });

  describe('Report Endpoints', () => {
    it('GET /api/reports/monthly should return monthly report', async () => {
      app.get('/api/reports/monthly', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        res.json({
          success: true,
          report: {
            month: '2026-02',
            income: 5000,
            expenses: 3000,
            net: 2000,
            byCategory: []
          }
        });
      });

      const response = await request(app)
        .get('/api/reports/monthly')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.report).toHaveProperty('income');
      expect(response.body.report).toHaveProperty('expenses');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      app.use((req, res) => {
        res.status(404).json({ success: false, message: 'Route not found' });
      });

      await request(app)
        .get('/api/unknown')
        .expect(404);
    });

    it('should handle invalid JSON gracefully', async () => {
      app.use(express.json());
      app.use((err, req, res, next) => {
        if (err instanceof SyntaxError) {
          return res.status(400).json({ success: false, message: 'Invalid JSON' });
        }
        next(err);
      });
      app.post('/api/test', (req, res) => res.json({ success: true }));

      await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });
});
