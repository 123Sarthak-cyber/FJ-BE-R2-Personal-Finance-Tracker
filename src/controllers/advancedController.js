const AIService = require('../services/aiService');
const BankStatementService = require('../services/bankStatementService');
const AnomalyDetectionService = require('../services/anomalyDetectionService');

/**
 * AI Controller - Handles AI-powered features
 */
const aiController = {
  /**
   * Get AI-powered spending insights
   */
  async getInsights(req, res) {
    try {
      const result = await AIService.getSpendingInsights(req.user.userId);
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      console.error('Get insights error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating insights'
      });
    }
  },

  /**
   * Get AI-generated financial report
   */
  async getReport(req, res) {
    try {
      const { period } = req.query; // weekly, monthly, yearly
      const result = await AIService.generateFinancialReport(req.user.userId, period);
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      console.error('Get AI report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating report'
      });
    }
  },

  /**
   * Get AI budget recommendations
   */
  async getBudgetRecommendations(req, res) {
    try {
      const result = await AIService.getBudgetRecommendations(req.user.userId);
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      console.error('Budget recommendations error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating budget recommendations'
      });
    }
  },

  /**
   * Categorize a transaction using AI
   */
  async categorizeTransaction(req, res) {
    try {
      const { description, amount } = req.body;
      
      if (!description || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Description and amount are required'
        });
      }

      const result = await AIService.categorizeTransaction(
        description,
        amount,
        req.user.userId
      );
      
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      console.error('Categorize transaction error:', error);
      res.status(500).json({
        success: false,
        message: 'Error categorizing transaction'
      });
    }
  },

  /**
   * Chat with AI financial assistant
   */
  async chat(req, res) {
    try {
      const { message, conversationHistory } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required'
        });
      }

      const result = await AIService.chat(
        req.user.userId,
        message,
        conversationHistory || []
      );
      
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing chat message'
      });
    }
  }
};

/**
 * Bank Statement Controller
 */
const bankStatementController = {
  /**
   * Import bank statement (CSV or PDF)
   */
  async importStatement(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload a CSV or PDF file'
        });
      }

      const options = {
        skipDuplicates: req.body.skipDuplicates !== 'false',
        autoCategorize: req.body.autoCategorize !== 'false'
      };

      const result = await BankStatementService.importStatement(
        req.user.userId,
        req.file,
        options
      );

      res.status(200).json({
        success: true,
        message: `Successfully imported ${result.imported} transactions`,
        ...result
      });
    } catch (error) {
      console.error('Import statement error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error importing bank statement'
      });
    }
  },

  /**
   * Get import history
   */
  async getImportHistory(req, res) {
    try {
      const history = await BankStatementService.getImportHistory(req.user.userId);
      
      res.status(200).json({
        success: true,
        history
      });
    } catch (error) {
      console.error('Get import history error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching import history'
      });
    }
  }
};

/**
 * Anomaly Detection Controller
 */
const anomalyController = {
  /**
   * Detect spending anomalies
   */
  async detectAnomalies(req, res) {
    try {
      const result = await AnomalyDetectionService.detectAnomalies(req.user.userId);
      res.status(200).json(result);
    } catch (error) {
      console.error('Detect anomalies error:', error);
      res.status(500).json({
        success: false,
        message: 'Error detecting anomalies'
      });
    }
  },

  /**
   * Get spending velocity
   */
  async getSpendingVelocity(req, res) {
    try {
      const velocity = await AnomalyDetectionService.getSpendingVelocity(req.user.userId);
      
      res.status(200).json({
        success: true,
        velocity
      });
    } catch (error) {
      console.error('Get spending velocity error:', error);
      res.status(500).json({
        success: false,
        message: 'Error calculating spending velocity'
      });
    }
  },

  /**
   * Get anomaly trends
   */
  async getAnomalyTrends(req, res) {
    try {
      const trends = await AnomalyDetectionService.getAnomalyTrends(req.user.userId);
      
      res.status(200).json({
        success: true,
        trends
      });
    } catch (error) {
      console.error('Get anomaly trends error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching anomaly trends'
      });
    }
  }
};

module.exports = {
  aiController,
  bankStatementController,
  anomalyController
};
