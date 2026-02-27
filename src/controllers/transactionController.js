const { query, transaction } = require('../config/database');
const Decimal = require('decimal.js');
const path = require('path');
const fs = require('fs');
const { checkBudgetAndNotify } = require('../services/emailService');

// Get all transactions for user
const getTransactions = async (req, res) => {
  try {
    const { startDate, endDate, type, categoryId, currency, page = 1, limit = 20 } = req.query;
    
    let sql = `
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      sql += ` AND t.date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      sql += ` AND t.date <= $${paramCount}`;
      params.push(endDate);
    }

    if (type && ['income', 'expense'].includes(type)) {
      paramCount++;
      sql += ` AND t.type = $${paramCount}`;
      params.push(type);
    }

    if (categoryId) {
      paramCount++;
      sql += ` AND t.category_id = $${paramCount}`;
      params.push(categoryId);
    }

    if (currency) {
      paramCount++;
      sql += ` AND t.currency = $${paramCount}`;
      params.push(currency.toUpperCase());
    }

    // Get total count
    const countResult = await query(
      sql.replace('SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon', 'SELECT COUNT(*) as total'),
      params
    );
    
    const total = parseInt(countResult.rows[0].total);

    // Add pagination and ordering
    sql += ` ORDER BY t.date DESC, t.created_at DESC`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    paramCount++;
    sql += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await query(sql, params);

    const transactions = result.rows.map(t => ({
      id: t.id,
      amount: parseFloat(t.amount),
      currency: t.currency,
      type: t.type,
      description: t.description,
      date: t.date,
      isRefund: t.is_refund,
      receiptUrl: t.receipt_url,
      category: t.category_id ? {
        id: t.category_id,
        name: t.category_name,
        color: t.category_color,
        icon: t.category_icon
      } : null,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    }));

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions'
    });
  }
};

// Get single transaction
const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = $1 AND t.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const t = result.rows[0];

    res.json({
      success: true,
      data: {
        id: t.id,
        amount: parseFloat(t.amount),
        currency: t.currency,
        type: t.type,
        description: t.description,
        date: t.date,
        isRefund: t.is_refund,
        receiptUrl: t.receipt_url,
        category: t.category_id ? {
          id: t.category_id,
          name: t.category_name,
          color: t.category_color,
          icon: t.category_icon
        } : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction'
    });
  }
};

// Create new transaction
const createTransaction = async (req, res) => {
  try {
    const { amount, type, categoryId, description, date, currency, isRefund } = req.body;

    // Use Decimal.js for precise decimal handling
    const decimalAmount = new Decimal(amount);
    
    // Handle negative amounts (refunds in expense)
    // For refunds, we allow negative expense amounts or positive expense with isRefund flag
    let finalAmount = decimalAmount.toFixed(2);
    let isRefundFlag = isRefund || false;

    // If it's a negative expense, treat it as a refund
    if (type === 'expense' && decimalAmount.lessThan(0)) {
      finalAmount = decimalAmount.abs().toFixed(2);
      isRefundFlag = true;
    }

    // Validate category belongs to user and matches type
    if (categoryId) {
      const categoryResult = await query(
        'SELECT id, type FROM categories WHERE id = $1 AND user_id = $2',
        [categoryId, req.user.id]
      );
      
      if (categoryResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Category not found or does not belong to user'
        });
      }

      // Warn if category type doesn't match transaction type
      if (categoryResult.rows[0].type !== type) {
        return res.status(400).json({
          success: false,
          message: `Category type (${categoryResult.rows[0].type}) does not match transaction type (${type})`
        });
      }
    }

    const result = await query(
      `INSERT INTO transactions (user_id, category_id, amount, currency, type, description, date, is_refund)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        categoryId || null,
        finalAmount,
        (currency || req.user.preferred_currency || 'USD').toUpperCase(),
        type,
        description || null,
        date || new Date().toISOString().split('T')[0],
        isRefundFlag
      ]
    );

    const t = result.rows[0];

    // Get category details if exists
    let category = null;
    if (t.category_id) {
      const catResult = await query('SELECT name, color, icon FROM categories WHERE id = $1', [t.category_id]);
      if (catResult.rows.length > 0) {
        category = {
          id: t.category_id,
          name: catResult.rows[0].name,
          color: catResult.rows[0].color,
          icon: catResult.rows[0].icon
        };
      }
    }

    // Check budget and notify if threshold exceeded
    if (type === 'expense' && categoryId) {
      checkBudgetAndNotify(req.user.id, categoryId).catch(err => {
        console.error('Budget notification error:', err);
      });
    }

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: {
        id: t.id,
        amount: parseFloat(t.amount),
        currency: t.currency,
        type: t.type,
        description: t.description,
        date: t.date,
        isRefund: t.is_refund,
        receiptUrl: t.receipt_url,
        category,
        createdAt: t.created_at
      }
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating transaction'
    });
  }
};

// Update transaction
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, categoryId, description, date, currency, isRefund } = req.body;

    // Check if transaction exists and belongs to user
    const existingResult = await query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (amount !== undefined) {
      const decimalAmount = new Decimal(amount);
      let finalAmount = decimalAmount.toFixed(2);
      
      // Handle negative expense as refund
      if ((type || existingResult.rows[0].type) === 'expense' && decimalAmount.lessThan(0)) {
        finalAmount = decimalAmount.abs().toFixed(2);
        paramCount++;
        updates.push(`is_refund = $${paramCount}`);
        values.push(true);
      }
      
      paramCount++;
      updates.push(`amount = $${paramCount}`);
      values.push(finalAmount);
    }

    if (type !== undefined) {
      paramCount++;
      updates.push(`type = $${paramCount}`);
      values.push(type);
    }

    if (categoryId !== undefined) {
      if (categoryId) {
        // Validate category
        const categoryResult = await query(
          'SELECT id, type FROM categories WHERE id = $1 AND user_id = $2',
          [categoryId, req.user.id]
        );
        
        if (categoryResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Category not found'
          });
        }
      }
      paramCount++;
      updates.push(`category_id = $${paramCount}`);
      values.push(categoryId || null);
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      values.push(description);
    }

    if (date !== undefined) {
      paramCount++;
      updates.push(`date = $${paramCount}`);
      values.push(date);
    }

    if (currency !== undefined) {
      paramCount++;
      updates.push(`currency = $${paramCount}`);
      values.push(currency.toUpperCase());
    }

    if (isRefund !== undefined) {
      paramCount++;
      updates.push(`is_refund = $${paramCount}`);
      values.push(isRefund);
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
      `UPDATE transactions SET ${updates.join(', ')}
       WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );

    const t = result.rows[0];

    // Get category details
    let category = null;
    if (t.category_id) {
      const catResult = await query('SELECT name, color, icon FROM categories WHERE id = $1', [t.category_id]);
      if (catResult.rows.length > 0) {
        category = {
          id: t.category_id,
          name: catResult.rows[0].name,
          color: catResult.rows[0].color,
          icon: catResult.rows[0].icon
        };
      }
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: {
        id: t.id,
        amount: parseFloat(t.amount),
        currency: t.currency,
        type: t.type,
        description: t.description,
        date: t.date,
        isRefund: t.is_refund,
        receiptUrl: t.receipt_url,
        category,
        updatedAt: t.updated_at
      }
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating transaction'
    });
  }
};

// Delete transaction
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if transaction exists and get receipt URL for cleanup
    const existingResult = await query(
      'SELECT receipt_url FROM transactions WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Delete the transaction
    await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    // Delete receipt file if exists
    if (existingResult.rows[0].receipt_url) {
      const receiptPath = path.join(__dirname, '../../', existingResult.rows[0].receipt_url);
      if (fs.existsSync(receiptPath)) {
        fs.unlinkSync(receiptPath);
      }
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting transaction'
    });
  }
};

// Upload receipt for transaction
const uploadReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check if transaction exists and belongs to user
    const existingResult = await query(
      'SELECT receipt_url FROM transactions WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Delete old receipt if exists
    if (existingResult.rows[0].receipt_url) {
      const oldPath = path.join(__dirname, '../../', existingResult.rows[0].receipt_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update transaction with new receipt URL
    const receiptUrl = `/uploads/${req.file.filename}`;
    await query(
      'UPDATE transactions SET receipt_url = $1 WHERE id = $2',
      [receiptUrl, id]
    );

    res.json({
      success: true,
      message: 'Receipt uploaded successfully',
      data: {
        receiptUrl
      }
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading receipt'
    });
  }
};

// Delete receipt from transaction
const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT receipt_url FROM transactions WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (!result.rows[0].receipt_url) {
      return res.status(400).json({
        success: false,
        message: 'No receipt to delete'
      });
    }

    // Delete file
    const receiptPath = path.join(__dirname, '../../', result.rows[0].receipt_url);
    if (fs.existsSync(receiptPath)) {
      fs.unlinkSync(receiptPath);
    }

    // Update transaction
    await query('UPDATE transactions SET receipt_url = NULL WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });
  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting receipt'
    });
  }
};

module.exports = {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  uploadReceipt,
  deleteReceipt
};
