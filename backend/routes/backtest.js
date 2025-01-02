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
    
    // Set time to start of day for 'from' and end of day for 'to'
    from.setHours(9, 15, 0, 0);  // Market opening time
    to.setHours(15, 30, 0, 0);   // Market closing time
    
    // Format dates for Kite API (yyyy-mm-dd HH:mm:ss)
    const formatDateForKite = (date) => {
      const pad = (num) => String(num).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };
    
    // Validate dates
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
    
    if (from > now || to > now) {
      console.log(`[Backtest ${requestId}] Error: Cannot use future dates`);
      return res.status(400).json({ error: 'Cannot use future dates for backtest' });
    }
    
    if (from < sixtyDaysAgo) {
      console.log(`[Backtest ${requestId}] Error: Historical data only available for last 60 days`);
      return res.status(400).json({ error: 'Historical data only available for last 60 days' });
    }
    
    const fromStr = formatDateForKite(from);
    const toStr = formatDateForKite(to);
    
    console.log(`[Backtest ${requestId}] Raw dates:`, { startDate, endDate });
    console.log(`[Backtest ${requestId}] Formatted dates for Kite:`, { fromStr, toStr });
    console.log(`[Backtest ${requestId}] Parsed dates:`, { 
      from: from.toISOString(),
      to: to.toISOString(),
      fromTimestamp: from.getTime(),
      toTimestamp: to.getTime(),
      durationDays: Math.floor((to - from) / (1000 * 60 * 60 * 24))
    });

    // Map timeframe to Kite interval
    const intervalMap = {
      '1minute': 'minute',
      '5minute': '5minute',
      '15minute': '15minute',
      '30minute': '30minute',
      '60minute': '60minute'
    };
    
    const interval = intervalMap[timeframe] || '5minute';
    console.log(`[Backtest ${requestId}] Using interval:`, interval);

    const result = {
      startDate: from.toISOString(),
      endDate: to.toISOString(),
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
    
    for (const instrumentToken of selectedInstruments) {
      console.log(`[Backtest ${requestId}] Processing instrument:`, instrumentToken);
      
      try {
        console.log(`[Backtest ${requestId}] Fetching historical data for instrument:`, instrumentToken);
        // Fetch historical data from Kite
        const historicalData = await kite.getHistoricalData(
          instrumentToken,
          fromStr,
          toStr,
          interval
        );
        
        console.log(`[Backtest ${requestId}] Fetched ${historicalData.length} candles for instrument ${instrumentToken}`);
        console.log(`[Backtest ${requestId}] First candle:`, historicalData[0]);
        console.log(`[Backtest ${requestId}] Last candle:`, historicalData[historicalData.length - 1]);

        if (historicalData.length === 0) {
          console.log(`[Backtest ${requestId}] Warning: No historical data available for instrument:`, instrumentToken);
          continue;
        }

        // Apply strategy to historical data
        console.log(`[Backtest ${requestId}] Applying ${strategy} strategy to historical data`);
        let position = null;
        let trades = [];
        let signalsGenerated = 0;
        let buySignals = 0;
        let sellSignals = 0;

        for (let i = 50; i < historicalData.length; i++) {
          const candle = historicalData[i];
          const prevCandles = historicalData.slice(i - 50, i);
          
          // Calculate indicators based on strategy
          const signals = calculateSignals(strategy, candle, prevCandles);
          signalsGenerated++;
          
          if (signals.buy) buySignals++;
          if (signals.sell) sellSignals++;
          
          if (!position && signals.buy) {
            console.log(`[Backtest ${requestId}] BUY Signal at ${candle.date}, Price: ${candle.close}`);
            position = {
              type: 'BUY',
              entryPrice: candle.close,
              entryDate: new Date(candle.date),
              quantity: Math.floor(investment / candle.close)
            };
          } else if (position && (
            (position.type === 'BUY' && (
              signals.sell || 
              (candle.close >= position.entryPrice * (1 + profitTarget/100)) ||
              (candle.close <= position.entryPrice * (1 - stopLoss/100))
            ))
          )) {
            // Close position
            const pnl = position.type === 'BUY' 
              ? (candle.close - position.entryPrice) * position.quantity
              : (position.entryPrice - candle.close) * position.quantity;
            
            const pnlPercentage = (pnl / (position.entryPrice * position.quantity)) * 100;
            
            console.log(`[Backtest ${requestId}] Position closed:`, {
              entryDate: position.entryDate,
              exitDate: candle.date,
              entryPrice: position.entryPrice,
              exitPrice: candle.close,
              pnl,
              pnlPercentage
            });
            
            trades.push({
              entry_date: position.entryDate.toISOString(),
              exit_date: new Date(candle.date).toISOString(),
              type: position.type,
              quantity: position.quantity,
              entry_price: position.entryPrice,
              exit_price: candle.close,
              pnl: pnl,
              pnl_percentage: pnlPercentage
            });
            
            position = null;
          }
        }

        console.log(`[Backtest ${requestId}] Strategy statistics:`, {
          signalsGenerated,
          buySignals,
          sellSignals,
          tradesExecuted: trades.length
        });

        // Add trades to result
        result.trades.push(...trades);
        
      } catch (error) {
        console.error(`[Backtest ${requestId}] Error processing instrument:`, instrumentToken, error);
        continue;
      }
    }

    // Calculate summary statistics
    console.log(`[Backtest ${requestId}] Calculating final statistics`);
    result.totalTrades = result.trades.length;
    const profitableTrades = result.trades.filter(t => t.pnl > 0);
    result.winRate = (profitableTrades.length / result.totalTrades) * 100;
    result.totalPnL = result.trades.reduce((sum, t) => sum + t.pnl, 0);
    
    const profits = result.trades.filter(t => t.pnl > 0).map(t => t.pnl);
    const losses = result.trades.filter(t => t.pnl < 0).map(t => t.pnl);
    
    result.averageProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
    result.averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    
    console.log(`[Backtest ${requestId}] Performance metrics:`, {
      totalTrades: result.totalTrades,
      profitableTrades: profitableTrades.length,
      winRate: result.winRate,
      totalPnL: result.totalPnL,
      averageProfit: result.averageProfit,
      averageLoss: result.averageLoss
    });

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;
    
    result.trades.forEach(trade => {
      runningPnL += trade.pnl;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    
    result.maxDrawdown = -maxDrawdown;
    console.log(`[Backtest ${requestId}] Max drawdown:`, maxDrawdown);
    
    // Sort trades by date and only keep the last 5 for display
    result.trades.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    result.trades = result.trades.slice(0, 5);

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
function calculateSignals(strategy, currentCandle, prevCandles) {
  switch (strategy) {
    case 'MOVING_AVERAGE':
      return calculateMovingAverageSignals(currentCandle, prevCandles);
    case 'RSI':
      return calculateRSISignals(currentCandle, prevCandles);
    case 'MACD':
      return calculateMACDSignals(currentCandle, prevCandles);
    default:
      return { buy: false, sell: false };
  }
}

function calculateMovingAverageSignals(currentCandle, prevCandles) {
  // Calculate 20-period and 50-period moving averages
  const ma20 = calculateMA(prevCandles.slice(-20));
  const ma50 = calculateMA(prevCandles.slice(-50));
  const prevMa20 = calculateMA(prevCandles.slice(-21, -1));
  const prevMa50 = calculateMA(prevCandles.slice(-51, -1));

  return {
    buy: prevMa20 <= prevMa50 && ma20 > ma50,
    sell: prevMa20 >= prevMa50 && ma20 < ma50
  };
}

function calculateRSISignals(currentCandle, prevCandles) {
  const rsi = calculateRSI(prevCandles);
  return {
    buy: rsi < 30,
    sell: rsi > 70
  };
}

function calculateMACDSignals(currentCandle, prevCandles) {
  const { macd, signal } = calculateMACD(prevCandles);
  const prevMacd = macd[macd.length - 2];
  const prevSignal = signal[signal.length - 2];
  const currentMacd = macd[macd.length - 1];
  const currentSignal = signal[signal.length - 1];

  return {
    buy: prevMacd <= prevSignal && currentMacd > currentSignal,
    sell: prevMacd >= prevSignal && currentMacd < currentSignal
  };
}

function calculateMA(candles) {
  const sum = candles.reduce((acc, candle) => acc + candle.close, 0);
  return sum / candles.length;
}

function calculateRSI(candles, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < period + 1; i++) {
    const change = candles[candles.length - i].close - candles[candles.length - i - 1].close;
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(candles) {
  const ema12 = calculateEMA(candles.map(c => c.close), 12);
  const ema26 = calculateEMA(candles.map(c => c.close), 26);
  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = calculateEMA(macd, 9);
  return { macd, signal };
}

function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = [values[0]];
  
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  
  return ema;
}

module.exports = router; 