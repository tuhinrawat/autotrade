const KiteConnect = require('kiteconnect').KiteConnect;

class KiteService {
  constructor(apiKey) {
    this.kite = new KiteConnect({
      api_key: apiKey
    });
  }

  setAccessToken(token) {
    this.kite.setAccessToken(token);
  }

  async generateSession(requestToken, apiSecret) {
    try {
      console.log('Attempting to generate session with:', {
        hasRequestToken: !!requestToken,
        requestTokenLength: requestToken?.length,
        hasApiSecret: !!apiSecret,
        apiSecretLength: apiSecret?.length
      });
      
      const session = await this.kite.generateSession(requestToken, apiSecret);
      console.log('Raw session response:', session);
      
      if (!session || !session.access_token) {
        return {
          success: false,
          error: 'No access token in response'
        };
      }

      // Set the access token for subsequent requests
      this.setAccessToken(session.access_token);
      
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('Session generation error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        body: error.response?.body
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getProfile() {
    try {
      const profile = await this.kite.getProfile();
      return {
        success: true,
        data: profile
      };
    } catch (error) {
      console.error('Profile fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getMargins() {
    try {
      const margins = await this.kite.getMargins();
      return {
        success: true,
        data: margins
      };
    } catch (error) {
      console.error('Margins fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getOrders() {
    try {
      const orders = await this.kite.getOrders();
      return {
        success: true,
        data: orders
      };
    } catch (error) {
      console.error('Orders fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getPositions() {
    try {
      const positions = await this.kite.getPositions();
      return {
        success: true,
        data: positions
      };
    } catch (error) {
      console.error('Positions fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTrades() {
    try {
      const trades = await this.kite.getTrades();
      return {
        success: true,
        data: trades
      };
    } catch (error) {
      console.error('Trades fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getInstruments(exchange) {
    try {
      const instruments = await this.kite.getInstruments(exchange);
      return {
        success: true,
        data: instruments
      };
    } catch (error) {
      console.error('Instruments fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async placeOrder(params) {
    try {
      const order = await this.kite.placeOrder(params.variety, params);
      return {
        success: true,
        data: order
      };
    } catch (error) {
      console.error('Order placement error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async modifyOrder(orderId, params) {
    try {
      const order = await this.kite.modifyOrder(params.variety, orderId, params);
      return {
        success: true,
        data: order
      };
    } catch (error) {
      console.error('Order modification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cancelOrder(orderId, variety) {
    try {
      const result = await this.kite.cancelOrder(variety, orderId);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Order cancellation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTicks(tokens) {
    try {
      const quotes = await this.kite.getQuote(tokens);
      const ticks = Object.entries(quotes).map(([token, quote]) => ({
        instrument_token: parseInt(token),
        last_price: quote.last_price,
        volume: quote.volume,
        change: quote.net_change
      }));
      return {
        success: true,
        data: ticks
      };
    } catch (error) {
      console.error('Ticks fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getLoginURL() {
    return this.kite.getLoginURL();
  }
}

module.exports = KiteService; 