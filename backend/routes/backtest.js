const express = require('express');
const router = express.Router();
const KiteConnect = require('kiteconnect').KiteConnect;
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token and attach user to request
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Add instruments endpoint
router.get('/instruments', authenticateJWT, async (req, res) => {
  try {
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(req.user.kiteAccessToken);

    // Fetch all NSE instruments
    const instruments = await kite.getInstruments(['NSE']);
    
    // Return only the necessary fields
    const filteredInstruments = instruments.map(instrument => ({
      instrument_token: instrument.instrument_token,
      tradingsymbol: instrument.tradingsymbol,
      name: instrument.name,
      last_price: instrument.last_price || 0
    }));

    res.json(filteredInstruments);
  } catch (error) {
    console.error('Error fetching instruments:', error);
    res.status(500).json({ error: 'Failed to fetch instruments' });
  }
});

// Existing backtest endpoint
router.post('/', authenticateJWT, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Backtest ${requestId}] Starting backtest execution`);
  console.log(`[Backtest ${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
  
  try {
    const {
      mode,
      strategy,
      timeframe,
      startDate,
      endDate,
      investment,
      profitTarget,
      stopLoss,
      simulationAmount,
      selectedInstruments
    } = req.body;

    console.log(`[Backtest ${requestId}] Parsed configuration:`, {
      mode, strategy, timeframe, startDate, endDate,
      investment, profitTarget, stopLoss,
      simulationAmount, instrumentCount: selectedInstruments?.length
    });

    // Initialize Kite connection
    console.log(`[Backtest ${requestId}] Initializing Kite connection`);
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(req.user.kiteAccessToken);
    console.log(`[Backtest ${requestId}] Kite connection initialized`);

    // Validate required fields
    if (!selectedInstruments || selectedInstruments.length === 0) {
      console.log(`[Backtest ${requestId}] Error: No instruments selected`);
      return res.status(400).json({ error: 'Please select at least one instrument' });
    }

    if (!strategy) {
      console.log(`[Backtest ${requestId}] Error: No strategy selected`);
      return res.status(400).json({ error: 'Please select a strategy' });
    }

    // Parse dates for historical data
    const from = new Date(startDate);
    const to = new Date(endDate);
    
    console.log(`[Backtest ${requestId}] Raw dates before validation:`, {
      from: from.toISOString(),
      to: to.toISOString()
    });

    // Basic date validation
    if (from > to) {
      console.log(`[Backtest ${requestId}] Error: Start date is after end date`);
      return res.status(400).json({ 
        error: 'Start date cannot be after end date'
      });
    }

    // Get current date in IST
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Force dates to be in current year or past
    if (from.getFullYear() > currentYear) {
      from.setFullYear(currentYear);
    }
    if (to.getFullYear() > currentYear) {
      to.setFullYear(currentYear);
    }
    
    // Calculate the valid date range
    const maxDate = new Date(now);
    maxDate.setHours(15, 30, 0, 0); // Set to market closing time
    if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
      maxDate.setDate(maxDate.getDate() - 1); // Use previous day if before market close
    }
    
    // Skip weekends for max date
    while (maxDate.getDay() === 0 || maxDate.getDay() === 6) {
      maxDate.setDate(maxDate.getDate() - 1);
    }
    
    // Calculate minimum date (60 days before max date)
    const minDate = new Date(maxDate);
    minDate.setDate(minDate.getDate() - 60);
    minDate.setHours(9, 15, 0, 0); // Set to market opening time
    
    // Skip weekends for min date
    while (minDate.getDay() === 0 || minDate.getDay() === 6) {
      minDate.setDate(minDate.getDate() + 1);
    }
    
    console.log(`[Backtest ${requestId}] Date range validation:`, {
      selectedStart: from.toISOString(),
      selectedEnd: to.toISOString(),
      maxAllowedDate: maxDate.toISOString(),
      minAllowedDate: minDate.toISOString()
    });

    // Validate date range
    if (from < minDate || from > maxDate) {
      console.log(`[Backtest ${requestId}] Error: Start date out of range`);
      return res.status(400).json({ 
        error: `Start date must be between ${minDate.toISOString().split('T')[0]} and ${maxDate.toISOString().split('T')[0]}`
      });
    }

    if (to < minDate || to > maxDate) {
      console.log(`[Backtest ${requestId}] Error: End date out of range`);
      return res.status(400).json({ 
        error: `End date must be between ${minDate.toISOString().split('T')[0]} and ${maxDate.toISOString().split('T')[0]}`
      });
    }

    // Format dates for Kite API (yyyy-mm-dd hh:mm:ss)
    const formatDateForKite = (date) => {
      const pad = (num) => String(num).padStart(2, '0');
      
      // Extract date components
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      
      // Always use market hours
      const isFromDate = date.getTime() === from.getTime();
      const hours = isFromDate ? '09' : '15';
      const minutes = isFromDate ? '15' : '30';
      const seconds = '00';
      
      // Return in exact Kite format: yyyy-mm-dd hh:mm:ss
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    // Format dates with market hours
    const fromStr = formatDateForKite(from);
    const toStr = formatDateForKite(to);
    
    console.log(`[Backtest ${requestId}] Validated and formatted dates:`, { 
      fromStr,
      toStr,
      maxDate: formatDateForKite(maxDate),
      minDate: formatDateForKite(minDate)
    });

    // Additional validation for future years
    if (from.getFullYear() > new Date().getFullYear() || to.getFullYear() > new Date().getFullYear()) {
      console.log(`[Backtest ${requestId}] Error: Dates cannot be in future years`, {
        fromYear: from.getFullYear(),
        toYear: to.getFullYear(),
        currentYear: new Date().getFullYear()
      });
      return res.status(400).json({ 
        error: 'Dates cannot be in future years. Please select dates from the current year or past.'
      });
    }

    // Map timeframe to Kite interval
    const intervalMap = {
      '1minute': 'minute',
      '5minute': '5minute',
      '15minute': '15minute',
      '30minute': '30minute',
      '60minute': '60minute',
      'day': 'day'
    };
    
    const interval = intervalMap[timeframe];
    if (!interval) {
      console.log(`[Backtest ${requestId}] Error: Invalid timeframe ${timeframe}`);
      return res.status(400).json({ error: 'Invalid timeframe' });
    }

    // Initialize result object with default values
    const result = {
      startDate: fromStr,
      endDate: toStr,
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,  // Initialize to 0
      averageProfit: 0,
      averageLoss: 0,
      sharpeRatio: 0,
      trades: []
    };

    // Process each instrument
    console.log(`[Backtest ${requestId}] Starting instrument processing. Total instruments:`, selectedInstruments.length);
    
    let globalMaxDrawdown = 0;  // Track max drawdown across all instruments
    
    for (const instrumentToken of selectedInstruments) {
      console.log(`[Backtest ${requestId}] Processing instrument:`, instrumentToken);
      
      try {
        // Step 1: Fetch historical data
        console.log(`[Backtest ${requestId}] Fetching historical data for instrument:`, instrumentToken);
        
        // Get instrument details to check if it's a futures contract
        const instruments = await kite.getInstruments(['NFO']);
        const instrument = instruments.find(i => i.instrument_token === parseInt(instrumentToken));
        const isFutures = instrument?.segment === 'NFO-FUT';
        
        try {
          // Prepare request parameters exactly as per Kite API docs
          const params = {
            instrument_token: instrumentToken,
            interval: interval,
            from: fromStr,          // yyyy-mm-dd hh:mm:ss
            to: toStr,             // yyyy-mm-dd hh:mm:ss
            continuous: isFutures ? 1 : 0,  // Pass 1 for futures to get continuous data
            oi: 0                  // We don't need Open Interest data for now
          };
          
          console.log(`[Backtest ${requestId}] Historical data request params:`, params);
          
          // Make a direct API call to match Kite's format
          const url = `https://api.kite.trade/instruments/historical/${instrumentToken}/${interval}`;
          const queryParams = new URLSearchParams({
            from: fromStr,
            to: toStr,
            continuous: params.continuous,
            oi: params.oi
          });

          const response = await fetch(`${url}?${queryParams}`, {
            headers: {
              'X-Kite-Version': '3',
              'Authorization': `token ${process.env.KITE_API_KEY}:${req.user.kiteAccessToken}`
            }
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
          }

          const data = await response.json();
          console.log(`[Backtest ${requestId}] Raw API response:`, JSON.stringify(data, null, 2));

          if (!data || !data.data || !data.data.candles || data.data.candles.length === 0) {
            console.log(`[Backtest ${requestId}] Warning: No historical data available for instrument:`, instrumentToken);
            continue;
          }

          const historicalData = data.data.candles.map(candle => ({
            timestamp: candle[0],
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5],
            oi: candle[6]
          }));

          console.log(`[Backtest ${requestId}] Fetched ${historicalData.length} candles`);
          console.log(`[Backtest ${requestId}] First candle:`, historicalData[0]);
          console.log(`[Backtest ${requestId}] Last candle:`, historicalData[historicalData.length - 1]);

          // Step 2: Process candles and apply strategy
          let position = null;
          let trades = [];
          let runningPnL = 0;
          let peak = 0;
          let maxDrawdown = 0;

          for (let i = 50; i < historicalData.length; i++) {
            const candle = historicalData[i];
            const prevCandles = historicalData.slice(i - 50, i);
            
            // Calculate strategy signals
            const signals = calculateSignals(strategy, candle, prevCandles);
            
            // Handle entry
            if (!position && signals.buy) {
              position = {
                type: 'BUY',
                entryPrice: candle.close,
                entryTime: candle.timestamp,
                quantity: Math.floor(investment / candle.close)
              };
              console.log(`[Backtest ${requestId}] BUY Signal:`, {
                time: candle.timestamp,
                price: candle.close,
                quantity: position.quantity
              });
            }
            
            // Handle exit based on profit target or stop loss
            if (position) {
              const pnlPercent = ((candle.close - position.entryPrice) / position.entryPrice) * 100;
              
              if (pnlPercent >= profitTarget || pnlPercent <= -stopLoss || signals.sell) {
                const pnl = (candle.close - position.entryPrice) * position.quantity;
                runningPnL += pnl;
                
                // Update peak and drawdown
                if (runningPnL > peak) {
                  peak = runningPnL;
                }
                const drawdown = peak - runningPnL;
                if (drawdown > maxDrawdown) {
                  maxDrawdown = drawdown;
                  if (maxDrawdown > globalMaxDrawdown) {
                    globalMaxDrawdown = maxDrawdown;
                  }
                }

                trades.push({
                  entryTime: position.entryTime,
                  exitTime: candle.timestamp,
                  entryPrice: position.entryPrice,
                  exitPrice: candle.close,
                  quantity: position.quantity,
                  pnl,
                  pnlPercent,
                  exitReason: pnlPercent >= profitTarget ? 'TARGET' : 
                             pnlPercent <= -stopLoss ? 'STOPLOSS' : 
                             'SIGNAL'
                });

                position = null;
              }
            }
          }

          // Add trades to result
          result.trades.push(...trades);
          
        } catch (error) {
          console.error(`[Backtest ${requestId}] Error fetching historical data:`, error);
          if (error.response) {
            console.error(`[Backtest ${requestId}] API Response:`, error.response.data);
          }
          continue;
        }
        
      } catch (error) {
        console.error(`[Backtest ${requestId}] Error processing instrument:`, instrumentToken, error);
        continue;
      }
    }

    // Calculate final statistics
    console.log(`[Backtest ${requestId}] Calculating final statistics`);
    result.totalTrades = result.trades.length;
    const profitableTrades = result.trades.filter(t => t.pnl > 0);
    result.winRate = result.totalTrades > 0 ? (profitableTrades.length / result.totalTrades) * 100 : 0;
    result.totalPnL = result.trades.reduce((sum, t) => sum + t.pnl, 0);
    result.maxDrawdown = globalMaxDrawdown;  // Use the tracked global max drawdown

    const profits = result.trades.filter(t => t.pnl > 0).map(t => t.pnl);
    const losses = result.trades.filter(t => t.pnl < 0).map(t => t.pnl);
    
    result.averageProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
    result.averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

    console.log(`[Backtest ${requestId}] Backtest completed successfully`);
    console.log(`[Backtest ${requestId}] Final result:`, JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error(`[Backtest ${requestId}] Fatal error:`, error);
    console.error(`[Backtest ${requestId}] Error stack:`, error.stack);
    res.status(500).json({ error: 'Failed to run backtest', details: error.message });
  }
});

// Helper function to calculate strategy signals
function calculateSignals(strategy, candle, prevCandles) {
  const ltp = candle.close; // Use close price as LTP for historical data
  
  switch (strategy) {
    case 'MovingAverage':
      return calculateMovingAverageSignals(ltp, prevCandles);
    case 'RSI':
      return calculateRSISignals(ltp, prevCandles);
    case 'MACD':
      return calculateMACDSignals(ltp, prevCandles);
    default:
      return { buy: false, sell: false };
  }
}

function calculateMovingAverageSignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  
  // Generate buy signal when shorter MA crosses above longer MA
  const buy = sma20 > sma50 && 
    calculateSMA(prices.slice(0, -1), 20) <= calculateSMA(prices.slice(0, -1), 50);
  
  // Generate sell signal when shorter MA crosses below longer MA
  const sell = sma20 < sma50 && 
    calculateSMA(prices.slice(0, -1), 20) >= calculateSMA(prices.slice(0, -1), 50);
  
  return { buy, sell };
}

function calculateRSISignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const rsi = calculateRSI(prices, 14);
  
  // Buy when RSI crosses above oversold level (30)
  const buy = rsi > 30 && calculateRSI(prices.slice(0, -1), 14) <= 30;
  
  // Sell when RSI crosses below overbought level (70)
  const sell = rsi < 70 && calculateRSI(prices.slice(0, -1), 14) >= 70;
  
  return { buy, sell };
}

function calculateMACDSignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const { macd, signal } = calculateMACD(prices);
  
  // Buy when MACD crosses above signal line
  const buy = macd > signal && 
    calculateMACD(prices.slice(0, -1)).macd <= calculateMACD(prices.slice(0, -1)).signal;
  
  // Sell when MACD crosses below signal line
  const sell = macd < signal && 
    calculateMACD(prices.slice(0, -1)).macd >= calculateMACD(prices.slice(0, -1)).signal;
  
  return { buy, sell };
}

// Helper functions for technical indicators
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
}

function calculateRSI(prices, period) {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const difference = prices[prices.length - i] - prices[prices.length - i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signal = calculateEMA([...Array(prices.length - 26).fill(0), macd], 9);
  
  return { macd, signal };
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

module.exports = router; 