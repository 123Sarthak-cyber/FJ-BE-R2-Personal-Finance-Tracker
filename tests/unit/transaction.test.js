const db = require('../../src/config/database');
const { mockRequest, mockResponse, mockTransaction, mockCategory } = require('../helpers');

const transactionController = require('../../src/controllers/transactionController');

describe('Transaction Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransaction', () => {
    it('should create a new income transaction', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'test-category-id',
          type: 'income',
          amount: 5000,
          description: 'Monthly salary',
          transactionDate: '2026-02-28'
        }
      });
      const res = mockResponse();

      // Mock category exists
      db.query.mockResolvedValueOnce({
        rows: [mockCategory]
      });

      // Mock transaction insert
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          id: 'new-transaction-id'
        }]
      });

      await transactionController.createTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    it('should create an expense transaction', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'expense-category-id',
          type: 'expense',
          amount: 150.50,
          description: 'Grocery shopping',
          transactionDate: '2026-02-28'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({
        rows: [{ ...mockCategory, type: 'expense', name: 'Groceries' }]
      });

      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          type: 'expense',
          amount: '150.50'
        }]
      });

      await transactionController.createTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should handle decimal precision correctly', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'test-category-id',
          type: 'expense',
          amount: 99.99,
          description: 'Precise amount test',
          transactionDate: '2026-02-28'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [mockCategory] });
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          amount: '99.99'
        }]
      });

      await transactionController.createTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: expect.objectContaining({
            amount: '99.99'
          })
        })
      );
    });

    it('should return 404 if category not found', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'nonexistent-category-id',
          type: 'income',
          amount: 1000,
          description: 'Test',
          transactionDate: '2026-02-28'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] });

      await transactionController.createTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        query: { page: 1, limit: 10 }
      });
      const res = mockResponse();

      // Mock count
      db.query.mockResolvedValueOnce({ rows: [{ count: '25' }] });
      // Mock transactions
      db.query.mockResolvedValueOnce({
        rows: [mockTransaction, { ...mockTransaction, id: 'second-transaction' }]
      });

      await transactionController.getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transactions: expect.any(Array),
          pagination: expect.objectContaining({
            total: 25,
            page: 1,
            limit: 10
          })
        })
      );
    });

    it('should filter transactions by type', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        query: { type: 'income' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      db.query.mockResolvedValueOnce({ rows: [mockTransaction] });

      await transactionController.getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should filter transactions by date range', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        query: {
          startDate: '2026-01-01',
          endDate: '2026-02-28'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      db.query.mockResolvedValueOnce({ rows: [mockTransaction] });

      await transactionController.getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateTransaction', () => {
    it('should update a transaction', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'test-transaction-id' },
        body: {
          amount: 6000,
          description: 'Updated salary'
        }
      });
      const res = mockResponse();

      // Mock existing transaction
      db.query.mockResolvedValueOnce({ rows: [mockTransaction] });
      // Mock update
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          amount: '6000.00',
          description: 'Updated salary'
        }]
      });

      await transactionController.updateTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 if transaction not found', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'nonexistent-id' },
        body: { amount: 5000 }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] });

      await transactionController.updateTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteTransaction', () => {
    it('should delete a transaction', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'test-transaction-id' }
      });
      const res = mockResponse();

      // Mock existing transaction
      db.query.mockResolvedValueOnce({ rows: [mockTransaction] });
      // Mock delete
      db.query.mockResolvedValueOnce({ rows: [mockTransaction] });

      await transactionController.deleteTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('deleted')
        })
      );
    });
  });

  describe('createRefund', () => {
    it('should create a refund for an expense transaction', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'expense-transaction-id' },
        body: {
          amount: 50,
          description: 'Partial refund'
        }
      });
      const res = mockResponse();

      // Mock original transaction (expense)
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          type: 'expense',
          amount: '100.00'
        }]
      });

      // Mock refund insert
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          id: 'refund-id',
          type: 'income',
          amount: '50.00',
          is_refund: true,
          original_transaction_id: 'expense-transaction-id'
        }]
      });

      await transactionController.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          refund: expect.objectContaining({
            is_refund: true
          })
        })
      );
    });

    it('should not allow refund greater than original amount', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'expense-transaction-id' },
        body: {
          amount: 200, // More than original
          description: 'Invalid refund'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockTransaction,
          type: 'expense',
          amount: '100.00'
        }]
      });

      await transactionController.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
