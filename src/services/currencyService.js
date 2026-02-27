const axios = require('axios');
const { query } = require('../config/database');

// Supported currencies
const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN',
  'BRL', 'RUB', 'KRW', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'NZD', 'ZAR'
];

// Cache duration in milliseconds (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

// Get exchange rate from API or cache
const getExchangeRate = async (baseCurrency, targetCurrency) => {
  if (baseCurrency === targetCurrency) {
    return 1;
  }

  baseCurrency = baseCurrency.toUpperCase();
  targetCurrency = targetCurrency.toUpperCase();

  try {
    // Check cache first
    const cacheResult = await query(
      `SELECT rate, fetched_at FROM exchange_rates 
       WHERE base_currency = $1 AND target_currency = $2`,
      [baseCurrency, targetCurrency]
    );

    if (cacheResult.rows.length > 0) {
      const cachedRate = cacheResult.rows[0];
      const cacheAge = Date.now() - new Date(cachedRate.fetched_at).getTime();
      
      if (cacheAge < CACHE_DURATION) {
        return parseFloat(cachedRate.rate);
      }
    }

    // Fetch from API
    const rate = await fetchExchangeRateFromAPI(baseCurrency, targetCurrency);
    
    if (rate) {
      // Update cache
      await query(
        `INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (base_currency, target_currency) 
         DO UPDATE SET rate = $3, fetched_at = NOW()`,
        [baseCurrency, targetCurrency, rate]
      );
      
      return rate;
    }

    // If API fails and we have cached rate, use it
    if (cacheResult.rows.length > 0) {
      return parseFloat(cacheResult.rows[0].rate);
    }

    // Fallback
    return 1;
  } catch (error) {
    console.error('Get exchange rate error:', error);
    return 1;
  }
};

// Fetch exchange rate from external API
const fetchExchangeRateFromAPI = async (baseCurrency, targetCurrency) => {
  try {
    // Using exchangerate.host (free, no API key required)
    const response = await axios.get(
      `https://api.exchangerate.host/convert?from=${baseCurrency}&to=${targetCurrency}`,
      { timeout: 5000 }
    );

    if (response.data && response.data.success && response.data.result) {
      return response.data.result;
    }

    // Fallback to another free API
    const fallbackResponse = await axios.get(
      `https://open.er-api.com/v6/latest/${baseCurrency}`,
      { timeout: 5000 }
    );

    if (fallbackResponse.data && fallbackResponse.data.rates) {
      return fallbackResponse.data.rates[targetCurrency] || 1;
    }

    return null;
  } catch (error) {
    console.error('Fetch exchange rate API error:', error.message);
    return null;
  }
};

// Convert amount between currencies
const convertAmount = async (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
};

// Get all exchange rates for a base currency
const getAllRates = async (baseCurrency = 'USD') => {
  baseCurrency = baseCurrency.toUpperCase();
  
  try {
    // Check cache
    const cacheResult = await query(
      `SELECT target_currency, rate FROM exchange_rates 
       WHERE base_currency = $1`,
      [baseCurrency]
    );

    const rates = {};
    let needsFetch = false;

    // Check if we have all rates and they're fresh
    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === baseCurrency) {
        rates[currency] = 1;
        continue;
      }

      const cached = cacheResult.rows.find(r => r.target_currency === currency);
      if (cached) {
        rates[currency] = parseFloat(cached.rate);
      } else {
        needsFetch = true;
      }
    }

    // Fetch fresh rates if needed
    if (needsFetch) {
      try {
        const response = await axios.get(
          `https://open.er-api.com/v6/latest/${baseCurrency}`,
          { timeout: 5000 }
        );

        if (response.data && response.data.rates) {
          for (const currency of SUPPORTED_CURRENCIES) {
            if (currency !== baseCurrency && response.data.rates[currency]) {
              rates[currency] = response.data.rates[currency];
              
              // Update cache
              await query(
                `INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (base_currency, target_currency) 
                 DO UPDATE SET rate = $3, fetched_at = NOW()`,
                [baseCurrency, currency, rates[currency]]
              );
            }
          }
        }
      } catch (error) {
        console.error('Fetch all rates error:', error.message);
      }
    }

    return rates;
  } catch (error) {
    console.error('Get all rates error:', error);
    return { [baseCurrency]: 1 };
  }
};

// API endpoint to get exchange rates
const getExchangeRates = async (req, res) => {
  try {
    const { base } = req.query;
    const baseCurrency = (base || 'USD').toUpperCase();

    if (!SUPPORTED_CURRENCIES.includes(baseCurrency)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`
      });
    }

    const rates = await getAllRates(baseCurrency);

    res.json({
      success: true,
      data: {
        baseCurrency,
        rates,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get exchange rates endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching exchange rates'
    });
  }
};

// API endpoint to convert currency
const convertCurrency = async (req, res) => {
  try {
    const { amount, from, to } = req.query;

    if (!amount || !from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Amount, from, and to currencies are required'
      });
    }

    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();

    if (!SUPPORTED_CURRENCIES.includes(fromCurrency) || !SUPPORTED_CURRENCIES.includes(toCurrency)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const rate = await getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = parsedAmount * rate;

    res.json({
      success: true,
      data: {
        originalAmount: parsedAmount,
        originalCurrency: fromCurrency,
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        targetCurrency: toCurrency,
        exchangeRate: rate
      }
    });
  } catch (error) {
    console.error('Convert currency endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Error converting currency'
    });
  }
};

// Get list of supported currencies
const getSupportedCurrencies = (req, res) => {
  res.json({
    success: true,
    data: SUPPORTED_CURRENCIES.map(code => ({
      code,
      name: getCurrencyName(code),
      symbol: getCurrencySymbol(code)
    }))
  });
};

// Helper function to get currency name
function getCurrencyName(code) {
  const names = {
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'British Pound',
    JPY: 'Japanese Yen',
    CAD: 'Canadian Dollar',
    AUD: 'Australian Dollar',
    CHF: 'Swiss Franc',
    CNY: 'Chinese Yuan',
    INR: 'Indian Rupee',
    MXN: 'Mexican Peso',
    BRL: 'Brazilian Real',
    RUB: 'Russian Ruble',
    KRW: 'South Korean Won',
    SGD: 'Singapore Dollar',
    HKD: 'Hong Kong Dollar',
    NOK: 'Norwegian Krone',
    SEK: 'Swedish Krona',
    DKK: 'Danish Krone',
    NZD: 'New Zealand Dollar',
    ZAR: 'South African Rand'
  };
  return names[code] || code;
}

// Helper function to get currency symbol
function getCurrencySymbol(code) {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'Fr',
    CNY: '¥',
    INR: '₹',
    MXN: '$',
    BRL: 'R$',
    RUB: '₽',
    KRW: '₩',
    SGD: 'S$',
    HKD: 'HK$',
    NOK: 'kr',
    SEK: 'kr',
    DKK: 'kr',
    NZD: 'NZ$',
    ZAR: 'R'
  };
  return symbols[code] || code;
}

module.exports = {
  getExchangeRate,
  convertAmount,
  getAllRates,
  getExchangeRates,
  convertCurrency,
  getSupportedCurrencies,
  SUPPORTED_CURRENCIES
};
