const { query } = require('../config/database');
const Decimal = require('decimal.js');

// Get all budgets for user
const getBudgets = async (req, res) => {
  try {
    const { period, active } = req.query;

    let sql = `
      SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon, c.type as category_type
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (period && ['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
      paramCount++;
      sql += ` AND b.period = $${paramCount}`;
      params.push(period);
    }

    if (active === 'true') {
      sql += ' AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)';
    }

    sql += ' ORDER BY c.name ASC';

    const result = await query(sql, params);

    // Calculate spent amount for each budget
    const budgets = await Promise.all(result.rows.map(async (b) => {
      const spentResult = await calculateSpent(b);
      const spentAmount = parseFloat(spentResult.spent);
      const budgetAmount = parseFloat(b.amount);
      const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

      return {
        id: b.id,
        amount: budgetAmount,
        currency: b.currency,
        period: b.period,
        startDate: b.start_date,
        endDate: b.end_date,
        alertThreshold: b.alert_threshold,
        alertSent: b.alert_sent,
        category: {
          id: b.category_id,
          name: b.category_name,
          color: b.category_color,
          icon: b.category_icon,
          type: b.category_type
        },
        spent: spentAmount,
        remaining: Math.max(0, budgetAmount - spentAmount),
        percentage: Math.round(percentage * 100) / 100,
        isOverBudget: spentAmount > budgetAmount,
        createdAt: b.created_at,
        updatedAt: b.updated_at
      };
    }));

    res.json({
      success: true,
      data: budgets
    });
  } catch (error) {
    console.error('Get budgets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching budgets'
    });
  }
};

// Get single budget
const getBudget = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon, c.type as category_type
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    const b = result.rows[0];
    const spentResult = await calculateSpent(b);
    const spentAmount = parseFloat(spentResult.spent);
    const budgetAmount = parseFloat(b.amount);
    const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

    res.json({
      success: true,
      data: {
        id: b.id,
        amount: budgetAmount,
        currency: b.currency,
        period: b.period,
        startDate: b.start_date,
        endDate: b.end_date,
        alertThreshold: b.alert_threshold,
        alertSent: b.alert_sent,
        category: {
          id: b.category_id,
          name: b.category_name,
          color: b.category_color,
          icon: b.category_icon,
          type: b.category_type
        },
        spent: spentAmount,
        remaining: Math.max(0, budgetAmount - spentAmount),
        percentage: Math.round(percentage * 100) / 100,
        isOverBudget: spentAmount > budgetAmount,
        recentTransactions: spentResult.transactions,
        createdAt: b.created_at,
        updatedAt: b.updated_at
      }
    });
  } catch (error) {
    console.error('Get budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching budget'
    });
  }
};

// Create new budget
const createBudget = async (req, res) => {
  try {
    const { categoryId, amount, period, startDate, endDate, alertThreshold, currency } = req.body;

    // Validate category exists and is expense type
    const categoryResult = await query(
      'SELECT type FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, req.user.id]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Category not found'
      });
    }

    if (categoryResult.rows[0].type !== 'expense') {
      return res.status(400).json({
        success: false,
        message: 'Budgets can only be set for expense categories'
      });
    }

    // Use Decimal for precise amount handling
    const decimalAmount = new Decimal(amount);
    if (decimalAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json({
        success: false,
        message: 'Budget amount must be positive'
      });
    }

    // Check for existing budget with same category and period
    const existingResult = await query(
      'SELECT id FROM budgets WHERE user_id = $1 AND category_id = $2 AND period = $3 AND start_date = $4',
      [req.user.id, categoryId, period, startDate || new Date().toISOString().split('T')[0]]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A budget already exists for this category and period'
      });
    }

    const result = await query(
      `INSERT INTO budgets (user_id, category_id, amount, currency, period, start_date, end_date, alert_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        categoryId,
        decimalAmount.toFixed(2),
        (currency || req.user.preferred_currency || 'USD').toUpperCase(),
        period,
        startDate || new Date().toISOString().split('T')[0],
        endDate || null,
        alertThreshold || 80
      ]
    );

    // Get category details
    const catResult = await query('SELECT name, color, icon FROM categories WHERE id = $1', [categoryId]);

    const b = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Budget created successfully',
      data: {
        id: b.id,
        amount: parseFloat(b.amount),
        currency: b.currency,
        period: b.period,
        startDate: b.start_date,
        endDate: b.end_date,
        alertThreshold: b.alert_threshold,
        category: {
          id: categoryId,
          name: catResult.rows[0].name,
          color: catResult.rows[0].color,
          icon: catResult.rows[0].icon
        },
        createdAt: b.created_at
      }
    });
  } catch (error) {
    console.error('Create budget error:', error);
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Budget already exists for this category and period'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating budget'
    });
  }
};

// Update budget
const updateBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, endDate, alertThreshold, currency } = req.body;

    // Check if budget exists
    const existingResult = await query(
      'SELECT * FROM budgets WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (amount !== undefined) {
      const decimalAmount = new Decimal(amount);
      if (decimalAmount.lessThanOrEqualTo(0)) {
        return res.status(400).json({
          success: false,
          message: 'Budget amount must be positive'
        });
      }
      paramCount++;
      updates.push(`amount = $${paramCount}`);
      values.push(decimalAmount.toFixed(2));
      
      // Reset alert sent flag when amount changes
      paramCount++;
      updates.push(`alert_sent = $${paramCount}`);
      values.push(false);
    }

    if (endDate !== undefined) {
      paramCount++;
      updates.push(`end_date = $${paramCount}`);
      values.push(endDate || null);
    }

    if (alertThreshold !== undefined) {
      paramCount++;
      updates.push(`alert_threshold = $${paramCount}`);
      values.push(alertThreshold);
      
      // Reset alert sent flag when threshold changes
      if (amount === undefined) {
        paramCount++;
        updates.push(`alert_sent = $${paramCount}`);
        values.push(false);
      }
    }

    if (currency !== undefined) {
      paramCount++;
      updates.push(`currency = $${paramCount}`);
      values.push(currency.toUpperCase());
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(req.user.id);

    const result = await query(
      `UPDATE budgets SET ${updates.join(', ')}
       WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );

    const b = result.rows[0];

    // Get category details
    const catResult = await query('SELECT name, color, icon FROM categories WHERE id = $1', [b.category_id]);

    res.json({
      success: true,
      message: 'Budget updated successfully',
      data: {
        id: b.id,
        amount: parseFloat(b.amount),
        currency: b.currency,
        period: b.period,
        startDate: b.start_date,
        endDate: b.end_date,
        alertThreshold: b.alert_threshold,
        category: {
          id: b.category_id,
          name: catResult.rows[0].name,
          color: catResult.rows[0].color,
          icon: catResult.rows[0].icon
        },
        updatedAt: b.updated_at
      }
    });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating budget'
    });
  }
};

// Delete budget
const deleteBudget = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    res.json({
      success: true,
      message: 'Budget deleted successfully'
    });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting budget'
    });
  }
};

// Get budget progress / overview
const getBudgetProgress = async (req, res) => {
  try {
    // Get all active budgets
    const result = await query(
      `SELECT b.*, c.name as category_name, c.color as category_color
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = $1 AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
       ORDER BY c.name ASC`,
      [req.user.id]
    );

    let totalBudget = 0;
    let totalSpent = 0;
    const budgetProgress = [];

    for (const b of result.rows) {
      const spentResult = await calculateSpent(b);
      const spentAmount = parseFloat(spentResult.spent);
      const budgetAmount = parseFloat(b.amount);
      
      totalBudget += budgetAmount;
      totalSpent += spentAmount;

      const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

      budgetProgress.push({
        categoryName: b.category_name,
        categoryColor: b.category_color,
        period: b.period,
        budgetAmount,
        spentAmount,
        remaining: Math.max(0, budgetAmount - spentAmount),
        percentage: Math.round(percentage),
        status: percentage >= 100 ? 'exceeded' : percentage >= b.alert_threshold ? 'warning' : 'good'
      });
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalBudget,
          totalSpent,
          totalRemaining: Math.max(0, totalBudget - totalSpent),
          overallPercentage: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
        },
        budgets: budgetProgress
      }
    });
  } catch (error) {
    console.error('Get budget progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching budget progress'
    });
  }
};

// Helper function to calculate spent amount for a budget period
async function calculateSpent(budget) {
  const { category_id, period, start_date, user_id } = budget;
  
  // Calculate date range based on period
  let startDate = new Date(start_date);
  let endDate = new Date();

  switch (period) {
    case 'daily':
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      const dayOfWeek = startDate.getDay();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'yearly':
      startDate = new Date();
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
  }

  const result = await query(
    `SELECT 
      COALESCE(SUM(CASE WHEN is_refund = false THEN amount ELSE -amount END), 0) as spent
     FROM transactions
     WHERE user_id = $1 AND category_id = $2 AND date >= $3 AND date <= $4`,
    [user_id, category_id, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
  );

  // Get recent transactions for detail view
  const transactionsResult = await query(
    `SELECT id, amount, description, date, is_refund
     FROM transactions
     WHERE user_id = $1 AND category_id = $2 AND date >= $3 AND date <= $4
     ORDER BY date DESC
     LIMIT 5`,
    [user_id, category_id, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
  );

  return {
    spent: result.rows[0].spent,
    transactions: transactionsResult.rows.map(t => ({
      id: t.id,
      amount: parseFloat(t.amount),
      description: t.description,
      date: t.date,
      isRefund: t.is_refund
    }))
  };
}

module.exports = {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetProgress,
  calculateSpent
};
