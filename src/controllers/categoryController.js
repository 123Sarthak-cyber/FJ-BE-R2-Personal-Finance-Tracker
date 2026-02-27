const { query, transaction } = require('../config/database');

// Get all categories for user
const getCategories = async (req, res) => {
  try {
    const { type } = req.query;

    let sql = 'SELECT * FROM categories WHERE user_id = $1';
    const params = [req.user.id];

    if (type && ['income', 'expense'].includes(type)) {
      sql += ' AND type = $2';
      params.push(type);
    }

    sql += ' ORDER BY is_default DESC, name ASC';

    const result = await query(sql, params);

    const categories = result.rows.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      isDefault: c.is_default,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories'
    });
  }
};

// Get single category
const getCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const c = result.rows[0];

    // Get transaction count for this category
    const countResult = await query(
      'SELECT COUNT(*) as count FROM transactions WHERE category_id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        isDefault: c.is_default,
        transactionCount: parseInt(countResult.rows[0].count),
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching category'
    });
  }
};

// Create new category
const createCategory = async (req, res) => {
  try {
    const { name, type, color, icon } = req.body;

    // Check if category with same name and type exists
    const existingResult = await query(
      'SELECT id FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND type = $3',
      [req.user.id, name, type]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A ${type} category with this name already exists`
      });
    }

    const result = await query(
      `INSERT INTO categories (user_id, name, type, color, icon)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name, type, color || '#6366f1', icon || 'default']
    );

    const c = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        isDefault: c.is_default,
        createdAt: c.created_at
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        message: 'Category already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating category'
    });
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;

    // Check if category exists and belongs to user
    const existingResult = await query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) {
      // Check for duplicate name
      const duplicateResult = await query(
        'SELECT id FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND type = $3 AND id != $4',
        [req.user.id, name, existingResult.rows[0].type, id]
      );

      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A category with this name already exists'
        });
      }

      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name);
    }

    if (color !== undefined) {
      paramCount++;
      updates.push(`color = $${paramCount}`);
      values.push(color);
    }

    if (icon !== undefined) {
      paramCount++;
      updates.push(`icon = $${paramCount}`);
      values.push(icon);
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
      `UPDATE categories SET ${updates.join(', ')}
       WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );

    const c = result.rows[0];

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: {
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        isDefault: c.is_default,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating category'
    });
  }
};

// Delete category
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { moveTransactionsTo } = req.query;

    // Check if category exists
    const existingResult = await query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check for existing transactions
    const transactionCountResult = await query(
      'SELECT COUNT(*) as count FROM transactions WHERE category_id = $1',
      [id]
    );

    const transactionCount = parseInt(transactionCountResult.rows[0].count);

    if (transactionCount > 0) {
      if (moveTransactionsTo) {
        // Validate destination category exists and belongs to user
        const destCategoryResult = await query(
          'SELECT type FROM categories WHERE id = $1 AND user_id = $2',
          [moveTransactionsTo, req.user.id]
        );

        if (destCategoryResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Destination category not found'
          });
        }

        // Verify same type
        if (destCategoryResult.rows[0].type !== existingResult.rows[0].type) {
          return res.status(400).json({
            success: false,
            message: 'Destination category must be of the same type'
          });
        }

        // Move transactions to new category
        await query(
          'UPDATE transactions SET category_id = $1 WHERE category_id = $2',
          [moveTransactionsTo, id]
        );
      } else {
        // Set transactions category to NULL (uncategorized)
        await query(
          'UPDATE transactions SET category_id = NULL WHERE category_id = $1',
          [id]
        );
      }
    }

    // Delete associated budgets first
    await query('DELETE FROM budgets WHERE category_id = $1', [id]);

    // Delete the category
    await query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    res.json({
      success: true,
      message: 'Category deleted successfully',
      data: {
        affectedTransactions: transactionCount,
        transactionsMovedTo: moveTransactionsTo || 'uncategorized'
      }
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting category'
    });
  }
};

// Get category statistics
const getCategoryStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Check if category exists
    const categoryResult = await query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const category = categoryResult.rows[0];

    // Build date filter
    let dateFilter = '';
    const params = [id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      dateFilter += ` AND date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      dateFilter += ` AND date <= $${paramCount}`;
      params.push(endDate);
    }

    // Get statistics
    const statsResult = await query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN is_refund = false THEN amount ELSE 0 END), 0) as total_amount,
        COALESCE(SUM(CASE WHEN is_refund = true THEN amount ELSE 0 END), 0) as total_refunds,
        COALESCE(AVG(amount), 0) as average_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
       FROM transactions
       WHERE category_id = $1${dateFilter}`,
      params
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        category: {
          id: category.id,
          name: category.name,
          type: category.type,
          color: category.color
        },
        statistics: {
          transactionCount: parseInt(stats.transaction_count),
          totalAmount: parseFloat(stats.total_amount),
          totalRefunds: parseFloat(stats.total_refunds),
          netAmount: parseFloat(stats.total_amount) - parseFloat(stats.total_refunds),
          averageAmount: parseFloat(stats.average_amount).toFixed(2),
          minAmount: stats.min_amount ? parseFloat(stats.min_amount) : 0,
          maxAmount: stats.max_amount ? parseFloat(stats.max_amount) : 0
        }
      }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching category statistics'
    });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats
};
