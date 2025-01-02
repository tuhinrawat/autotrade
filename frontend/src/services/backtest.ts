import { BacktestResult } from '../types/api';
import { api } from './api';

interface BacktestConfig {
  mode: 'simulation';
  strategy: string;
  timeframe: string;
  investment: number;
  profitTarget: number;
  stopLoss: number;
  simulationAmount: number;
  selectedInstruments: number[];
}

export interface Instrument {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  exchange: string;
}

export const backtest = {
  async getInstruments(): Promise<Instrument[]> {
    const response = await api.get('/backtest/instruments', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        'X-Kite-Access-Token': localStorage.getItem('kite_access_token') || ''
      }
    });
    return response.data;
  },

  async run(config: BacktestConfig): Promise<BacktestResult> {
    console.log('Running backtest with config:', config);
    const response = await api.post('/backtest', config, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        'X-Kite-Access-Token': localStorage.getItem('kite_access_token') || ''
      }
    });
    console.log('Backtest response:', response.data);
    return response.data;
  }
}; 