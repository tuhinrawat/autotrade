const express = require('express');
const router = express.Router();
const KiteConnect = require('kiteconnect').KiteConnect;
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BacktestResult = require('../models/BacktestResult');
const technicalIndicators = require('technicalindicators');

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

// Add endpoint to get paginated backtest results
router.get('/results', authenticateJWT, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const results = await BacktestResult.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BacktestResult.countDocuments({ user: req.user._id });

    res.json({
      results,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching backtest results:', error);
    res.status(500).json({ error: 'Failed to fetch backtest results' });
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
      maxDrawdown: 0,
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
              
              if (pnlPercent >= signals.profitTarget || pnlPercent <= -signals.stopLoss || signals.sell) {
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
                  exitReason: pnlPercent >= signals.profitTarget ? 'TARGET' : 
                             pnlPercent <= -signals.stopLoss ? 'STOPLOSS' : 
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
    
    // Fetch instrument details for saving
    const instrumentDetails = await kite.getInstruments(['NSE']);
    const selectedInstrument = instrumentDetails.find(i => i.instrument_token === selectedInstruments[0]);
    
    if (!selectedInstrument) {
      console.log(`[Backtest ${requestId}] Error: Instrument not found`);
      return res.status(400).json({ error: 'Selected instrument not found' });
    }

    const backtestResult = new BacktestResult({
      user: req.user._id,
      strategy,
      timeframe,
      startDate: fromStr,
      endDate: toStr,
      investment,
      profitTarget,
      stopLoss,
      instrument: {
        token: selectedInstruments[0],
        symbol: selectedInstrument.tradingsymbol,
        exchange: selectedInstrument.exchange
      },
      totalTrades: result.totalTrades,
      winRate: result.winRate,
      totalPnL: result.totalPnL,
      maxDrawdown: result.maxDrawdown,
      averageProfit: result.averageProfit,
      averageLoss: result.averageLoss,
      trades: result.trades
    });

    await backtestResult.save();
    console.log(`[Backtest ${requestId}] Result saved to database with ID:`, backtestResult._id);

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
  const ltp = candle.close;
  const prices = [...prevCandles.map(c => c.close), ltp];
  const highs = [...prevCandles.map(c => c.high), candle.high];
  const lows = [...prevCandles.map(c => c.low), candle.low];
  const volumes = [...prevCandles.map(c => c.volume), candle.volume];
  
  switch (strategy) {
    case 'MovingAverage':
      return calculateMovingAverageSignals(ltp, prevCandles);
    case 'RSI':
      return calculateRSISignals(ltp, prevCandles);
    case 'MACD':
      return calculateMACDSignals(ltp, prevCandles);
    case 'BollingerBands':
      return calculateBollingerBandsSignals(ltp, prevCandles);
    case 'Supertrend':
      return calculateSupertrendSignals(candle, prevCandles);
    case 'EnhancedRSI':
      return calculateEnhancedRSISignals(ltp, prevCandles);
    case 'VolumeWeighted':
      return calculateVolumeWeightedSignals(candle, prevCandles);
    case 'StochRSI':
      return calculateStochRSISignals(prices);
    case 'ADX':
      return calculateADXSignals(highs, lows, prices);
    case 'IchimokuCloud':
      return calculateIchimokuSignals(highs, lows, prices);
    case 'PSAR':
      return calculatePSARSignals(highs, lows, prices);
    default:
      return { buy: false, sell: false, profitTarget: null, stopLoss: null };
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
  
  // Dynamic targets based on MA spread
  const spread = Math.abs(sma20 - sma50);
  const profitTarget = (spread / ltp) * 200; // 2x the MA spread
  const stopLoss = (spread / ltp) * 100; // 1x the MA spread
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateRSISignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const rsi = calculateRSI(prices, 14);
  
  // Buy when RSI crosses above oversold level (30)
  const buy = rsi > 30 && calculateRSI(prices.slice(0, -1), 14) <= 30;
  
  // Sell when RSI crosses below overbought level (70)
  const sell = rsi < 70 && calculateRSI(prices.slice(0, -1), 14) >= 70;
  
  // Dynamic targets based on RSI extremes
  const profitTarget = rsi < 30 ? 2.5 : (100 - rsi) / 10;
  const stopLoss = rsi < 30 ? 1.2 : (100 - rsi) / 20;
  
  return { buy, sell, profitTarget, stopLoss };
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
  
  // Dynamic targets based on MACD histogram
  const histogram = Math.abs(macd - signal);
  const profitTarget = Math.max(1.5, (histogram / ltp) * 200);
  const stopLoss = Math.min(1, (histogram / ltp) * 100);
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateBollingerBandsSignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const period = 20;
  const stdDev = 2;
  
  const sma = calculateSMA(prices, period);
  const standardDeviation = calculateStandardDeviation(prices.slice(-period));
  
  const upperBand = sma + (standardDeviation * stdDev);
  const lowerBand = sma - (standardDeviation * stdDev);
  
  // Buy when price crosses below lower band
  const buy = ltp <= lowerBand && prevCandles[prevCandles.length-1].close > lowerBand;
  
  // Sell when price crosses above upper band
  const sell = ltp >= upperBand && prevCandles[prevCandles.length-1].close < upperBand;
  
  // Dynamic targets based on band width
  const bandWidth = upperBand - lowerBand;
  const profitTarget = (bandWidth / ltp) * 100; // Use band width for profit target
  const stopLoss = (bandWidth / 2 / ltp) * 100; // Half band width for stop loss
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateSupertrendSignals(candle, prevCandles) {
  const period = 10;
  const multiplier = 3;
  const atr = calculateATR([...prevCandles, candle], period);
  
  const basicUpperBand = (candle.high + candle.low) / 2 + multiplier * atr;
  const basicLowerBand = (candle.high + candle.low) / 2 - multiplier * atr;
  
  const prevClose = prevCandles[prevCandles.length-1].close;
  const prevHigh = prevCandles[prevCandles.length-1].high;
  const prevLow = prevCandles[prevCandles.length-1].low;
  
  // Trend determination
  const uptrend = candle.close > basicUpperBand;
  const prevUptrend = prevClose > ((prevHigh + prevLow) / 2 + multiplier * atr);
  
  const buy = uptrend && !prevUptrend;
  const sell = !uptrend && prevUptrend;
  
  // Dynamic targets based on ATR
  const profitTarget = (atr * 3 / candle.close) * 100;
  const stopLoss = (atr * 1.5 / candle.close) * 100;
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateEnhancedRSISignals(ltp, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), ltp];
  const rsi = calculateRSI(prices, 14);
  const prevRSI = calculateRSI(prices.slice(0, -1), 14);
  
  // Enhanced entry conditions
  const buy = (rsi < 30 && prevRSI >= 30) || // Oversold condition
             (rsi > 30 && prevRSI <= 30 && calculateSMA(prices, 20) > calculateSMA(prices, 50)); // RSI crosses up with trend
             
  const sell = (rsi > 70 && prevRSI <= 70) || // Overbought condition
               (rsi < 70 && prevRSI >= 70 && calculateSMA(prices, 20) < calculateSMA(prices, 50)); // RSI crosses down with trend
  
  // Dynamic targets based on RSI value
  const profitTarget = rsi < 30 ? 2 * (30 - rsi) : 1.5;
  const stopLoss = rsi < 30 ? (30 - rsi) / 2 : 1;
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateVolumeWeightedSignals(candle, prevCandles) {
  const prices = [...prevCandles.map(c => c.close), candle.close];
  const volumes = [...prevCandles.map(c => c.volume), candle.volume];
  
  const vwap = calculateVWAP(prices, volumes);
  const prevVWAP = calculateVWAP(prices.slice(0, -1), volumes.slice(0, -1));
  
  // Volume surge detection
  const avgVolume = calculateSMA(volumes.slice(-20), 20);
  const volumeSurge = candle.volume > avgVolume * 1.5;
  
  // Price momentum
  const momentum = (candle.close - prevCandles[prevCandles.length-1].close) / prevCandles[prevCandles.length-1].close;
  
  const buy = candle.close > vwap && volumeSurge && momentum > 0;
  const sell = candle.close < vwap && volumeSurge && momentum < 0;
  
  // Dynamic targets based on volume and momentum
  const volatility = calculateStandardDeviation(prices.slice(-20)) / calculateSMA(prices.slice(-20), 20);
  const profitTarget = Math.max(1.5, volatility * 100 * 2);
  const stopLoss = Math.min(1, volatility * 100);
  
  return { buy, sell, profitTarget, stopLoss };
}

function calculateStandardDeviation(prices) {
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / prices.length;
  return Math.sqrt(variance);
}

function calculateATR(candles, period) {
  const trs = candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    
    const prevClose = candles[i-1].close;
    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose)
    );
    return tr;
  });
  
  return calculateSMA(trs.slice(-period), period);
}

function calculateVWAP(prices, volumes) {
  const typicalPrices = prices.map((price, i) => price * volumes[i]);
  const sumTypicalPrices = typicalPrices.reduce((sum, tp) => sum + tp, 0);
  const sumVolumes = volumes.reduce((sum, vol) => sum + vol, 0);
  return sumTypicalPrices / sumVolumes;
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

function calculateStochRSISignals(prices) {
  const period = 14;
  const stochRSI = technicalIndicators.StochasticRSI.calculate({
    values: prices,
    rsiPeriod: period,
    stochasticPeriod: period,
    kPeriod: 3,
    dPeriod: 3
  });

  const current = stochRSI[stochRSI.length - 1];
  const previous = stochRSI[stochRSI.length - 2];

  // Buy when K line crosses above D line in oversold territory
  const buy = current.k > current.d && previous.k <= previous.d && current.k < 20;
  
  // Sell when K line crosses below D line in overbought territory
  const sell = current.k < current.d && previous.k >= previous.d && current.k > 80;

  // Dynamic targets based on StochRSI values
  const profitTarget = (100 - current.k) / 20; // Higher target when oversold
  const stopLoss = current.k / 40; // Tighter stop when overbought

  return { buy, sell, profitTarget, stopLoss };
}

function calculateADXSignals(highs, lows, prices) {
  const period = 14;
  const adx = technicalIndicators.ADX.calculate({
    high: highs,
    low: lows,
    close: prices,
    period
  });

  const current = adx[adx.length - 1];
  const previous = adx[adx.length - 2];

  // Buy when ADX is rising and above 25 (strong trend)
  const buy = current.adx > 25 && current.adx > previous.adx && current.pdi > current.mdi;
  
  // Sell when ADX is falling or PDI crosses below MDI
  const sell = (current.adx < previous.adx && current.adx > 25) || (current.pdi < current.mdi);

  // Dynamic targets based on trend strength
  const profitTarget = current.adx / 10;
  const stopLoss = current.adx / 20;

  return { buy, sell, profitTarget, stopLoss };
}

function calculateIchimokuSignals(highs, lows, prices) {
  const ichimoku = technicalIndicators.IchimokuCloud.calculate({
    high: highs,
    low: lows,
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26
  });

  const current = ichimoku[ichimoku.length - 1];
  const price = prices[prices.length - 1];

  // Buy when price crosses above the cloud and conversion line crosses base line
  const buy = price > current.spanA && price > current.spanB && 
              current.conversion > current.base;

  // Sell when price crosses below the cloud and conversion line crosses below base line
  const sell = price < current.spanA && price < current.spanB && 
               current.conversion < current.base;

  // Dynamic targets based on cloud thickness
  const cloudThickness = Math.abs(current.spanA - current.spanB);
  const profitTarget = (cloudThickness / price) * 200;
  const stopLoss = (cloudThickness / price) * 100;

  return { buy, sell, profitTarget, stopLoss };
}

function calculatePSARSignals(highs, lows, prices) {
  const psar = technicalIndicators.PSAR.calculate({
    high: highs,
    low: lows,
    step: 0.02,
    max: 0.2
  });

  const current = psar[psar.length - 1];
  const price = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const prevPSAR = psar[psar.length - 2];

  // Buy when price crosses above PSAR
  const buy = price > current && prevPrice <= prevPSAR;
  
  // Sell when price crosses below PSAR
  const sell = price < current && prevPrice >= prevPSAR;

  // Dynamic targets based on price movement
  const atr = calculateATR([...highs], [...lows], [...prices], 14);
  const profitTarget = (atr / price) * 300;
  const stopLoss = (atr / price) * 150;

  return { buy, sell, profitTarget, stopLoss };
}

module.exports = router; 