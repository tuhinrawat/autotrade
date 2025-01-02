export interface AccountDetails {
  user_id: string;
  user_name: string;
  email: string;
  user_type: string;
  balance: number;
  accessToken?: string;
  token?: string;
  profile?: {
    user_name: string;
    email: string;
    user_type: string;
    broker: string;
    exchanges: string[];
    products: string[];
    order_types: string[];
  };
  margins: {
    available: {
      cash: number;
      collateral: number;
      intraday_payin: number;
    };
    used: {
      debits: number;
      exposure: number;
      m2m: number;
      option_premium: number;
      span: number;
      holding_sales: number;
      turnover: number;
    };
  };
}

export interface Instrument {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry?: string;
  strike?: number;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

export interface BacktestConfig {
  mode: 'realtime' | 'simulation';
  strategy: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  investment: number;
  profitTarget: number;
  stopLoss: number;
  simulationAmount: number;
  selectedInstruments: number[];
}

export interface BacktestTrade {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'TARGET' | 'STOPLOSS' | 'SIGNAL';
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  maxDrawdown: number;
  averageProfit: number;
  averageLoss: number;
  instrument: {
    token: number;
    symbol: string;
    exchange: string;
  };
  strategy: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  investment: number;
  profitTarget: number;
  stopLoss: number;
} 