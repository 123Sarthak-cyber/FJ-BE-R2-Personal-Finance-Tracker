const db = require('../config/database');
const Decimal = require('decimal.js');

/**
 * Anomaly Detection Service
 * Identifies unusual spending patterns and transactions
 */
class AnomalyDetectionService {
  /**
   * Detect all anomalies for a user
   */
  static async detectAnomalies(userId) {
    const anomalies = [];

    // Run all detection methods
    const [
      unusualAmounts,
      frequencyAnomalies,
      categorySpikes,
      unusualTiming,
      duplicateSuspects
    ] = await Promise.all([
      this.detectUnusualAmounts(userId),
      this.detectFrequencyAnomalies(userId),
      this.detectCategorySpikes(userId),
      this.detectUnusualTiming(userId),
      this.detectPotentialDuplicates(userId)
    ]);

    anomalies.push(...unusualAmounts);
    anomalies.push(...frequencyAnomalies);
    anomalies.push(...categorySpikes);
    anomalies.push(...unusualTiming);
    anomalies.push(...duplicateSuspects);

    // Sort by severity and date
    anomalies.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return new Date(b.date) - new Date(a.date);
    });

    return {
      success: true,
      anomalies,
      summary: this.generateSummary(anomalies)
    };
  }

  /**
   * Detect transactions with unusual amounts (outside 2 standard deviations)
   */
  static async detectUnusualAmounts(userId) {
    const anomalies = [];

    // Get statistics per category
    const stats = await db.query(`
      SELECT 
        c.id as category_id,
        c.name as category_name,
        AVG(t.amount) as avg_amount,
        STDDEV(t.amount) as std_dev,
        COUNT(*) as transaction_count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
      AND t.date >= NOW() - INTERVAL '6 months'
      GROUP BY c.id, c.name
      HAVING COUNT(*) >= 5
    `, [userId]);

    for (const stat of stats.rows) {
      if (!stat.std_dev || stat.std_dev === 0) continue;

      // Find transactions outside 2 standard deviations
      const outliers = await db.query(`
        SELECT t.*, c.name as category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.category_id = $2
        AND t.date >= NOW() - INTERVAL '3 months'
        AND ABS(t.amount - $3) > ($4 * 2)
        ORDER BY t.date DESC
        LIMIT 10
      `, [userId, stat.category_id, stat.avg_amount, stat.std_dev]);

      for (const transaction of outliers.rows) {
        const deviation = Math.abs(parseFloat(transaction.amount) - parseFloat(stat.avg_amount)) / parseFloat(stat.std_dev);
        
        anomalies.push({
          type: 'unusual_amount',
          severity: deviation > 3 ? 'high' : 'medium',
          transactionId: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          description: transaction.description,
          category: stat.category_name,
          message: `This ${stat.category_name} transaction of $${transaction.amount} is ${deviation.toFixed(1)}x higher than your average ($${parseFloat(stat.avg_amount).toFixed(2)})`,
          averageAmount: parseFloat(stat.avg_amount).toFixed(2),
          standardDeviation: parseFloat(stat.std_dev).toFixed(2),
          deviationScore: deviation.toFixed(2)
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect unusual transaction frequency
   */
  static async detectFrequencyAnomalies(userId) {
    const anomalies = [];

    // Get daily transaction counts
    const dailyCounts = await db.query(`
      SELECT 
        DATE(date) as date,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM transactions
      WHERE user_id = $1
      AND date >= NOW() - INTERVAL '3 months'
      GROUP BY DATE(date)
      ORDER BY date DESC
    `, [userId]);

    if (dailyCounts.rows.length < 14) return anomalies;

    // Calculate average and std dev
    const counts = dailyCounts.rows.map(r => parseInt(r.count));
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdDev = Math.sqrt(
      counts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / counts.length
    );

    // Find days with unusual activity
    for (const day of dailyCounts.rows.slice(0, 30)) {
      const count = parseInt(day.count);
      if (stdDev > 0 && count > avgCount + (stdDev * 2)) {
        anomalies.push({
          type: 'high_frequency',
          severity: count > avgCount + (stdDev * 3) ? 'high' : 'medium',
          date: day.date,
          transactionCount: count,
          totalAmount: day.total_amount,
          message: `Unusually high activity on ${new Date(day.date).toLocaleDateString()}: ${count} transactions totaling $${parseFloat(day.total_amount).toFixed(2)} (average: ${avgCount.toFixed(1)} transactions/day)`,
          averageCount: avgCount.toFixed(1)
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect sudden spikes in category spending
   */
  static async detectCategorySpikes(userId) {
    const anomalies = [];

    // Compare current month to previous months
    const categoryComparison = await db.query(`
      WITH monthly_spending AS (
        SELECT 
          c.id as category_id,
          c.name as category_name,
          DATE_TRUNC('month', t.date) as month,
          SUM(t.amount) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.type = 'expense'
        AND t.date >= NOW() - INTERVAL '4 months'
        GROUP BY c.id, c.name, DATE_TRUNC('month', t.date)
      ),
      category_stats AS (
        SELECT 
          category_id,
          category_name,
          AVG(total) as avg_monthly,
          STDDEV(total) as std_dev
        FROM monthly_spending
        WHERE month < DATE_TRUNC('month', NOW())
        GROUP BY category_id, category_name
        HAVING COUNT(*) >= 2
      )
      SELECT 
        ms.category_id,
        ms.category_name,
        ms.total as current_month_total,
        cs.avg_monthly,
        cs.std_dev,
        CASE 
          WHEN cs.std_dev > 0 THEN (ms.total - cs.avg_monthly) / cs.std_dev
          ELSE 0
        END as z_score
      FROM monthly_spending ms
      JOIN category_stats cs ON ms.category_id = cs.category_id
      WHERE ms.month = DATE_TRUNC('month', NOW())
      AND ms.total > cs.avg_monthly * 1.5
      ORDER BY z_score DESC
    `, [userId]);

    for (const cat of categoryComparison.rows) {
      const zScore = parseFloat(cat.z_score);
      if (zScore > 1.5 || parseFloat(cat.current_month_total) > parseFloat(cat.avg_monthly) * 2) {
        const percentIncrease = ((parseFloat(cat.current_month_total) - parseFloat(cat.avg_monthly)) / parseFloat(cat.avg_monthly) * 100).toFixed(0);
        
        anomalies.push({
          type: 'category_spike',
          severity: zScore > 2.5 ? 'high' : 'medium',
          category: cat.category_name,
          categoryId: cat.category_id,
          currentAmount: parseFloat(cat.current_month_total).toFixed(2),
          averageAmount: parseFloat(cat.avg_monthly).toFixed(2),
          percentIncrease: percentIncrease,
          message: `${cat.category_name} spending is up ${percentIncrease}% this month ($${parseFloat(cat.current_month_total).toFixed(2)} vs average $${parseFloat(cat.avg_monthly).toFixed(2)})`,
          date: new Date()
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect transactions at unusual times (late night, holidays)
   */
  static async detectUnusualTiming(userId) {
    const anomalies = [];

    // Find large transactions at unusual hours (if we had time data)
    // For now, detect weekend vs weekday patterns
    const weekendSpending = await db.query(`
      SELECT 
        t.*,
        c.name as category_name,
        EXTRACT(DOW FROM t.date) as day_of_week
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.amount > (
        SELECT AVG(amount) * 2 FROM transactions 
        WHERE user_id = $1 AND type = 'expense'
      )
      AND EXTRACT(DOW FROM t.date) IN (0, 6)
      AND t.date >= NOW() - INTERVAL '1 month'
      ORDER BY t.amount DESC
      LIMIT 5
    `, [userId]);

    for (const transaction of weekendSpending.rows) {
      anomalies.push({
        type: 'unusual_timing',
        severity: 'low',
        transactionId: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category_name,
        message: `Large weekend transaction: $${transaction.amount} at ${transaction.category_name}`,
        dayOfWeek: parseInt(transaction.day_of_week) === 0 ? 'Sunday' : 'Saturday'
      });
    }

    return anomalies;
  }

  /**
   * Detect potential duplicate transactions
   */
  static async detectPotentialDuplicates(userId) {
    const anomalies = [];

    // Find transactions with same amount and similar description within 3 days
    const potentialDuplicates = await db.query(`
      SELECT 
        t1.id as id1,
        t2.id as id2,
        t1.amount,
        t1.description as desc1,
        t2.description as desc2,
        t1.date as date1,
        t2.date as date2,
        c.name as category_name
      FROM transactions t1
      JOIN transactions t2 ON t1.user_id = t2.user_id
        AND t1.id < t2.id
        AND ABS(t1.amount - t2.amount) < 0.01
        AND ABS(EXTRACT(EPOCH FROM (t1.date - t2.date))) < 259200
      JOIN categories c ON t1.category_id = c.id
      WHERE t1.user_id = $1
      AND t1.date >= NOW() - INTERVAL '1 month'
      AND (
        t1.description ILIKE t2.description
        OR LENGTH(t1.description) < 10
      )
      ORDER BY t1.date DESC
      LIMIT 10
    `, [userId]);

    for (const dup of potentialDuplicates.rows) {
      anomalies.push({
        type: 'potential_duplicate',
        severity: 'medium',
        transactionIds: [dup.id1, dup.id2],
        amount: dup.amount,
        descriptions: [dup.desc1, dup.desc2],
        dates: [dup.date1, dup.date2],
        category: dup.category_name,
        message: `Possible duplicate: Two $${dup.amount} transactions at ${dup.category_name} within 3 days`,
        date: dup.date1
      });
    }

    return anomalies;
  }

  /**
   * Get spending velocity (rate of spending)
   */
  static async getSpendingVelocity(userId) {
    const result = await db.query(`
      WITH daily_spending AS (
        SELECT 
          DATE(date) as date,
          SUM(amount) as daily_total
        FROM transactions
        WHERE user_id = $1
        AND type = 'expense'
        AND date >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(date)
      )
      SELECT 
        AVG(daily_total) as avg_daily_spending,
        MAX(daily_total) as max_daily_spending,
        MIN(daily_total) as min_daily_spending,
        SUM(daily_total) as total_30_days,
        COUNT(*) as active_days
      FROM daily_spending
    `, [userId]);

    const stats = result.rows[0];
    
    // Calculate if current pace will exceed monthly budget
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const projectedMonthly = parseFloat(stats.avg_daily_spending || 0) * daysInMonth;

    return {
      avgDailySpending: parseFloat(stats.avg_daily_spending || 0).toFixed(2),
      maxDailySpending: parseFloat(stats.max_daily_spending || 0).toFixed(2),
      minDailySpending: parseFloat(stats.min_daily_spending || 0).toFixed(2),
      total30Days: parseFloat(stats.total_30_days || 0).toFixed(2),
      activeDays: parseInt(stats.active_days || 0),
      projectedMonthlySpending: projectedMonthly.toFixed(2)
    };
  }

  /**
   * Generate anomaly summary
   */
  static generateSummary(anomalies) {
    const byType = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };

    for (const anomaly of anomalies) {
      byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;
      bySeverity[anomaly.severity]++;
    }

    return {
      total: anomalies.length,
      byType,
      bySeverity,
      requiresAttention: bySeverity.high > 0,
      message: this.getSummaryMessage(anomalies, bySeverity)
    };
  }

  /**
   * Generate human-readable summary message
   */
  static getSummaryMessage(anomalies, bySeverity) {
    if (anomalies.length === 0) {
      return "Great news! No spending anomalies detected.";
    }

    const parts = [];
    
    if (bySeverity.high > 0) {
      parts.push(`${bySeverity.high} high-priority issue${bySeverity.high > 1 ? 's' : ''} requiring attention`);
    }
    if (bySeverity.medium > 0) {
      parts.push(`${bySeverity.medium} medium-priority finding${bySeverity.medium > 1 ? 's' : ''}`);
    }
    if (bySeverity.low > 0) {
      parts.push(`${bySeverity.low} minor observation${bySeverity.low > 1 ? 's' : ''}`);
    }

    return `Found ${parts.join(', ')}.`;
  }

  /**
   * Get anomaly trends over time
   */
  static async getAnomalyTrends(userId) {
    // This would typically store and compare historical anomaly data
    // For now, return current velocity and patterns
    const velocity = await this.getSpendingVelocity(userId);
    
    return {
      velocity,
      trend: parseFloat(velocity.projectedMonthlySpending) > parseFloat(velocity.total30Days) 
        ? 'increasing' 
        : 'stable'
    };
  }
}

module.exports = AnomalyDetectionService;
