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
  instrument: Instrument;
  startDate: string;
  endDate: string;
  capital: number;
  strategy: string;
  params: {
    profitTarget: number;
    stopLoss: number;
    timeframe: string;
  };
}

export interface BacktestResult {
  startDate: string;
  endDate: string;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  averageProfit: number;
  averageLoss: number;
  sharpeRatio: number;
  trades: Array<{
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: number;
    entry_price: number;
    entry_date: string;
    exit_price: number;
    exit_date: string;
    pnl: number;
    pnl_percentage: number;
  }>;
  summary: {
    totalTrades: number;
    profitableTrades: number;
    totalPnL: number;
    maxDrawdown: number;
    winRate: number;
  };
} 