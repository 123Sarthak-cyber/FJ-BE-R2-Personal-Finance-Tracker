const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const csv = require('csv-parser');
const { Readable } = require('stream');
const db = require('../config/database');
const AIService = require('./aiService');
const Decimal = require('decimal.js');

/**
 * Bank Statement Import Service
 * Handles PDF and CSV bank statement parsing with auto-categorization
 */
class BankStatementService {
  /**
   * Import transactions from a bank statement file
   */
  static async importStatement(userId, file, options = {}) {
    const { skipDuplicates = true, autoCategorize = true } = options;
    
    try {
      let transactions = [];
      const fileExtension = path.extname(file.originalname).toLowerCase();

      if (fileExtension === '.csv') {
        transactions = await this.parseCSV(file);
      } else if (fileExtension === '.pdf') {
        transactions = await this.parsePDF(file);
      } else {
        throw new Error('Unsupported file format. Please upload CSV or PDF.');
      }

      // Process and import transactions
      const result = await this.processTransactions(userId, transactions, {
        skipDuplicates,
        autoCategorize
      });

      return result;
    } catch (error) {
      console.error('Statement import error:', error);
      throw error;
    }
  }

  /**
   * Parse CSV bank statement
   */
  static async parseCSV(file) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      const stream = Readable.from(file.buffer.toString());

      stream
        .pipe(csv())
        .on('data', (row) => {
          const transaction = this.normalizeCSVRow(row);
          if (transaction) {
            transactions.push(transaction);
          }
        })
        .on('end', () => resolve(transactions))
        .on('error', reject);
    });
  }

  /**
   * Normalize CSV row to standard transaction format
   * Handles various bank CSV formats
   */
  static normalizeCSVRow(row) {
    // Common column name variations
    const dateFields = ['date', 'transaction_date', 'trans_date', 'posted_date', 'Date', 'Transaction Date'];
    const descFields = ['description', 'memo', 'details', 'transaction_description', 'Description', 'Memo', 'Details'];
    const amountFields = ['amount', 'transaction_amount', 'Amount', 'Transaction Amount'];
    const debitFields = ['debit', 'withdrawal', 'Debit', 'Withdrawal', 'debit_amount'];
    const creditFields = ['credit', 'deposit', 'Credit', 'Deposit', 'credit_amount'];

    // Find values from row
    const findValue = (fields) => {
      for (const field of fields) {
        if (row[field] !== undefined && row[field] !== '') {
          return row[field];
        }
      }
      return null;
    };

    const dateStr = findValue(dateFields);
    const description = findValue(descFields);
    let amount = findValue(amountFields);
    const debit = findValue(debitFields);
    const credit = findValue(creditFields);

    // Skip if essential data is missing
    if (!dateStr || (!amount && !debit && !credit)) {
      return null;
    }

    // Determine amount and type
    let type = 'expense';
    if (debit && credit) {
      // Separate debit/credit columns
      if (credit && parseFloat(credit.toString().replace(/[$,]/g, '')) > 0) {
        amount = credit;
        type = 'income';
      } else {
        amount = debit;
        type = 'expense';
      }
    } else if (amount) {
      // Single amount column (negative = expense)
      const numAmount = parseFloat(amount.toString().replace(/[$,]/g, ''));
      if (numAmount > 0) {
        type = 'income';
      } else {
        type = 'expense';
        amount = Math.abs(numAmount);
      }
    }

    // Clean and validate amount
    const cleanAmount = parseFloat(amount.toString().replace(/[$,]/g, ''));
    if (isNaN(cleanAmount) || cleanAmount === 0) {
      return null;
    }

    return {
      date: this.parseDate(dateStr),
      description: description || 'No description',
      amount: Math.abs(cleanAmount),
      type: type,
      rawData: row
    };
  }

  /**
   * Parse PDF bank statement
   */
  static async parsePDF(file) {
    const data = await pdfParse(file.buffer);
    const text = data.text;

    // Extract transactions from PDF text
    const transactions = this.extractTransactionsFromText(text);
    return transactions;
  }

  /**
   * Extract transactions from PDF text
   * Uses regex patterns to find transaction-like lines
   */
  static extractTransactionsFromText(text) {
    const transactions = [];
    const lines = text.split('\n');

    // Common date patterns
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,  // MM/DD/YYYY or MM/DD/YY
      /(\d{1,2}-\d{1,2}-\d{2,4})/,     // MM-DD-YYYY
      /(\d{4}-\d{2}-\d{2})/,           // YYYY-MM-DD
      /([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/ // Jan 15, 2024
    ];

    // Amount pattern (matches $1,234.56 or 1234.56 or -1234.56)
    const amountPattern = /[-]?\$?[\d,]+\.?\d{0,2}/g;

    for (const line of lines) {
      // Skip empty lines or headers
      if (!line.trim() || line.length < 10) continue;

      // Try to find a date in the line
      let dateMatch = null;
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          dateMatch = match[1];
          break;
        }
      }

      if (!dateMatch) continue;

      // Find amounts in the line
      const amounts = line.match(amountPattern);
      if (!amounts || amounts.length === 0) continue;

      // Get the last amount (usually the transaction amount)
      const amountStr = amounts[amounts.length - 1];
      const amount = parseFloat(amountStr.replace(/[$,]/g, ''));

      if (isNaN(amount) || amount === 0) continue;

      // Extract description (text between date and amount)
      const dateIndex = line.indexOf(dateMatch);
      const amountIndex = line.lastIndexOf(amountStr);
      let description = line.substring(dateIndex + dateMatch.length, amountIndex).trim();
      
      // Clean up description
      description = description.replace(/\s+/g, ' ').trim() || 'PDF Transaction';

      transactions.push({
        date: this.parseDate(dateMatch),
        description: description,
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        rawData: { line }
      });
    }

    return transactions;
  }

  /**
   * Parse various date formats
   */
  static parseDate(dateStr) {
    if (!dateStr) return new Date();

    // Try standard parsing first
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Handle MM/DD/YYYY
    const mmddyyyy = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (mmddyyyy) {
      let year = parseInt(mmddyyyy[3]);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(mmddyyyy[1]) - 1, parseInt(mmddyyyy[2]));
    }

    // Handle MM-DD-YYYY
    const mmddyyyy2 = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
    if (mmddyyyy2) {
      let year = parseInt(mmddyyyy2[3]);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(mmddyyyy2[1]) - 1, parseInt(mmddyyyy2[2]));
    }

    return new Date();
  }

  /**
   * Process and import transactions with duplicate detection
   */
  static async processTransactions(userId, transactions, options) {
    const { skipDuplicates, autoCategorize } = options;
    
    const results = {
      imported: 0,
      duplicates: 0,
      errors: 0,
      transactions: []
    };

    // Get user's categories for auto-categorization
    const categories = await db.query(
      'SELECT id, name, type FROM categories WHERE user_id = $1',
      [userId]
    );

    // Create a default category if none exist
    let defaultIncomeCategory = categories.rows.find(c => c.type === 'income');
    let defaultExpenseCategory = categories.rows.find(c => c.type === 'expense');

    if (!defaultIncomeCategory) {
      const result = await db.query(
        'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, 'Other Income', 'income', '#22c55e']
      );
      defaultIncomeCategory = result.rows[0];
    }

    if (!defaultExpenseCategory) {
      const result = await db.query(
        'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, 'Other Expenses', 'expense', '#ef4444']
      );
      defaultExpenseCategory = result.rows[0];
    }

    for (const transaction of transactions) {
      try {
        // Check for duplicates
        if (skipDuplicates) {
          const isDuplicate = await this.checkDuplicate(userId, transaction);
          if (isDuplicate) {
            results.duplicates++;
            continue;
          }
        }

        // Auto-categorize if enabled and OpenAI key exists
        let categoryId;
        if (autoCategorize && process.env.OPENAI_API_KEY) {
          const categorization = await AIService.categorizeTransaction(
            transaction.description,
            transaction.amount,
            userId
          );
          categoryId = categorization.categoryId;
        }

        // Use default category if not categorized
        if (!categoryId) {
          categoryId = transaction.type === 'income' 
            ? defaultIncomeCategory.id 
            : defaultExpenseCategory.id;
        }

        // Insert transaction
        const result = await db.query(`
          INSERT INTO transactions (
            user_id, category_id, type, amount, description,
            date, currency, import_source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          userId,
          categoryId,
          transaction.type,
          new Decimal(transaction.amount).toFixed(2),
          transaction.description.substring(0, 500),
          transaction.date,
          'USD',
          'bank_statement'
        ]);

        results.imported++;
        results.transactions.push(result.rows[0]);
      } catch (error) {
        console.error('Error importing transaction:', error);
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Check if a transaction is a duplicate
   */
  static async checkDuplicate(userId, transaction) {
    // Check for transactions with same date, amount, and similar description
    const result = await db.query(`
      SELECT id FROM transactions
      WHERE user_id = $1
      AND ABS(amount - $2) < 0.01
      AND DATE(date) = DATE($3)
      AND (
        description ILIKE $4
        OR SIMILARITY(description, $4) > 0.6
      )
      LIMIT 1
    `, [
      userId,
      transaction.amount,
      transaction.date,
      `%${transaction.description.substring(0, 50)}%`
    ]);

    return result.rows.length > 0;
  }

  /**
   * Get import history
   */
  static async getImportHistory(userId) {
    const result = await db.query(`
      SELECT 
        DATE(created_at) as import_date,
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
      FROM transactions
      WHERE user_id = $1 AND import_source = 'bank_statement'
      GROUP BY DATE(created_at)
      ORDER BY import_date DESC
      LIMIT 20
    `, [userId]);

    return result.rows;
  }
}

module.exports = BankStatementService;
