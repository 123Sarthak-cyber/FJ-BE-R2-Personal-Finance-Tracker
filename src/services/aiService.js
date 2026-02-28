const OpenAI = require('openai');
const db = require('../config/database');

// Initialize OpenAI client (only if API key is available)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * AI-powered financial insights service
 */
class AIService {
  /**
   * Check if AI service is available
   */
  static isAvailable() {
    return openai !== null;
  }

  /**
   * Analyze spending patterns and provide insights
   */
  static async getSpendingInsights(userId) {
    if (!this.isAvailable()) {
      return {
        success: true,
        insights: 'AI service is not configured. Please set OPENAI_API_KEY environment variable to enable AI insights.'
      };
    }

    try {
      // Get user's transaction data
      const transactions = await db.query(`
        SELECT t.*, c.name as category_name, c.type
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.date >= NOW() - INTERVAL '3 months'
        ORDER BY t.date DESC
      `, [userId]);

      if (transactions.rows.length === 0) {
        return {
          success: true,
          insights: "Not enough transaction data to generate insights. Add more transactions to get personalized recommendations."
        };
      }

      // Prepare data summary for AI
      const summary = this.prepareDataSummary(transactions.rows);

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a helpful personal finance advisor. Analyze the user's spending data and provide actionable insights. Be concise, specific, and encouraging. Format your response with clear sections: 1) Overview, 2) Top Spending Areas, 3) Savings Opportunities, 4) Recommendations.`
          },
          {
            role: "user",
            content: `Analyze my spending for the last 3 months:\n${summary}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      return {
        success: true,
        insights: completion.choices[0].message.content
      };
    } catch (error) {
      console.error('AI Insights error:', error);
      return {
        success: false,
        message: 'Unable to generate insights. Please check your OpenAI API key.'
      };
    }
  }

  /**
   * Categorize a transaction using AI
   */
  static async categorizeTransaction(description, amount, userId) {
    if (!this.isAvailable()) {
      return {
        success: false,
        message: 'AI service not configured'
      };
    }

    try {
      // Get user's existing categories
      const categories = await db.query(
        'SELECT id, name, type FROM categories WHERE user_id = $1',
        [userId]
      );

      const categoryList = categories.rows.map(c => `${c.name} (${c.type})`).join(', ');

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a financial transaction categorizer. Given a transaction description and amount, suggest the most appropriate category from the user's existing categories. Respond with ONLY the category name, nothing else.`
          },
          {
            role: "user",
            content: `Transaction: "${description}" for $${amount}\nAvailable categories: ${categoryList}\n\nWhich category best fits this transaction?`
          }
        ],
        max_tokens: 50,
        temperature: 0.3
      });

      const suggestedCategory = completion.choices[0].message.content.trim();
      
      // Find matching category
      const matchedCategory = categories.rows.find(
        c => c.name.toLowerCase() === suggestedCategory.toLowerCase()
      );

      return {
        success: true,
        suggestedCategory: suggestedCategory,
        categoryId: matchedCategory?.id || null,
        categoryType: matchedCategory?.type || null
      };
    } catch (error) {
      console.error('AI Categorization error:', error);
      return {
        success: false,
        message: 'Unable to categorize transaction'
      };
    }
  }

  /**
   * Generate a financial summary/report using AI
   */
  static async generateFinancialReport(userId, period = 'monthly') {
    if (!this.isAvailable()) {
      return {
        success: true,
        report: 'AI service is not configured. Please set OPENAI_API_KEY to enable AI reports.'
      };
    }

    try {
      let dateFilter;
      switch (period) {
        case 'weekly':
          dateFilter = "NOW() - INTERVAL '1 week'";
          break;
        case 'yearly':
          dateFilter = "NOW() - INTERVAL '1 year'";
          break;
        default:
          dateFilter = "NOW() - INTERVAL '1 month'";
      }

      const result = await db.query(`
        SELECT 
          c.type,
          c.name as category_name,
          SUM(t.amount) as total,
          COUNT(*) as transaction_count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.date >= ${dateFilter}
        GROUP BY c.type, c.name
        ORDER BY total DESC
      `, [userId]);

      if (result.rows.length === 0) {
        return {
          success: true,
          report: `No transactions found for the ${period} period.`
        };
      }

      const dataStr = result.rows.map(r => 
        `${r.category_name} (${r.type}): $${r.total} (${r.transaction_count} transactions)`
      ).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a financial analyst. Create a brief, professional financial summary report. Include key metrics, notable patterns, and a brief recommendation. Keep it under 250 words.`
          },
          {
            role: "user",
            content: `Generate a ${period} financial report based on this data:\n${dataStr}`
          }
        ],
        max_tokens: 400,
        temperature: 0.5
      });

      return {
        success: true,
        report: completion.choices[0].message.content,
        data: result.rows
      };
    } catch (error) {
      console.error('AI Report error:', error);
      return {
        success: false,
        message: 'Unable to generate report'
      };
    }
  }

  /**
   * AI-powered budget recommendations
   */
  static async getBudgetRecommendations(userId) {
    if (!this.isAvailable()) {
      return {
        success: true,
        recommendations: 'AI service is not configured. Please set OPENAI_API_KEY to enable budget recommendations.'
      };
    }

    try {
      // Get spending history
      const spending = await db.query(`
        SELECT 
          c.name as category_name,
          c.type,
          AVG(monthly_total) as avg_monthly,
          MAX(monthly_total) as max_monthly,
          MIN(monthly_total) as min_monthly
        FROM (
          SELECT 
            category_id,
            DATE_TRUNC('month', date) as month,
            SUM(amount) as monthly_total
          FROM transactions
          WHERE user_id = $1
          AND date >= NOW() - INTERVAL '6 months'
          GROUP BY category_id, DATE_TRUNC('month', date)
        ) monthly
        JOIN categories c ON monthly.category_id = c.id
        WHERE c.type = 'expense'
        GROUP BY c.name, c.type
      `, [userId]);

      // Get current budgets
      const budgets = await db.query(`
        SELECT b.*, c.name as category_name
        FROM budgets b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = $1 AND b.is_active = true
      `, [userId]);

      const spendingStr = spending.rows.map(s => 
        `${s.category_name}: Avg $${parseFloat(s.avg_monthly).toFixed(2)}/month, Range $${parseFloat(s.min_monthly).toFixed(2)}-$${parseFloat(s.max_monthly).toFixed(2)}`
      ).join('\n');

      const budgetStr = budgets.rows.map(b => 
        `${b.category_name}: $${b.amount} budget`
      ).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a budget planning expert. Based on spending history and current budgets, provide specific budget recommendations. Be practical and suggest specific dollar amounts where appropriate.`
          },
          {
            role: "user",
            content: `My spending history (last 6 months):\n${spendingStr || 'No spending data'}\n\nCurrent budgets:\n${budgetStr || 'No budgets set'}\n\nWhat budget adjustments do you recommend?`
          }
        ],
        max_tokens: 400,
        temperature: 0.6
      });

      return {
        success: true,
        recommendations: completion.choices[0].message.content,
        spendingHistory: spending.rows,
        currentBudgets: budgets.rows
      };
    } catch (error) {
      console.error('AI Budget recommendations error:', error);
      return {
        success: false,
        message: 'Unable to generate budget recommendations'
      };
    }
  }

  /**
   * Chat with AI about finances
   */
  static async chat(userId, message, conversationHistory = []) {
    if (!this.isAvailable()) {
      return {
        success: true,
        response: 'AI chat is not configured. Please set OPENAI_API_KEY environment variable to enable AI chat.',
        conversationHistory: []
      };
    }

    try {
      // Get user's financial context
      const summary = await db.query(`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND type = 'income' AND date >= DATE_TRUNC('month', NOW())) as monthly_income,
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND type = 'expense' AND date >= DATE_TRUNC('month', NOW())) as monthly_expenses,
          (SELECT COUNT(*) FROM transactions WHERE user_id = $1) as total_transactions
      `, [userId]);

      const context = summary.rows[0];

      const messages = [
        {
          role: "system",
          content: `You are a friendly personal finance assistant. The user's current month stats: Income: $${context.monthly_income}, Expenses: $${context.monthly_expenses}, Balance: $${context.monthly_income - context.monthly_expenses}. They have ${context.total_transactions} total transactions recorded. Help them with financial questions, budgeting advice, and general money management. Be concise and helpful.`
        },
        ...conversationHistory,
        {
          role: "user",
          content: message
        }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 300,
        temperature: 0.7
      });

      return {
        success: true,
        response: completion.choices[0].message.content,
        conversationHistory: [
          ...conversationHistory,
          { role: "user", content: message },
          { role: "assistant", content: completion.choices[0].message.content }
        ]
      };
    } catch (error) {
      console.error('AI Chat error:', error);
      return {
        success: false,
        message: 'Unable to process your message. Please check your OpenAI API key.'
      };
    }
  }

  /**
   * Prepare data summary for AI analysis
   */
  static prepareDataSummary(transactions) {
    const income = transactions.filter(t => t.type === 'income');
    const expenses = transactions.filter(t => t.type === 'expense');

    const totalIncome = income.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);

    // Group expenses by category
    const expensesByCategory = {};
    expenses.forEach(t => {
      const cat = t.category_name || 'Uncategorized';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(t.amount);
    });

    const categoryBreakdown = Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `${cat}: $${amount.toFixed(2)}`)
      .join('\n');

    return `
Total Income: $${totalIncome.toFixed(2)}
Total Expenses: $${totalExpenses.toFixed(2)}
Net Savings: $${(totalIncome - totalExpenses).toFixed(2)}
Savings Rate: ${totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0}%

Expense Breakdown by Category:
${categoryBreakdown}

Number of Transactions: ${transactions.length}
    `.trim();
  }
}

module.exports = AIService;
