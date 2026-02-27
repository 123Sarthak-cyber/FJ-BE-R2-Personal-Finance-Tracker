const { query } = require('../config/database');
const { convertAmount } = require('../services/currencyService');

// Generate monthly income vs expenses report
const getMonthlyReport = async (req, res) => {
  try {
    const { year, month, currency } = req.query;
    const targetCurrency = (currency || req.user.preferred_currency || 'USD').toUpperCase();
    
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get summary
    const summaryResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' AND is_refund = false THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as total_refunds,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, startDateStr, endDateStr]
    );

    const summary = summaryResult.rows[0];
    const totalIncome = parseFloat(summary.total_income);
    const totalExpenses = parseFloat(summary.total_expenses);
    const totalRefunds = parseFloat(summary.total_refunds);
    const netSavings = totalIncome - totalExpenses + totalRefunds;

    // Get income by category
    const incomeByCategoryResult = await query(
      `SELECT c.name, c.color, c.icon,
        COALESCE(SUM(t.amount), 0) as amount,
        COUNT(t.id) as transaction_count
       FROM categories c
       LEFT JOIN transactions t ON c.id = t.category_id 
         AND t.date >= $2 AND t.date <= $3 AND t.type = 'income' AND t.is_refund = false
       WHERE c.user_id = $1 AND c.type = 'income'
       GROUP BY c.id, c.name, c.color, c.icon
       ORDER BY amount DESC`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Get expenses by category
    const expenseByCategoryResult = await query(
      `SELECT c.name, c.color, c.icon,
        COALESCE(SUM(CASE WHEN t.is_refund = false THEN t.amount ELSE 0 END), 0) as amount,
        COALESCE(SUM(CASE WHEN t.is_refund = true THEN t.amount ELSE 0 END), 0) as refunds,
        COUNT(t.id) as transaction_count
       FROM categories c
       LEFT JOIN transactions t ON c.id = t.category_id 
         AND t.date >= $2 AND t.date <= $3 AND t.type = 'expense'
       WHERE c.user_id = $1 AND c.type = 'expense'
       GROUP BY c.id, c.name, c.color, c.icon
       ORDER BY amount DESC`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Get daily breakdown
    const dailyBreakdownResult = await query(
      `SELECT 
        date,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END) as refunds
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       GROUP BY date
       ORDER BY date ASC`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Get previous month for comparison
    const prevStartDate = new Date(targetYear, targetMonth - 1, 1);
    const prevEndDate = new Date(targetYear, targetMonth, 0);
    
    const prevMonthResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, prevStartDate.toISOString().split('T')[0], prevEndDate.toISOString().split('T')[0]]
    );

    const prevIncome = parseFloat(prevMonthResult.rows[0].income);
    const prevExpenses = parseFloat(prevMonthResult.rows[0].expenses);

    res.json({
      success: true,
      data: {
        reportType: 'monthly',
        currency: targetCurrency,
        period: {
          year: targetYear,
          month: targetMonth + 1,
          startDate: startDateStr,
          endDate: endDateStr,
          label: startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        },
        summary: {
          totalIncome,
          totalExpenses,
          totalRefunds,
          netExpenses: totalExpenses - totalRefunds,
          netSavings,
          savingsRate: totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0,
          transactionCount: parseInt(summary.transaction_count)
        },
        comparison: {
          previousMonth: {
            income: prevIncome,
            expenses: prevExpenses,
            savings: prevIncome - prevExpenses
          },
          incomeChange: prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100) : 0,
          expenseChange: prevExpenses > 0 ? Math.round(((totalExpenses - prevExpenses) / prevExpenses) * 100) : 0
        },
        incomeByCategory: incomeByCategoryResult.rows.map(c => ({
          name: c.name,
          color: c.color,
          icon: c.icon,
          amount: parseFloat(c.amount),
          percentage: totalIncome > 0 ? Math.round((parseFloat(c.amount) / totalIncome) * 100) : 0,
          transactionCount: parseInt(c.transaction_count)
        })),
        expenseByCategory: expenseByCategoryResult.rows.map(c => ({
          name: c.name,
          color: c.color,
          icon: c.icon,
          amount: parseFloat(c.amount),
          refunds: parseFloat(c.refunds),
          netAmount: parseFloat(c.amount) - parseFloat(c.refunds),
          percentage: totalExpenses > 0 ? Math.round((parseFloat(c.amount) / totalExpenses) * 100) : 0,
          transactionCount: parseInt(c.transaction_count)
        })),
        dailyBreakdown: dailyBreakdownResult.rows.map(d => ({
          date: d.date,
          income: parseFloat(d.income),
          expenses: parseFloat(d.expenses),
          refunds: parseFloat(d.refunds),
          net: parseFloat(d.income) - parseFloat(d.expenses) + parseFloat(d.refunds)
        }))
      }
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly report'
    });
  }
};

// Generate yearly report
const getYearlyReport = async (req, res) => {
  try {
    const { year, currency } = req.query;
    const targetCurrency = (currency || req.user.preferred_currency || 'USD').toUpperCase();
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get yearly summary
    const summaryResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as total_refunds,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, startDateStr, endDateStr]
    );

    const summary = summaryResult.rows[0];
    const totalIncome = parseFloat(summary.total_income);
    const totalExpenses = parseFloat(summary.total_expenses);
    const totalRefunds = parseFloat(summary.total_refunds);

    // Get monthly breakdown
    const monthlyBreakdownResult = await query(
      `SELECT 
        EXTRACT(MONTH FROM date) as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as refunds
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       GROUP BY EXTRACT(MONTH FROM date)
       ORDER BY month ASC`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Fill in all months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = monthNames.map((name, index) => {
      const existing = monthlyBreakdownResult.rows.find(r => parseInt(r.month) === index + 1);
      return {
        month: index + 1,
        monthName: name,
        income: existing ? parseFloat(existing.income) : 0,
        expenses: existing ? parseFloat(existing.expenses) : 0,
        refunds: existing ? parseFloat(existing.refunds) : 0,
        savings: existing ? parseFloat(existing.income) - parseFloat(existing.expenses) + parseFloat(existing.refunds) : 0
      };
    });

    // Get top expense categories
    const topExpensesResult = await query(
      `SELECT c.name, c.color,
        COALESCE(SUM(t.amount), 0) as amount
       FROM categories c
       JOIN transactions t ON c.id = t.category_id
       WHERE c.user_id = $1 AND t.date >= $2 AND t.date <= $3 
         AND t.type = 'expense' AND t.is_refund = false
       GROUP BY c.id, c.name, c.color
       ORDER BY amount DESC
       LIMIT 5`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Get top income categories
    const topIncomeResult = await query(
      `SELECT c.name, c.color,
        COALESCE(SUM(t.amount), 0) as amount
       FROM categories c
       JOIN transactions t ON c.id = t.category_id
       WHERE c.user_id = $1 AND t.date >= $2 AND t.date <= $3 
         AND t.type = 'income'
       GROUP BY c.id, c.name, c.color
       ORDER BY amount DESC
       LIMIT 5`,
      [req.user.id, startDateStr, endDateStr]
    );

    // Calculate averages
    const currentMonth = new Date().getMonth() + 1;
    const monthsElapsed = targetYear === new Date().getFullYear() ? currentMonth : 12;

    res.json({
      success: true,
      data: {
        reportType: 'yearly',
        currency: targetCurrency,
        period: {
          year: targetYear,
          startDate: startDateStr,
          endDate: endDateStr
        },
        summary: {
          totalIncome,
          totalExpenses,
          totalRefunds,
          netExpenses: totalExpenses - totalRefunds,
          netSavings: totalIncome - totalExpenses + totalRefunds,
          savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses + totalRefunds) / totalIncome) * 100) : 0,
          transactionCount: parseInt(summary.transaction_count)
        },
        averages: {
          monthlyIncome: Math.round(totalIncome / monthsElapsed),
          monthlyExpenses: Math.round(totalExpenses / monthsElapsed),
          monthlySavings: Math.round((totalIncome - totalExpenses + totalRefunds) / monthsElapsed)
        },
        monthlyBreakdown: monthlyData,
        topExpenseCategories: topExpensesResult.rows.map(c => ({
          name: c.name,
          color: c.color,
          amount: parseFloat(c.amount),
          percentage: totalExpenses > 0 ? Math.round((parseFloat(c.amount) / totalExpenses) * 100) : 0
        })),
        topIncomeCategories: topIncomeResult.rows.map(c => ({
          name: c.name,
          color: c.color,
          amount: parseFloat(c.amount),
          percentage: totalIncome > 0 ? Math.round((parseFloat(c.amount) / totalIncome) * 100) : 0
        }))
      }
    });
  } catch (error) {
    console.error('Get yearly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating yearly report'
    });
  }
};

// Generate custom date range report
const getCustomReport = async (req, res) => {
  try {
    const { startDate, endDate, currency, groupBy } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const targetCurrency = (currency || req.user.preferred_currency || 'USD').toUpperCase();

    // Get summary
    const summaryResult = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = true THEN amount ELSE 0 END), 0) as total_refunds,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [req.user.id, startDate, endDate]
    );

    const summary = summaryResult.rows[0];
    const totalIncome = parseFloat(summary.total_income);
    const totalExpenses = parseFloat(summary.total_expenses);
    const totalRefunds = parseFloat(summary.total_refunds);

    // Get breakdown by category
    const categoryBreakdownResult = await query(
      `SELECT c.name, c.color, c.type,
        COALESCE(SUM(CASE WHEN t.is_refund = false THEN t.amount ELSE 0 END), 0) as amount,
        COALESCE(SUM(CASE WHEN t.is_refund = true THEN t.amount ELSE 0 END), 0) as refunds,
        COUNT(t.id) as transaction_count
       FROM categories c
       LEFT JOIN transactions t ON c.id = t.category_id 
         AND t.date >= $2 AND t.date <= $3
       WHERE c.user_id = $1
       GROUP BY c.id, c.name, c.color, c.type
       ORDER BY c.type, amount DESC`,
      [req.user.id, startDate, endDate]
    );

    // Group by time period if requested
    let timeBreakdown = [];
    if (groupBy === 'day' || groupBy === 'week' || groupBy === 'month') {
      let dateGroup;
      switch (groupBy) {
        case 'day':
          dateGroup = 'date';
          break;
        case 'week':
          dateGroup = "DATE_TRUNC('week', date)";
          break;
        case 'month':
          dateGroup = "DATE_TRUNC('month', date)";
          break;
      }

      const timeResult = await query(
        `SELECT 
          ${dateGroup} as period,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'expense' AND is_refund = false THEN amount ELSE 0 END), 0) as expenses
         FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         GROUP BY ${dateGroup}
         ORDER BY period ASC`,
        [req.user.id, startDate, endDate]
      );

      timeBreakdown = timeResult.rows.map(t => ({
        period: t.period,
        income: parseFloat(t.income),
        expenses: parseFloat(t.expenses),
        net: parseFloat(t.income) - parseFloat(t.expenses)
      }));
    }

    // Get all transactions for the period
    const transactionsResult = await query(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
       ORDER BY t.date DESC, t.created_at DESC`,
      [req.user.id, startDate, endDate]
    );

    res.json({
      success: true,
      data: {
        reportType: 'custom',
        currency: targetCurrency,
        period: {
          startDate,
          endDate
        },
        summary: {
          totalIncome,
          totalExpenses,
          totalRefunds,
          netExpenses: totalExpenses - totalRefunds,
          netSavings: totalIncome - totalExpenses + totalRefunds,
          savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses + totalRefunds) / totalIncome) * 100) : 0,
          transactionCount: parseInt(summary.transaction_count)
        },
        categoryBreakdown: categoryBreakdownResult.rows.map(c => ({
          name: c.name,
          color: c.color,
          type: c.type,
          amount: parseFloat(c.amount),
          refunds: parseFloat(c.refunds),
          netAmount: parseFloat(c.amount) - parseFloat(c.refunds),
          transactionCount: parseInt(c.transaction_count)
        })),
        timeBreakdown,
        transactions: transactionsResult.rows.map(t => ({
          id: t.id,
          amount: parseFloat(t.amount),
          type: t.type,
          description: t.description,
          date: t.date,
          isRefund: t.is_refund,
          categoryName: t.category_name,
          categoryColor: t.category_color
        }))
      }
    });
  } catch (error) {
    console.error('Get custom report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating custom report'
    });
  }
};

// Export report as CSV
const exportReport = async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const result = await query(
      `SELECT t.date, t.type, t.amount, t.currency, t.description, t.is_refund,
              c.name as category
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
       ORDER BY t.date ASC`,
      [req.user.id, startDate, endDate]
    );

    if (format === 'csv') {
      // Generate CSV
      let csv = 'Date,Type,Category,Amount,Currency,Description,Is Refund\n';
      
      for (const row of result.rows) {
        const description = (row.description || '').replace(/"/g, '""');
        csv += `${row.date},${row.type},"${row.category || 'Uncategorized'}",${row.amount},${row.currency},"${description}",${row.is_refund}\n`;
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="finance_report_${startDate}_${endDate}.csv"`);
      return res.send(csv);
    }

    // Default to JSON
    res.json({
      success: true,
      data: result.rows.map(t => ({
        date: t.date,
        type: t.type,
        category: t.category || 'Uncategorized',
        amount: parseFloat(t.amount),
        currency: t.currency,
        description: t.description,
        isRefund: t.is_refund
      }))
    });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report'
    });
  }
};

module.exports = {
  getMonthlyReport,
  getYearlyReport,
  getCustomReport,
  exportReport
};
