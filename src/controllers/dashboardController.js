const { query } = require('../config/database');
const { convertCurrency } = require('../services/currencyService');

// Get dashboard overview
const getDashboard = async (req, res) => {
  try {
    const { currency } = req.query;
    const targetCurrency = (currency || req.user.preferred_currency || 'USD').toUpperCase();

    // Get current month date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    // Get previous month for comparison
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevMonthStartStr = prevMonthStart.toISOString().split('T')[0];
    const prevMonthEndStr = prevMonthEnd.toISOString().split('T')[0];

    // Get current month summary
    const currentMonthResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as refunds
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, monthStartStr, monthEndStr]
    );

    // Get previous month summary for comparison
    const prevMonthResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, prevMonthStartStr, prevMonthEndStr]
    );

    const currentIncome = parseFloat(currentMonthResult.rows[0].income);
    const currentExpenses = parseFloat(currentMonthResult.rows[0].expenses);
    const currentRefunds = parseFloat(currentMonthResult.rows[0].refunds);
    const currentSavings = currentIncome - currentExpenses + currentRefunds;

    const prevIncome = parseFloat(prevMonthResult.rows[0].income);
    const prevExpenses = parseFloat(prevMonthResult.rows[0].expenses);
    const prevSavings = prevIncome - prevExpenses;

    // Calculate percentage changes
    const incomeChange = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : 0;
    const expenseChange = prevExpenses > 0 ? ((currentExpenses - prevExpenses) / prevExpenses) * 100 : 0;
    const savingsChange = prevSavings !== 0 ? ((currentSavings - prevSavings) / Math.abs(prevSavings)) * 100 : 0;

    // Get expense breakdown by category
    const categoryBreakdownResult = await query(
      `SELECT c.id, c.name, c.color, c.icon,
        COALESCE(SUM(CASE WHEN t.is_refund = false THEN t.amount ELSE -t.amount END), 0) as amount
       FROM categories c
       LEFT JOIN transactions t ON c.id = t.category_id 
         AND t.date >= $2 AND t.date <= $3
       WHERE c.user_id = $1 AND c.type = 'expense'
       GROUP BY c.id, c.name, c.color, c.icon
       HAVING COALESCE(SUM(CASE WHEN t.is_refund = false THEN t.amount ELSE -t.amount END), 0) > 0
       ORDER BY amount DESC
       LIMIT 6`,
      [req.user.id, monthStartStr, monthEndStr]
    );

    const expenseByCategory = categoryBreakdownResult.rows.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      amount: parseFloat(c.amount),
      percentage: currentExpenses > 0 ? Math.round((parseFloat(c.amount) / currentExpenses) * 100) : 0
    }));

    // Get income breakdown by category
    const incomeBreakdownResult = await query(
      `SELECT c.id, c.name, c.color, c.icon,
        COALESCE(SUM(t.amount), 0) as amount
       FROM categories c
       LEFT JOIN transactions t ON c.id = t.category_id 
         AND t.date >= $2 AND t.date <= $3 AND t.is_refund = false
       WHERE c.user_id = $1 AND c.type = 'income'
       GROUP BY c.id, c.name, c.color, c.icon
       HAVING COALESCE(SUM(t.amount), 0) > 0
       ORDER BY amount DESC`,
      [req.user.id, monthStartStr, monthEndStr]
    );

    const incomeByCategory = incomeBreakdownResult.rows.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      amount: parseFloat(c.amount),
      percentage: currentIncome > 0 ? Math.round((parseFloat(c.amount) / currentIncome) * 100) : 0
    }));

    // Get recent transactions
    const recentTransactionsResult = await query(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT 5`,
      [req.user.id]
    );

    const recentTransactions = recentTransactionsResult.rows.map(t => ({
      id: t.id,
      amount: parseFloat(t.amount),
      type: t.type,
      description: t.description,
      date: t.date,
      isRefund: t.is_refund,
      category: t.category_id ? {
        name: t.category_name,
        color: t.category_color
      } : null
    }));

    // Get budget alerts (budgets over threshold)
    const budgetAlertsResult = await query(
      `SELECT b.*, c.name as category_name, c.color as category_color
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = $1 AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)`,
      [req.user.id]
    );

    const budgetAlerts = [];
    for (const b of budgetAlertsResult.rows) {
      const { calculateSpent } = require('./budgetController');
      const spentResult = await calculateSpent(b);
      const spentAmount = parseFloat(spentResult.spent);
      const budgetAmount = parseFloat(b.amount);
      const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

      if (percentage >= b.alert_threshold) {
        budgetAlerts.push({
          categoryName: b.category_name,
          categoryColor: b.category_color,
          budgetAmount,
          spentAmount,
          percentage: Math.round(percentage),
          isOverBudget: percentage >= 100
        });
      }
    }

    // Get monthly trend (last 6 months)
    const trendResult = await query(
      `SELECT 
        DATE_TRUNC('month', date) as month,
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses
       FROM transactions
       WHERE user_id = $1 AND date >= $2
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY month ASC`,
      [req.user.id, new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0]]
    );

    const monthlyTrend = trendResult.rows.map(t => ({
      month: t.month,
      income: parseFloat(t.income),
      expenses: parseFloat(t.expenses),
      savings: parseFloat(t.income) - parseFloat(t.expenses)
    }));

    res.json({
      success: true,
      data: {
        currency: targetCurrency,
        period: {
          start: monthStartStr,
          end: monthEndStr,
          label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        },
        summary: {
          income: currentIncome,
          expenses: currentExpenses,
          refunds: currentRefunds,
          netExpenses: currentExpenses - currentRefunds,
          savings: currentSavings,
          savingsRate: currentIncome > 0 ? Math.round((currentSavings / currentIncome) * 100) : 0
        },
        comparison: {
          incomeChange: Math.round(incomeChange * 10) / 10,
          expenseChange: Math.round(expenseChange * 10) / 10,
          savingsChange: Math.round(savingsChange * 10) / 10
        },
        expenseByCategory,
        incomeByCategory,
        recentTransactions,
        budgetAlerts,
        monthlyTrend
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data'
    });
  }
};

// Get account balance (all-time summary)
const getAccountBalance = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as total_refunds,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1`,
      [req.user.id]
    );

    const data = result.rows[0];
    const totalIncome = parseFloat(data.total_income);
    const totalExpenses = parseFloat(data.total_expenses);
    const totalRefunds = parseFloat(data.total_refunds);
    const balance = totalIncome - totalExpenses + totalRefunds;

    res.json({
      success: true,
      data: {
        balance,
        totalIncome,
        totalExpenses,
        totalRefunds,
        netExpenses: totalExpenses - totalRefunds,
        transactionCount: parseInt(data.transaction_count)
      }
    });
  } catch (error) {
    console.error('Get account balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching account balance'
    });
  }
};

// Get daily spending for current month (for chart)
const getDailySpending = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);

    const result = await query(
      `SELECT 
        date,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses,
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as income
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       GROUP BY date
       ORDER BY date ASC`,
      [req.user.id, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    // Fill in missing dates with zero values
    const dailyData = [];
    let runningTotal = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const existing = result.rows.find(r => r.date.toISOString().split('T')[0] === dateStr);
      
      const expenses = existing ? parseFloat(existing.expenses) : 0;
      const income = existing ? parseFloat(existing.income) : 0;
      runningTotal += income - expenses;

      dailyData.push({
        date: dateStr,
        expenses,
        income,
        net: income - expenses,
        runningTotal
      });
    }

    res.json({
      success: true,
      data: {
        month: targetMonth + 1,
        year: targetYear,
        dailyData
      }
    });
  } catch (error) {
    console.error('Get daily spending error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily spending data'
    });
  }
};

module.exports = {
  getDashboard,
  getAccountBalance,
  getDailySpending
};
