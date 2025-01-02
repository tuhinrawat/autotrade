import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import api from '../services/api';
import { BacktestConfig, Instrument, AccountDetails as ApiAccountDetails } from '../types/api';
import { AxiosError } from 'axios';
import {
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Box,
  Alert,
  FormControlLabel,
  Switch,
  LinearProgress,
  InputAdornment
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import InstrumentSearchWrapper from '../components/InstrumentSearchWrapper';

interface Trade {
  instrument_token: number;
  order_id: string;
  tradingsymbol: string;
  exchange: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  average_price: number;
  product: string;
  status: string;
  order_timestamp: string;
  ltp: number;
  pnl: number;
  pnl_percentage: number;
  filled_quantity?: number;
  pending_quantity?: number;
  cancelled_quantity?: number;
  trade_type: 'MANUAL' | 'AUTO';
  is_open: boolean;
}

interface OrderParams {
  variety: 'regular' | 'amo' | 'co' | 'iceberg' | 'auction';
  exchange: string;
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: 'CNC' | 'NRML' | 'MIS';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price?: number;
  trigger_price?: number;
  validity: 'DAY' | 'IOC' | 'TTL';
  disclosed_quantity?: number;
  ttl_minutes?: number;
}

interface WebSocketTick {
  instrument_token: number;
  last_price: number;
  volume: number;
  change: number;
}

interface TradeSummary {
  total_trades: number;
  open_trades: number;
  closed_trades: number;
  manual_trades: number;
  auto_trades: number;
  total_pnl: number;
  total_pnl_percentage: number;
}

const Trade: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const [error, setError] = useState<string | null>(null);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [loading, setLoading] = useState(true);
  const [instrumentTokens, setInstrumentTokens] = useState<number[]>([]);
  const [tradeSummary, setTradeSummary] = useState<TradeSummary>({
    total_trades: 0,
    open_trades: 0,
    closed_trades: 0,
    manual_trades: 0,
    auto_trades: 0,
    total_pnl: 0,
    total_pnl_percentage: 0
  });

  // Manual trading state
  const [orderParams, setOrderParams] = useState<OrderParams>({
    variety: 'regular',
    exchange: 'NSE',
    tradingsymbol: '',
    transaction_type: 'BUY',
    quantity: 0,
    product: 'CNC',
    order_type: 'MARKET',
    validity: 'DAY'
  });

  // Auto trading state
  const [tradingMode, setTradingMode] = useState<'realtime' | 'simulation'>('simulation');
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [strategy, setStrategy] = useState('');
  const [timeframe, setTimeframe] = useState('5minute');
  const [backtestStartDate, setBacktestStartDate] = useState('');
  const [backtestEndDate, setBacktestEndDate] = useState('');
  const [investment, setInvestment] = useState(0);
  const [profitTarget, setProfitTarget] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [initializingLiveTrading, setInitializingLiveTrading] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);

  // Keep the instruments state for backward compatibility
  const [instruments] = useState<Instrument[]>([]);
  const [loadingInstruments] = useState<boolean>(false);

  // Use instruments and loadingInstruments in a useEffect for backward compatibility
  useEffect(() => {
    const checkInstruments = () => {
      const hasInstruments = instruments.length > 0;
      const isLoading = loadingInstruments;
      return { hasInstruments, isLoading };
    };
    checkInstruments();
  }, [instruments, loadingInstruments]);

  // Authentication check
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Add validation for backtest and live trading
  const isValidForBacktest = selectedInstrument && strategy && timeframe && investment > 0 && profitTarget > 0 && stopLoss > 0 && 
    (tradingMode === 'realtime' || (tradingMode === 'simulation' && backtestStartDate && backtestEndDate));
  
  // Debug logging for validation
  useEffect(() => {
    console.log('Validation state:', {
      selectedInstrument: !!selectedInstrument,
      strategy: !!strategy,
      timeframe: !!timeframe,
      investment: investment > 0,
      profitTarget: profitTarget > 0,
      stopLoss: stopLoss > 0,
      tradingMode,
      backtestStartDate: !!backtestStartDate,
      backtestEndDate: !!backtestEndDate,
      isValidForBacktest
    });
  }, [selectedInstrument, strategy, timeframe, investment, profitTarget, stopLoss, tradingMode, backtestStartDate, backtestEndDate, isValidForBacktest]);

  const isValidForLiveTrading = isValidForBacktest && investment <= availableBalance;

  // Load account balance
  useEffect(() => {
    const loadAccountBalance = async () => {
      try {
        const response = await api.get<ApiAccountDetails>('/auth/user');
        setAvailableBalance(response.data.balance);
      } catch (error) {
        console.error('Error loading account balance:', error);
        setError('Failed to load account balance');
      }
    };
    loadAccountBalance();
  }, []);

  // Handle order parameter changes
  const handleOrderParamChange = (param: keyof OrderParams, value: string | number) => {
    setOrderParams(prev => ({
      ...prev,
      [param]: value
    }));
  };

  // Handle manual trade submission
  const handleManualTradeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/orders', {
        symbol: orderParams.tradingsymbol,
        type: orderParams.transaction_type,
        quantity: orderParams.quantity,
        price: orderParams.price || 0
      });
      
      // Clear form
      setOrderParams(prev => ({
        ...prev,
        tradingsymbol: '',
        quantity: 0,
        price: undefined,
        trigger_price: undefined,
        disclosed_quantity: undefined
      }));
      
      // Reload active trades
      loadActiveTrades();
    } catch (error) {
      console.error('Error placing order:', error);
      setError('Failed to place order');
    }
  };

  // Handle auto trading toggle
  const handleAutoTradingToggle = async () => {
    try {
      const newState = !isAutoTrading;
      setIsAutoTrading(newState);
      
      // Call API to update auto trading status
      // ... implementation ...
    } catch (error) {
      console.error('Error updating auto trading status:', error);
      setError('Failed to update auto trading status');
      setIsAutoTrading(!isAutoTrading); // Revert state on error
    }
  };

  // Calculate trade summary
  const calculateTradeSummary = (trades: Trade[]): TradeSummary => {
    return {
      total_trades: trades.length,
      open_trades: trades.filter(t => t.is_open).length,
      closed_trades: trades.filter(t => !t.is_open).length,
      manual_trades: trades.filter(t => t.trade_type === 'MANUAL').length,
      auto_trades: trades.filter(t => t.trade_type === 'AUTO').length,
      total_pnl: trades.reduce((sum, t) => sum + (t.pnl || 0), 0),
      total_pnl_percentage: trades.reduce((sum, t) => sum + (t.pnl_percentage || 0), 0)
    };
  };

  // Load active trades
  const loadActiveTrades = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<Trade[]>('/orders');
      setActiveTrades(response.data);
      
      // Update trade summary
      const summary = calculateTradeSummary(response.data);
      setTradeSummary(summary);
      
      // Update instrument tokens for WebSocket
      const tokens = response.data
        .filter(trade => trade.is_open)
        .map(trade => trade.instrument_token);
      setInstrumentTokens(tokens);
    } catch (error) {
      console.error('Error loading active trades:', error);
      setError('Failed to load active trades');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle backtest
  const handleBacktest = async () => {
    if (!selectedInstrument || !isValidForBacktest) {
      setError('Please fill all required fields');
      return;
    }

    setRunningBacktest(true);
    setError(null);

    try {
      // Log the config for debugging
      const config: BacktestConfig = {
        instrument: selectedInstrument,
        startDate: backtestStartDate,
        endDate: backtestEndDate,
        capital: investment,
        strategy: strategy,
        params: {
          profitTarget,
          stopLoss,
          timeframe
        }
      };

      console.log('Sending backtest config:', config);

      const results = await api.post('/backtest', config);
      console.log('Backtest results:', results.data);

      // TODO: Show backtest results in UI
      // For now, just show a success message
      setError('Backtest completed successfully');
    } catch (error) {
      console.error('Backtest error:', error);
      if (error instanceof AxiosError && error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('Failed to run backtest. Please check the parameters.');
      }
    } finally {
      setRunningBacktest(false);
    }
  };

  // Handle start live trading
  const handleStartLiveTrading = async () => {
    if (!isValidForLiveTrading || !selectedInstrument) {
      return;
    }

    try {
      setInitializingLiveTrading(true);
      // Call API to initialize live trading
      // ... implementation ...
    } catch (error) {
      console.error('Error initializing live trading:', error);
      setError('Failed to initialize live trading');
    } finally {
      setInitializingLiveTrading(false);
    }
  };

  // Update trades with WebSocket ticks
  const updateTrades = useCallback((ticks: WebSocketTick[]) => {
    if (!Array.isArray(ticks) || ticks.length === 0) {
      console.warn('Invalid or empty ticks data received:', ticks);
      return;
    }

    setActiveTrades((prevTrades: Trade[]) => {
      if (!Array.isArray(prevTrades)) {
        console.warn('Invalid trades state:', prevTrades);
        return [];
      }

      return prevTrades.map((trade: Trade) => {
        if (!trade || typeof trade.instrument_token === 'undefined') {
          return trade;
        }

        const tick = ticks.find(t => t && typeof t.instrument_token !== 'undefined' && t.instrument_token === trade.instrument_token);
        if (tick && typeof tick.last_price === 'number') {
          const newPrice = tick.last_price;
          const priceDiff = newPrice - trade.average_price;
          const pnl = priceDiff * trade.quantity * (trade.transaction_type === 'BUY' ? 1 : -1);
          const pnlPercentage = (pnl / (trade.average_price * trade.quantity)) * 100;
          
          return {
            ...trade,
            ltp: newPrice,
            pnl,
            pnl_percentage: pnlPercentage
          };
        }
        return trade;
      });
    });
  }, []);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      
      if (!data || typeof data !== 'object') {
        console.warn('Invalid WebSocket message format:', data);
        return;
      }

      if (data.type === 'tick' && Array.isArray(data.ticks) && data.ticks.length > 0) {
        updateTrades(data.ticks);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, [updateTrades]);

  // Connect WebSocket
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectTimeout, setReconnectTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);

  const connectWebSocket = useCallback(() => {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING || isConnecting) {
      console.log('WebSocket already connected or connecting, skipping...');
      return;
    }

    // Don't try to connect if not authenticated
    if (!isAuthenticated) {
      console.log('Not authenticated, skipping WebSocket connection');
      return;
    }

    setIsConnecting(true);
    setWsError(null);

    const kiteToken = localStorage.getItem('kite_access_token');
    if (!kiteToken) {
      console.error('No Kite access token found');
      setWsError('No Kite access token found. Please login again.');
      setIsConnecting(false);
      return;  // Don't navigate to login, let the auth check handle it
    }

    try {
      console.log('Connecting to WebSocket...');
      const socket = new WebSocket(`ws://localhost:8000/ws?token=${kiteToken}`);
      
      socket.onopen = () => {
        console.log('WebSocket connected');
        setWs(socket);
        setIsConnecting(false);
        setWsError(null);
        // Subscribe to instrument tokens only if we have any
        if (instrumentTokens.length > 0) {
          console.log('Subscribing to tokens:', instrumentTokens);
          socket.send(JSON.stringify({
            type: 'subscribe',
            tokens: instrumentTokens
          }));
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setWs(null);
        setIsConnecting(false);
        
        // Only attempt to reconnect if we're still authenticated and it wasn't a clean close
        if (isAuthenticated && event.code !== 1000 && event.code !== 1008) {
          // Clear any existing reconnect timeout
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
          }
          // Attempt to reconnect after 5 seconds
          const timeout = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
          }, 5000);
          setReconnectTimeout(timeout);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsError('WebSocket connection error. Please try refreshing the page.');
        setIsConnecting(false);
      };

      socket.onmessage = handleWebSocketMessage;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setWsError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [ws, instrumentTokens, isAuthenticated, handleWebSocketMessage, isConnecting, reconnectTimeout]);

  // Connect WebSocket when component mounts or auth changes
  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      if (isAuthenticated && mounted && !ws && !isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Add delay before connecting
        connectWebSocket();
      }
    };

    connect();

    return () => {
      mounted = false;
      if (ws) {
        console.log('Closing WebSocket connection...');
        ws.close(1000, 'Component unmounting');
        setWs(null);
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      setIsConnecting(false);
    };
  }, [isAuthenticated, ws, connectWebSocket, isConnecting, reconnectTimeout]);

  // Update WebSocket subscription when instrument tokens change
  useEffect(() => {
    if (ws?.readyState === WebSocket.OPEN && instrumentTokens.length > 0) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        tokens: instrumentTokens
      }));
    }
  }, [ws, instrumentTokens]);

  // Load trades on mount and authentication change
  useEffect(() => {
    if (isAuthenticated) {
      loadActiveTrades();
    }
  }, [isAuthenticated, loadActiveTrades]);

  // Render loading state
  if (loading || authLoading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  // Render main content
  return (
    <Container maxWidth="lg">
      {(error || wsError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || wsError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Manual Trading Section */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Manual Trading
            </Typography>
            <form onSubmit={handleManualTradeSubmit}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Variety</InputLabel>
                    <Select
                      value={orderParams.variety}
                      onChange={(e) => handleOrderParamChange('variety', e.target.value)}
                      label="Variety"
                    >
                      <MenuItem value="regular">Regular</MenuItem>
                      <MenuItem value="amo">After Market</MenuItem>
                      <MenuItem value="co">Cover</MenuItem>
                      <MenuItem value="iceberg">Iceberg</MenuItem>
                      <MenuItem value="auction">Auction</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Exchange</InputLabel>
                    <Select
                      value={orderParams.exchange}
                      onChange={(e) => handleOrderParamChange('exchange', e.target.value)}
                      label="Exchange"
                    >
                      <MenuItem value="NSE">NSE</MenuItem>
                      <MenuItem value="BSE">BSE</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Trading Symbol"
                    value={orderParams.tradingsymbol}
                    onChange={(e) => handleOrderParamChange('tradingsymbol', e.target.value)}
                    required
                    helperText="Example: RELIANCE, SBIN, etc."
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Transaction Type</InputLabel>
                    <Select
                      value={orderParams.transaction_type}
                      onChange={(e) => handleOrderParamChange('transaction_type', e.target.value)}
                      label="Transaction Type"
                    >
                      <MenuItem value="BUY">Buy</MenuItem>
                      <MenuItem value="SELL">Sell</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Product</InputLabel>
                    <Select
                      value={orderParams.product}
                      onChange={(e) => handleOrderParamChange('product', e.target.value)}
                      label="Product"
                    >
                      <MenuItem value="CNC">CNC (Cash & Carry)</MenuItem>
                      <MenuItem value="NRML">NRML (Normal)</MenuItem>
                      <MenuItem value="MIS">MIS (Intraday)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Order Type</InputLabel>
                    <Select
                      value={orderParams.order_type}
                      onChange={(e) => handleOrderParamChange('order_type', e.target.value)}
                      label="Order Type"
                    >
                      <MenuItem value="MARKET">Market</MenuItem>
                      <MenuItem value="LIMIT">Limit</MenuItem>
                      <MenuItem value="SL">Stop Loss</MenuItem>
                      <MenuItem value="SL-M">Stop Loss Market</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Quantity</InputLabel>
                    <Select
                      value={orderParams.quantity || ''}
                      onChange={(e) => handleOrderParamChange('quantity', Number(e.target.value))}
                      label="Quantity"
                    >
                      {Array.from({ length: 100 }, (_, index) => (
                        <MenuItem key={`qty-${index}`} value={index + 1}>
                          {index + 1}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {(orderParams.order_type === 'LIMIT' || orderParams.order_type === 'SL') && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Price"
                      type="number"
                      value={orderParams.price || ''}
                      onChange={(e) => handleOrderParamChange('price', parseFloat(e.target.value))}
                      required
                      inputProps={{ step: "0.05" }}
                    />
                  </Grid>
                )}

                {(orderParams.order_type === 'SL' || orderParams.order_type === 'SL-M') && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Trigger Price"
                      type="number"
                      value={orderParams.trigger_price || ''}
                      onChange={(e) => handleOrderParamChange('trigger_price', parseFloat(e.target.value))}
                      required
                      inputProps={{ step: "0.05" }}
                    />
                  </Grid>
                )}

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Validity</InputLabel>
                    <Select
                      value={orderParams.validity}
                      onChange={(e) => handleOrderParamChange('validity', e.target.value)}
                      label="Validity"
                    >
                      <MenuItem value="DAY">Day</MenuItem>
                      <MenuItem value="IOC">Immediate or Cancel</MenuItem>
                      <MenuItem value="TTL">Time to Live</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {orderParams.variety === 'iceberg' && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Disclosed Quantity"
                      type="number"
                      value={orderParams.disclosed_quantity || ''}
                      onChange={(e) => handleOrderParamChange('disclosed_quantity', parseInt(e.target.value))}
                      required
                    />
                  </Grid>
                )}

                {orderParams.validity === 'TTL' && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="TTL (minutes)"
                      type="number"
                      value={orderParams.ttl_minutes || ''}
                      onChange={(e) => handleOrderParamChange('ttl_minutes', parseInt(e.target.value))}
                      required
                    />
                  </Grid>
                )}

                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    size="large"
                  >
                    Place Order
                  </Button>
                </Grid>
              </Grid>
            </form>
          </Paper>
        </Grid>

        {/* Auto Trading Section */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Auto Trading
            </Typography>
            <Grid container spacing={2}>
              {/* Mode Selection */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Trading Mode</InputLabel>
                  <Select
                    value={tradingMode}
                    onChange={(e) => setTradingMode(e.target.value as 'realtime' | 'simulation')}
                    label="Trading Mode"
                  >
                    <MenuItem value="realtime">Real-time Trading</MenuItem>
                    <MenuItem value="simulation">Simulation</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Instrument Selection */}
              <Grid item xs={12}>
                <InstrumentSearchWrapper
                  value={selectedInstrument}
                  onChange={setSelectedInstrument}
                />
              </Grid>

              {/* Strategy Selection */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Strategy</InputLabel>
                  <Select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    label="Strategy"
                  >
                    <MenuItem value="MOVING_AVERAGE">Moving Average Crossover</MenuItem>
                    <MenuItem value="RSI">RSI Strategy</MenuItem>
                    <MenuItem value="MACD">MACD Strategy</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Timeframe Selection */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Timeframe</InputLabel>
                  <Select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    label="Timeframe"
                  >
                    <MenuItem value="1minute">1 Minute</MenuItem>
                    <MenuItem value="5minute">5 Minutes</MenuItem>
                    <MenuItem value="15minute">15 Minutes</MenuItem>
                    <MenuItem value="30minute">30 Minutes</MenuItem>
                    <MenuItem value="60minute">1 Hour</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Date Range Selection for Backtest */}
              {tradingMode === 'simulation' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Start Date"
                      type="date"
                      value={backtestStartDate}
                      onChange={(e) => setBacktestStartDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      required
                      inputProps={{
                        max: new Date().toISOString().split('T')[0]
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="End Date"
                      type="date"
                      value={backtestEndDate}
                      onChange={(e) => setBacktestEndDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      required
                      inputProps={{
                        max: new Date().toISOString().split('T')[0]
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Investment Amount"
                      type="number"
                      value={investment || ''}
                      onChange={(e) => setInvestment(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      InputProps={{
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Profit Target %"
                      type="number"
                      value={profitTarget || ''}
                      onChange={(e) => setProfitTarget(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Stop Loss %"
                      type="number"
                      value={stopLoss || ''}
                      onChange={(e) => setStopLoss(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                </>
              )}

              {/* Live Trading Parameters */}
              {tradingMode === 'realtime' && (
                <>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Investment Amount"
                      type="number"
                      value={investment || ''}
                      onChange={(e) => setInvestment(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      error={investment > availableBalance}
                      helperText={investment > availableBalance ? 
                        `Amount exceeds available balance (₹${availableBalance})` : 
                        `Available balance: ₹${availableBalance}`}
                      InputProps={{
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Profit Target %"
                      type="number"
                      value={profitTarget || ''}
                      onChange={(e) => setProfitTarget(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Stop Loss %"
                      type="number"
                      value={stopLoss || ''}
                      onChange={(e) => setStopLoss(e.target.value ? parseFloat(e.target.value) : 0)}
                      required
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        inputProps: { min: 0 }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={isAutoTrading}
                          onChange={handleAutoTradingToggle}
                          color="primary"
                          disabled={!isValidForLiveTrading}
                        />
                      }
                      label="Enable Live Trading"
                    />
                    {!isValidForLiveTrading && (
                      <Typography variant="caption" color="error">
                        Please fill all required fields and ensure investment amount is within limits
                      </Typography>
                    )}
                  </Grid>
                </>
              )}

              {/* Action Buttons */}
              <Grid item xs={12}>
                {tradingMode === 'simulation' ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleBacktest}
                    disabled={!isValidForBacktest || runningBacktest}
                  >
                    {runningBacktest ? 'Running Backtest...' : 'Run Backtest'}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleStartLiveTrading}
                    disabled={!isValidForLiveTrading || initializingLiveTrading}
                  >
                    {initializingLiveTrading ? 'Initializing...' : 'Start Live Trading'}
                  </Button>
                )}
              </Grid>

              {/* Progress Indicator */}
              {(runningBacktest || initializingLiveTrading) && (
                <Grid item xs={12}>
                  <LinearProgress />
                  <Typography variant="caption" align="center" display="block">
                    {runningBacktest ? 'Running backtest...' : 'Initializing live trading...'}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>

        {/* Trade Summary and Active Trades Section */}
        <Grid item xs={12}>
          {/* Trade Summary Section */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Trade Summary
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Total Trades
                  </Typography>
                  <Typography variant="h6">
                    {tradeSummary.total_trades}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Open Trades
                  </Typography>
                  <Typography variant="h6" color="primary">
                    {tradeSummary.open_trades}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Closed Trades
                  </Typography>
                  <Typography variant="h6">
                    {tradeSummary.closed_trades}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Manual Trades
                  </Typography>
                  <Typography variant="h6">
                    {tradeSummary.manual_trades}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Auto Trades
                  </Typography>
                  <Typography variant="h6">
                    {tradeSummary.auto_trades}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={4}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Total P&L
                  </Typography>
                  <Typography 
                    variant="h6" 
                    color={tradeSummary.total_pnl >= 0 ? 'success.main' : 'error.main'}
                  >
                    ₹{tradeSummary.total_pnl.toFixed(2)} ({tradeSummary.total_pnl_percentage.toFixed(2)}%)
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Active Trades Table */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Active Trades
              </Typography>
              <Button
                startIcon={<RefreshIcon />}
                onClick={loadActiveTrades}
                size="small"
              >
                Refresh
              </Button>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                backgroundColor: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <thead>
                  <tr style={{
                    backgroundColor: '#f5f5f5',
                    borderBottom: '2px solid #e0e0e0'
                  }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Symbol</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Quantity</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Entry Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Current Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>P&L</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>P&L%</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Trade Type</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Remove duplicates by using tradingsymbol + product as key */}
                  {Array.from(new Map(activeTrades.map(trade => 
                    [`${trade.tradingsymbol}-${trade.product}`, trade]
                  )).values()).map((trade) => (
                    <tr 
                      key={`${trade.tradingsymbol}-${trade.product}`}
                      style={{ borderBottom: '1px solid #e0e0e0' }}
                    >
                      <td style={{ padding: '12px 16px' }}>{trade.tradingsymbol}</td>
                      <td style={{ padding: '12px 16px' }}>{trade.transaction_type}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{trade.quantity}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>₹{trade.average_price.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>₹{trade.ltp.toFixed(2)}</td>
                      <td style={{ 
                        padding: '12px 16px', 
                        textAlign: 'right',
                        color: trade.pnl >= 0 ? '#4caf50' : '#f44336',
                        fontWeight: 500
                      }}>
                        ₹{trade.pnl.toFixed(2)}
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        textAlign: 'right',
                        color: trade.pnl_percentage >= 0 ? '#4caf50' : '#f44336',
                        fontWeight: 500
                      }}>
                        {trade.pnl_percentage.toFixed(2)}%
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Box
                          component="span"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            fontSize: '0.875rem',
                            bgcolor: trade.trade_type === 'AUTO' ? 'info.light' : 'warning.light',
                            color: 'white'
                          }}
                        >
                          {trade.trade_type}
                        </Box>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Box
                          component="span"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            fontSize: '0.875rem',
                            bgcolor: trade.is_open ? 'success.light' : 'text.disabled',
                            color: 'white'
                          }}
                        >
                          {trade.is_open ? 'OPEN' : 'CLOSED'}
                        </Box>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#666' }}>
                        {new Date(trade.order_timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Trade; 