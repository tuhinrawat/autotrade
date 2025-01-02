import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  InputAdornment,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';
import InstrumentSearchWrapper from '../components/InstrumentSearchWrapper';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

interface BacktestTrade {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'TARGET' | 'STOPLOSS' | 'SIGNAL';
}

interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  totalPnL: number;
  winRate: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`trade-tabpanel-${index}`}
      aria-labelledby={`trade-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Trade: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const [error, setError] = useState<string | null>(null);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
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

  // WebSocket connection state
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectTimeout, setReconnectTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 5000;
  const wsRef = useRef<WebSocket | null>(null);

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
  
  // Calculate default dates
  const now = new Date();
  // If current time is before market close (15:30), use previous day
  if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
    now.setDate(now.getDate() - 1);
  }
  // Set to market closing time
  const defaultEndDate = new Date(now);
  defaultEndDate.setHours(15, 30, 0, 0);
  
  // Skip weekends for end date
  while (defaultEndDate.getDay() === 0 || defaultEndDate.getDay() === 6) {
    defaultEndDate.setDate(defaultEndDate.getDate() - 1);
  }
  
  // Calculate start date (7 days before end date)
  const defaultStartDate = new Date(defaultEndDate);
  defaultStartDate.setDate(defaultStartDate.getDate() - 7);
  defaultStartDate.setHours(9, 15, 0, 0);
  
  // Skip weekends for start date
  while (defaultStartDate.getDay() === 0 || defaultStartDate.getDay() === 6) {
    defaultStartDate.setDate(defaultStartDate.getDate() + 1);
  }

  const [backtestStartDate, setBacktestStartDate] = useState<Date | null>(defaultStartDate);
  const [backtestEndDate, setBacktestEndDate] = useState<Date | null>(defaultEndDate);
  const [investment, setInvestment] = useState(0);
  const [profitTarget, setProfitTarget] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [initializingLiveTrading, setInitializingLiveTrading] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const [simulatedTrades, setSimulatedTrades] = useState<Trade[]>([]);
  const [simulatedTradeSummary, setSimulatedTradeSummary] = useState<TradeSummary>({
    total_trades: 0,
    open_trades: 0,
    closed_trades: 0,
    manual_trades: 0,
    auto_trades: 0,
    total_pnl: 0,
    total_pnl_percentage: 0
  });

  // Add this helper function for date validation
  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isValidDate = (date: Date): boolean => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
    return date >= sixtyDaysAgo && date <= now && !isWeekend(date);
  };

  // Update the validateDates function
  const validateDates = useCallback(() => {
    if (!backtestStartDate || !backtestEndDate) {
      setError('Please select both start and end dates');
      return false;
    }

    const now = new Date();
    if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
      now.setDate(now.getDate() - 1);
    }
    now.setHours(15, 30, 0, 0);

    // Skip weekends for current date
    while (now.getDay() === 0 || now.getDay() === 6) {
      now.setDate(now.getDate() - 1);
    }

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    sixtyDaysAgo.setHours(9, 15, 0, 0);
    
    // Skip weekends for past date
    while (sixtyDaysAgo.getDay() === 0 || sixtyDaysAgo.getDay() === 6) {
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() + 1);
    }
    
    if (backtestStartDate > now || backtestEndDate > now) {
      setError('Cannot use future dates for backtest');
      return false;
    }
    
    if (backtestStartDate < sixtyDaysAgo) {
      setError('Historical data only available for last 60 trading days');
      return false;
    }
    
    if (backtestEndDate <= backtestStartDate) {
      setError('End date must be after start date');
      return false;
    }

    // Ensure selected dates are not weekends
    if (backtestStartDate.getDay() === 0 || backtestStartDate.getDay() === 6) {
      setError('Start date cannot be a weekend');
      return false;
    }

    if (backtestEndDate.getDay() === 0 || backtestEndDate.getDay() === 6) {
      setError('End date cannot be a weekend');
      return false;
    }
    
    return true;
  }, [backtestStartDate, backtestEndDate]);

  // Add this new function before handleBacktest
  const validateInstrument = async (instrumentToken: number): Promise<boolean> => {
    try {
      // Check if the instrument is valid and supports historical data
      const response = await api.get(`/instruments/validate/${instrumentToken}`);
      return response.data.isValid;
    } catch (error) {
      console.error('Error validating instrument:', error);
      if (error instanceof AxiosError && error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('Failed to validate instrument');
      }
      return false;
    }
  };

  // Update handleBacktest to store simulated trades
  const handleBacktest = async () => {
    if (!selectedInstrument || !isValidForBacktest) {
      setError('Please fill all required fields');
      return;
    }

    if (!validateDates()) {
      return;
    }

    setRunningBacktest(true);
    setError(null);

    try {
      // First validate the instrument
      const isValid = await validateInstrument(selectedInstrument.instrument_token);
      if (!isValid) {
        setError('Selected instrument does not support historical data');
        return;
      }

      // Format dates according to Kite's requirements (YYYY-MM-DD HH:mm:ss)
      const startDate = backtestStartDate?.toLocaleDateString('en-CA') + ' 09:15:00';
      const endDate = backtestEndDate?.toLocaleDateString('en-CA') + ' 15:30:00';

      const config: BacktestConfig = {
        mode: tradingMode,
        strategy,
        timeframe,
        startDate,
        endDate,
        investment,
        profitTarget,
        stopLoss,
        simulationAmount: investment,
        selectedInstruments: [selectedInstrument.instrument_token]
      };

      console.log('Sending backtest config:', config);
      const results = await api.post<BacktestResult>('/backtest', config);
      console.log('Backtest results:', results.data);
      
      // Transform backtest results into Trade format
      const simulatedTradesList = results.data.trades.map((trade: BacktestTrade) => ({
        instrument_token: selectedInstrument?.instrument_token || 0,
        order_id: `SIM_${Math.random().toString(36).substring(7)}`,
        tradingsymbol: selectedInstrument?.tradingsymbol || '',
        exchange: selectedInstrument?.exchange || '',
        transaction_type: 'BUY' as const,
        quantity: trade.quantity,
        average_price: trade.entryPrice,
        product: 'SIM',
        status: 'COMPLETE',
        order_timestamp: trade.entryTime,
        ltp: trade.exitPrice,
        pnl: trade.pnl,
        pnl_percentage: trade.pnlPercent,
        trade_type: 'AUTO' as const,
        is_open: false
      }));

      setSimulatedTrades(simulatedTradesList);
      
      // Calculate simulated trade summary
      const simSummary = {
        total_trades: results.data.totalTrades,
        open_trades: 0,
        closed_trades: results.data.totalTrades,
        manual_trades: 0,
        auto_trades: results.data.totalTrades,
        total_pnl: results.data.totalPnL,
        total_pnl_percentage: results.data.winRate
      };
      setSimulatedTradeSummary(simSummary);
      
      // Switch to simulated trades tab
      setTabValue(1);
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
      // Handle binary data from Kite
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result as ArrayBuffer;
          console.log('Received binary data of size:', buffer.byteLength, 'bytes');
          
          // If buffer is too small, it might be a heartbeat
          if (buffer.byteLength <= 2) {
            console.log('Received heartbeat or empty message');
            return;
          }

          const dataView = new DataView(buffer);
          
          try {
            // First two bytes: number of packets
            const numberOfPackets = dataView.getInt16(0);
            console.log('Number of packets:', numberOfPackets);
            
            if (numberOfPackets <= 0 || numberOfPackets > 100) {
              console.warn('Invalid number of packets:', numberOfPackets);
              return;
            }

            let offset = 2; // Start after number of packets
            
            for (let i = 0; i < numberOfPackets; i++) {
              if (offset + 2 > buffer.byteLength) {
                console.warn('Buffer overflow prevented at packet length read');
                break;
              }

              // Next two bytes: packet length
              const packetLength = dataView.getInt16(offset);
              console.log(`Packet ${i + 1} length:`, packetLength);
              
              if (packetLength <= 0 || offset + 2 + packetLength > buffer.byteLength) {
                console.warn('Invalid packet length or buffer overflow prevented');
                break;
              }

              offset += 2;
              
              // Parse the packet
              const packet = {
                instrument_token: dataView.getInt32(offset),
                last_price: dataView.getInt32(offset + 4) / 100,
                last_quantity: dataView.getInt32(offset + 8),
                average_price: dataView.getInt32(offset + 12) / 100,
                volume: dataView.getInt32(offset + 16),
                buy_quantity: dataView.getInt32(offset + 20),
                sell_quantity: dataView.getInt32(offset + 24),
                change: 0
              };
              
              console.log('Parsed packet:', packet);
              
              // Move offset to next packet
              offset += packetLength;
              
              // Update trades with the packet data
              updateTrades([{
                instrument_token: packet.instrument_token,
                last_price: packet.last_price,
                volume: packet.volume,
                change: packet.change
              }]);
            }
          } catch (error) {
            console.error('Error parsing binary data:', error);
            // Log the buffer content for debugging
            const arr = new Uint8Array(buffer);
            console.log('Buffer content:', Array.from(arr));
          }
        };
        reader.readAsArrayBuffer(event.data);
        return;
      }

      // Handle text messages (like connection status)
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        console.error('WebSocket error message:', data);
        setWsError(data.data || 'Unknown WebSocket error');
      } else {
        console.log('WebSocket message received:', data);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, [updateTrades]);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated) {
      console.log('Not authenticated, skipping WebSocket connection');
      return;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected, skipping...');
        return;
      }
      // Close existing connection if not in OPEN state
      wsRef.current.close();
      wsRef.current = null;
    }

    if (isConnecting) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnection attempts reached');
      setWsError('Unable to establish connection. Please refresh the page.');
      return;
    }

    setIsConnecting(true);
    setWsError(null);

    try {
      const kiteToken = localStorage.getItem('kite_access_token');
      const jwtToken = localStorage.getItem('jwt_token');

      if (!kiteToken || !jwtToken) {
        throw new Error('Missing authentication tokens');
      }

      // Use the backend WebSocket URL
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
      console.log('Connecting to WebSocket server:', `${wsUrl}/ws`);
      
      const socket = new WebSocket(`${wsUrl}/ws?token=${kiteToken}&jwt=${jwtToken}`);

      socket.onopen = () => {
        console.log('WebSocket connected successfully');
        wsRef.current = socket;
        setIsConnecting(false);
        setWsError(null);
        setConnectionAttempts(0);

        // Subscribe to instruments if available
        if (instrumentTokens.length > 0) {
          console.log('Subscribing to instruments:', instrumentTokens);
          const subscribeMsg = {
            type: 'subscribe',
            tokens: instrumentTokens
          };
          socket.send(JSON.stringify(subscribeMsg));
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        setIsConnecting(false);

        // Attempt to reconnect unless it was a clean close
        if (event.code !== 1000) {
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
          }
          setConnectionAttempts(prev => prev + 1);
          const timeout = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
          }, RECONNECT_DELAY);
          setReconnectTimeout(timeout);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error occurred:', error);
        setWsError('Connection error occurred. Will attempt to reconnect...');
        setIsConnecting(false);
      };

      socket.onmessage = handleWebSocketMessage;

    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      setWsError(error instanceof Error ? error.message : 'Failed to create WebSocket connection');
      setIsConnecting(false);
      
      // Attempt to reconnect after error
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      setConnectionAttempts(prev => prev + 1);
      const timeout = setTimeout(() => {
        console.log('Attempting to reconnect after error...');
        connectWebSocket();
      }, RECONNECT_DELAY);
      setReconnectTimeout(timeout);
    }
  }, [instrumentTokens, isAuthenticated, handleWebSocketMessage, isConnecting, reconnectTimeout, connectionAttempts]);

  // Connect WebSocket when component mounts or auth changes
  useEffect(() => {
    let mounted = true;
    let connectTimeoutId: ReturnType<typeof setTimeout>;

    const connect = async () => {
      if (!mounted || !isAuthenticated) {
        return;
      }

      try {
        // Add a small delay before connecting to avoid rapid reconnections
        await new Promise(resolve => {
          connectTimeoutId = setTimeout(resolve, 1000);
        });
        
        if (mounted && isAuthenticated) {
          connectWebSocket();
        }
      } catch (error) {
        console.error('Connection setup error:', error);
      }
    };

    connect();
    
    return () => {
      mounted = false;
      if (connectTimeoutId) {
        clearTimeout(connectTimeoutId);
      }
      if (wsRef.current) {
        console.log('Closing WebSocket connection...');
        const socket = wsRef.current;
        wsRef.current = null;
        socket.close(1000, 'Component unmounting');
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      setIsConnecting(false);
      setConnectionAttempts(0);
    };
  }, [isAuthenticated, connectWebSocket, reconnectTimeout]);

  // Update WebSocket subscription when instrument tokens change
  useEffect(() => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN && instrumentTokens.length > 0) {
      const subscribeMessage = {
        type: 'subscribe',
        tokens: instrumentTokens
      };
      console.log('Sending subscription:', subscribeMessage);
      socket.send(JSON.stringify(subscribeMessage));
    }
  }, [instrumentTokens]);

  // Load trades on mount and authentication change
  useEffect(() => {
    if (isAuthenticated) {
      loadActiveTrades();
    }
  }, [isAuthenticated, loadActiveTrades]);

  // Add this function to handle tab changes
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Modify the return statement to include tabs
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
                  <Grid item xs={12}>
                    <Box sx={{ mt: 3, mb: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>
                        Backtest Date Range
                      </Typography>
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <Grid container spacing={3}>
                          <Grid item xs={12} md={6}>
                            <DatePicker
                              label="Start Date"
                              value={backtestStartDate}
                              onChange={(newValue: Date | null) => setBacktestStartDate(newValue)}
                              disabled={runningBacktest}
                              shouldDisableDate={(date: Date) => !isValidDate(date)}
                              minDate={new Date(new Date().getTime() - (60 * 24 * 60 * 60 * 1000))}
                              maxDate={new Date()}
                              slotProps={{
                                textField: {
                                  fullWidth: true,
                                  error: !!error && error.includes('start date'),
                                  helperText: error && error.includes('start date') ? error : '',
                                  sx: { mb: 2 }
                                },
                              }}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <DatePicker
                              label="End Date"
                              value={backtestEndDate}
                              onChange={(newValue: Date | null) => setBacktestEndDate(newValue)}
                              disabled={runningBacktest || !backtestStartDate}
                              shouldDisableDate={(date: Date) => !isValidDate(date) || (backtestStartDate ? date <= backtestStartDate : false)}
                              minDate={backtestStartDate || undefined}
                              maxDate={new Date()}
                              slotProps={{
                                textField: {
                                  fullWidth: true,
                                  error: !!error && error.includes('end date'),
                                  helperText: error && error.includes('end date') ? error : '',
                                  sx: { mb: 2 }
                                },
                              }}
                            />
                          </Grid>
                        </Grid>
                      </LocalizationProvider>
                    </Box>
                  </Grid>

                  {/* Investment and Target Fields */}
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
                      sx={{ mb: 2 }}
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
                      sx={{ mb: 2 }}
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
                      sx={{ mb: 2 }}
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

        {/* Trades Display Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} aria-label="trade tabs">
                <Tab label="Active Trades" />
                <Tab label="Simulated Trades" />
              </Tabs>
            </Box>

            {/* Active Trades Tab */}
            <CustomTabPanel value={tabValue} index={0}>
              <Grid container spacing={2}>
                {/* Trade Summary */}
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Typography variant="h6" gutterBottom>Trade Summary</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Total Trades</Typography>
                        <Typography variant="h6">{tradeSummary.total_trades}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Open Trades</Typography>
                        <Typography variant="h6">{tradeSummary.open_trades}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Total P&L</Typography>
                        <Typography variant="h6" color={tradeSummary.total_pnl >= 0 ? 'success.main' : 'error.main'}>
                          ₹{tradeSummary.total_pnl.toFixed(2)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">P&L %</Typography>
                        <Typography variant="h6" color={tradeSummary.total_pnl_percentage >= 0 ? 'success.main' : 'error.main'}>
                          {tradeSummary.total_pnl_percentage.toFixed(2)}%
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Active Trades List */}
                <Grid item xs={12}>
                  {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress />
                    </Box>
                  ) : (
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
                  )}
                </Grid>
              </Grid>
            </CustomTabPanel>

            {/* Simulated Trades Tab */}
            <CustomTabPanel value={tabValue} index={1}>
              <Grid container spacing={2}>
                {/* Simulated Trade Summary */}
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Typography variant="h6" gutterBottom>Simulated Trade Summary</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Total Trades</Typography>
                        <Typography variant="h6">{simulatedTradeSummary.total_trades}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Win Rate</Typography>
                        <Typography variant="h6">{simulatedTradeSummary.total_pnl_percentage.toFixed(2)}%</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Total P&L</Typography>
                        <Typography variant="h6" color={simulatedTradeSummary.total_pnl >= 0 ? 'success.main' : 'error.main'}>
                          ₹{simulatedTradeSummary.total_pnl.toFixed(2)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="body2" color="text.secondary">Auto Trades</Typography>
                        <Typography variant="h6">{simulatedTradeSummary.auto_trades}</Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Simulated Trades List */}
                <Grid item xs={12}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Symbol</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Quantity</TableCell>
                          <TableCell>Entry Price</TableCell>
                          <TableCell>Exit Price</TableCell>
                          <TableCell>P&L</TableCell>
                          <TableCell>P&L %</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {simulatedTrades.map((trade) => (
                          <TableRow key={trade.order_id}>
                            <TableCell>{trade.tradingsymbol}</TableCell>
                            <TableCell>{trade.transaction_type}</TableCell>
                            <TableCell>{trade.quantity}</TableCell>
                            <TableCell>₹{trade.average_price.toFixed(2)}</TableCell>
                            <TableCell>₹{trade.ltp.toFixed(2)}</TableCell>
                            <TableCell>
                              <Typography color={trade.pnl >= 0 ? 'success.main' : 'error.main'}>
                                ₹{trade.pnl.toFixed(2)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography color={trade.pnl_percentage >= 0 ? 'success.main' : 'error.main'}>
                                {trade.pnl_percentage.toFixed(2)}%
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                </Grid>
              </Grid>
            </CustomTabPanel>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Trade; 