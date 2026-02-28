const db = require('../../src/config/database');
const { mockRequest, mockResponse, mockBudget, mockCategory } = require('../helpers');

const budgetController = require('../../src/controllers/budgetController');

describe('Budget Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBudget', () => {
    it('should create a new budget', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'test-category-id',
          amount: 1000,
          period: 'monthly',
          alertThreshold: 80
        }
      });
      const res = mockResponse();

      // Mock category exists
      db.query.mockResolvedValueOnce({ rows: [mockCategory] });
      // Mock no existing budget
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock insert budget
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockBudget,
          id: 'new-budget-id'
        }]
      });

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          budget: expect.any(Object)
        })
      );
    });

    it('should return 400 if budget already exists for category', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'test-category-id',
          amount: 1000,
          period: 'monthly'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [mockCategory] });
      db.query.mockResolvedValueOnce({ rows: [mockBudget] }); // Existing budget

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if category not found', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        body: {
          categoryId: 'nonexistent-category',
          amount: 1000,
          period: 'monthly'
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] }); // No category

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getBudgets', () => {
    it('should return all active budgets with spending info', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({
        rows: [
          {
            ...mockBudget,
            category_name: 'Food',
            category_type: 'expense',
            spent: '750.00'
          }
        ]
      });

      await budgetController.getBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          budgets: expect.any(Array)
        })
      );
    });

    it('should return empty array if no budgets', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] });

      await budgetController.getBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          budgets: []
        })
      );
    });
  });

  describe('updateBudget', () => {
    it('should update a budget', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'test-budget-id' },
        body: {
          amount: 1500,
          alertThreshold: 90
        }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [mockBudget] }); // Existing
      db.query.mockResolvedValueOnce({
        rows: [{
          ...mockBudget,
          amount: '1500.00',
          alert_threshold: 90
        }]
      });

      await budgetController.updateBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 if budget not found', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'nonexistent-id' },
        body: { amount: 1500 }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [] });

      await budgetController.updateBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteBudget', () => {
    it('should delete a budget', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' },
        params: { id: 'test-budget-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({ rows: [mockBudget] });
      db.query.mockResolvedValueOnce({ rows: [mockBudget] });

      await budgetController.deleteBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('deleted')
        })
      );
    });
  });

  describe('checkBudgetAlerts', () => {
    it('should return budgets exceeding alert threshold', async () => {
      const req = mockRequest({
        user: { userId: 'test-user-id' }
      });
      const res = mockResponse();

      db.query.mockResolvedValueOnce({
        rows: [
          {
            ...mockBudget,
            category_name: 'Food',
            spent: '850.00',
            percentage_used: 85
          }
        ]
      });

      await budgetController.checkBudgetAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          alerts: expect.any(Array)
        })
      );
    });
  });
});
