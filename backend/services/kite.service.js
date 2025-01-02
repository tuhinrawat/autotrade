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
      const session = await this.kite.generateSession(requestToken, apiSecret);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('Session generation error:', error);
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

  getLoginURL() {
    return this.kite.getLoginURL();
  }
}

module.exports = KiteService; 