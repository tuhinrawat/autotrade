interface CreateTradeRequest {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

export const trades = {
  async create(trade: CreateTradeRequest): Promise<void> {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        'X-Kite-Access-Token': localStorage.getItem('kite_access_token') || ''
      },
      body: JSON.stringify(trade)
    });
    if (!response.ok) {
      throw new Error('Failed to place order');
    }
  }
}; 