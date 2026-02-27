const nodemailer = require('nodemailer');
const { query } = require('../config/database');

// Create transporter
let transporter;

if (process.env.SENDGRID_API_KEY) {
  // Use SendGrid
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: 'apikey',
      pass: process.env.SENDGRID_API_KEY
    }
  });
} else {
  // Use a test/development transporter (logs to console)
  transporter = {
    sendMail: async (options) => {
      console.log('📧 Email would be sent:', {
        to: options.to,
        subject: options.subject,
        preview: options.text?.substring(0, 100) + '...'
      });
      return { messageId: 'dev-' + Date.now() };
    }
  };
}

// Send email
const sendEmail = async (to, subject, html, text) => {
  try {
    const result = await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@financetracker.com',
      to,
      subject,
      html,
      text
    });
    
    console.log('Email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Check budget and send notification if threshold exceeded
const checkBudgetAndNotify = async (userId, categoryId) => {
  try {
    // Get user email preferences
    const userResult = await query(
      'SELECT email, email_notifications, first_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].email_notifications) {
      return;
    }

    const user = userResult.rows[0];

    // Get active budgets for this category
    const budgetResult = await query(
      `SELECT b.*, c.name as category_name
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = $1 AND b.category_id = $2 
         AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
         AND b.alert_sent = false`,
      [userId, categoryId]
    );

    if (budgetResult.rows.length === 0) {
      return;
    }

    for (const budget of budgetResult.rows) {
      // Calculate spent amount
      const { calculateSpent } = require('../controllers/budgetController');
      const spentResult = await calculateSpent(budget);
      const spentAmount = parseFloat(spentResult.spent);
      const budgetAmount = parseFloat(budget.amount);
      const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

      if (percentage >= budget.alert_threshold) {
        // Send notification
        const isOverBudget = percentage >= 100;
        const subject = isOverBudget 
          ? `🚨 Budget Exceeded: ${budget.category_name}`
          : `⚠️ Budget Alert: ${budget.category_name}`;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${isOverBudget ? '#ef4444' : '#f59e0b'};">${subject}</h2>
            <p>Hi ${user.first_name || 'there'},</p>
            <p>Your spending in <strong>${budget.category_name}</strong> has ${isOverBudget ? 'exceeded' : 'reached'} ${Math.round(percentage)}% of your ${budget.period} budget.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Budget:</strong> ${budget.currency} ${budgetAmount.toFixed(2)}</p>
              <p style="margin: 5px 0;"><strong>Spent:</strong> ${budget.currency} ${spentAmount.toFixed(2)}</p>
              <p style="margin: 5px 0;"><strong>Remaining:</strong> ${budget.currency} ${Math.max(0, budgetAmount - spentAmount).toFixed(2)}</p>
            </div>
            <p>Log in to your Finance Tracker to review your spending and adjust your budget if needed.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
              You received this email because you have budget notifications enabled. 
              You can disable them in your profile settings.
            </p>
          </div>
        `;

        const text = `${subject}\n\nHi ${user.first_name || 'there'},\n\nYour spending in ${budget.category_name} has ${isOverBudget ? 'exceeded' : 'reached'} ${Math.round(percentage)}% of your ${budget.period} budget.\n\nBudget: ${budget.currency} ${budgetAmount.toFixed(2)}\nSpent: ${budget.currency} ${spentAmount.toFixed(2)}\nRemaining: ${budget.currency} ${Math.max(0, budgetAmount - spentAmount).toFixed(2)}`;

        await sendEmail(user.email, subject, html, text);

        // Mark alert as sent
        await query('UPDATE budgets SET alert_sent = true WHERE id = $1', [budget.id]);

        // Create notification record
        await query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, $2, $3, $4)`,
          [userId, 'budget_alert', subject, `You've used ${Math.round(percentage)}% of your ${budget.category_name} budget.`]
        );
      }
    }
  } catch (error) {
    console.error('Budget notification error:', error);
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, firstName) => {
  const subject = '🎉 Welcome to Personal Finance Tracker!';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #6366f1;">Welcome to Finance Tracker!</h1>
      <p>Hi ${firstName || 'there'},</p>
      <p>Thank you for signing up! We're excited to help you take control of your finances.</p>
      <h3>Getting Started:</h3>
      <ul>
        <li>Add your income sources and expenses</li>
        <li>Set up budgets for different categories</li>
        <li>Track your spending with our dashboard</li>
        <li>Generate reports to analyze your financial health</li>
      </ul>
      <p>If you have any questions, feel free to reach out!</p>
      <p>Best,<br>The Finance Tracker Team</p>
    </div>
  `;

  const text = `Welcome to Finance Tracker!\n\nHi ${firstName || 'there'},\n\nThank you for signing up! We're excited to help you take control of your finances.`;

  return sendEmail(email, subject, html, text);
};

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    
    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [req.user.id];

    if (unreadOnly === 'true') {
      sql += ' AND is_read = false';
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.is_read,
        createdAt: n.created_at
      }))
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
};

// Mark notification as read
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification'
    });
  }
};

// Mark all notifications as read
const markAllNotificationsRead = async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notifications'
    });
  }
};

module.exports = {
  sendEmail,
  checkBudgetAndNotify,
  sendWelcomeEmail,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead
};
