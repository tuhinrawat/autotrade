const express = require('express');
const router = express.Router();
const KiteConnect = require('kiteconnect').KiteConnect;
const jwt = require('jsonwebtoken');
const User = require('../models/User.js');

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

// Get all instruments
router.get('/', authenticateJWT, async (req, res) => {
  try {
    console.log('GET /api/instruments - Request received');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    // Log user info
    console.log('User info:', {
      id: req.user._id,
      hasKiteToken: !!req.user.kiteAccessToken,
      lastLogin: req.user.lastLogin
    });
    
    // Check Kite API key
    if (!process.env.KITE_API_KEY) {
      console.error('KITE_API_KEY not found in environment variables');
      return res.status(500).json({ error: 'Kite API key not configured' });
    }
    console.log('KITE_API_KEY found in environment');
    
    // Try header token first, fall back to user's stored token
    let kiteAccessToken = req.headers['x-kite-access-token'];
    if (!kiteAccessToken) {
      console.log('No Kite access token in headers, checking user session...');
      kiteAccessToken = req.user.kiteAccessToken;
      if (!kiteAccessToken) {
        console.error('No Kite access token found in headers or user session');
        return res.status(401).json({ error: 'No Kite access token available' });
      }
      console.log('Using Kite access token from user session');
    } else {
      console.log('Using Kite access token from request headers');
    }

    // Create Kite instance with detailed logging
    console.log('Creating Kite instance with API key:', process.env.KITE_API_KEY.substring(0, 5) + '...');
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY,
      debug: true
    });
    console.log('Kite instance created');
    
    console.log('Setting Kite access token:', kiteAccessToken.substring(0, 5) + '...');
    kite.setAccessToken(kiteAccessToken);
    console.log('Kite access token set successfully');

    // Verify Kite connection
    try {
      console.log('Verifying Kite connection...');
      await kite.getProfile();
      console.log('Kite connection verified successfully');
    } catch (kiteError) {
      console.error('Kite connection verification failed:', kiteError);
      return res.status(401).json({ error: 'Invalid Kite access token' });
    }

    // Get exchange from query params, default to NSE
    const exchange = req.query.exchange || 'NSE';
    console.log(`Fetching instruments for exchange: ${exchange}`);

    // Fetch instruments for the specified exchange
    console.log('Calling kite.getInstruments...');
    let instruments;
    try {
      instruments = await kite.getInstruments([exchange]);
      if (!instruments) {
        console.error('Kite returned null or undefined instruments');
        return res.status(500).json({ error: 'No instruments received from Kite API' });
      }
      console.log(`Received raw response from Kite with ${instruments ? instruments.length : 0} instruments`);
      
      // Validate instruments array
      if (!Array.isArray(instruments)) {
        console.error('Invalid response format from Kite:', typeof instruments);
        return res.status(500).json({ error: 'Invalid response format from Kite API' });
      }
      
      // Log a sample instrument for debugging
      if (instruments.length > 0) {
        console.log('Sample instrument:', JSON.stringify(instruments[0], null, 2));
      }
      
      console.log(`Received ${instruments.length} instruments from Kite`);
    } catch (kiteError) {
      console.error('Error fetching instruments from Kite:', {
        error: kiteError,
        message: kiteError.message,
        code: kiteError.code,
        response: kiteError.response?.data || kiteError.response
      });
      
      // Handle specific Kite API errors
      if (kiteError.message?.includes('Network error')) {
        return res.status(503).json({ error: 'Kite API is unreachable' });
      }
      if (kiteError.message?.includes('Token expired') || kiteError.message?.includes('Invalid token')) {
        return res.status(401).json({ error: 'Kite access token is invalid or expired' });
      }
      if (kiteError.message?.includes('Permission denied')) {
        return res.status(403).json({ error: 'Permission denied by Kite API' });
      }
      
      return res.status(500).json({ 
        error: 'Failed to fetch instruments from Kite API',
        details: kiteError.message
      });
    }
    
    if (!instruments || !Array.isArray(instruments)) {
      console.error('Invalid response from Kite:', instruments);
      return res.status(500).json({ error: 'Invalid response from Kite API' });
    }
    
    // Filter and transform instruments
    console.log('Filtering and transforming instruments...');
    let filteredInstruments;
    try {
      filteredInstruments = instruments
        .filter(instrument => {
          if (!instrument || typeof instrument !== 'object') {
            console.log('Invalid instrument:', instrument);
            return false;
          }
          
          // Include only equity instruments
          const isValid = instrument.segment === 'NSE' && instrument.instrument_type === 'EQ';
          if (!isValid) {
            console.log(`Filtered out instrument: ${instrument.tradingsymbol} (${instrument.segment}, ${instrument.instrument_type})`);
          }
          return isValid;
        })
        .map(instrument => {
          try {
            return {
              instrument_token: instrument.instrument_token,
              tradingsymbol: instrument.tradingsymbol,
              name: instrument.name,
              exchange: instrument.exchange,
              last_price: instrument.last_price || 0,
              tick_size: instrument.tick_size,
              lot_size: instrument.lot_size,
              segment: instrument.segment,
              tradable: instrument.tradable,
              instrument_type: instrument.instrument_type
            };
          } catch (mapError) {
            console.error('Error mapping instrument:', {
              error: mapError,
              instrument: instrument
            });
            return null;
          }
        })
        .filter(instrument => instrument !== null);
    } catch (filterError) {
      console.error('Error filtering/transforming instruments:', filterError);
      return res.status(500).json({ error: 'Error processing instruments' });
    }

    console.log(`Returning ${filteredInstruments.length} instruments`);
    res.json(filteredInstruments);
  } catch (error) {
    console.error('Error in GET /api/instruments:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data || error.response
    });
    
    // Check for specific error types
    if (error.message?.includes('Network error')) {
      return res.status(503).json({ error: 'Kite API is unreachable' });
    }
    if (error.message?.includes('Token expired')) {
      return res.status(401).json({ error: 'Kite access token expired' });
    }
    
    res.status(500).json({ error: 'Failed to fetch instruments', details: error.message });
  }
});

// Search instruments
router.get('/search', authenticateJWT, async (req, res) => {
  try {
    const kiteAccessToken = req.headers['x-kite-access-token'];
    if (!kiteAccessToken) {
      return res.status(401).json({ error: 'No Kite access token provided' });
    }

    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(kiteAccessToken);

    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Fetch all NSE instruments
    const instruments = await kite.getInstruments(['NSE']);
    
    // Filter and search instruments
    const searchResults = instruments
      .filter(instrument => {
        // Include only equity instruments
        if (instrument.segment !== 'NSE' || instrument.instrument_type !== 'EQ') {
          return false;
        }
        
        // Search in both symbol and name
        const searchStr = query.toLowerCase();
        return (
          instrument.tradingsymbol.toLowerCase().includes(searchStr) ||
          instrument.name.toLowerCase().includes(searchStr)
        );
      })
      .map(instrument => ({
        instrument_token: instrument.instrument_token,
        tradingsymbol: instrument.tradingsymbol,
        name: instrument.name,
        exchange: instrument.exchange,
        last_price: instrument.last_price || 0,
        tick_size: instrument.tick_size,
        lot_size: instrument.lot_size,
        segment: instrument.segment,
        tradable: instrument.tradable,
        instrument_type: instrument.instrument_type
      }))
      .slice(0, 10); // Limit to top 10 results

    console.log(`Found ${searchResults.length} instruments matching "${query}"`);
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching instruments:', error);
    res.status(500).json({ error: 'Failed to search instruments' });
  }
});

// Add status endpoint to check Kite connection
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    console.log('GET /api/instruments/status - Checking Kite connection status');
    
    // Log environment and token status
    console.log('Environment status:', {
      hasKiteApiKey: !!process.env.KITE_API_KEY,
      kiteApiKeyPrefix: process.env.KITE_API_KEY ? process.env.KITE_API_KEY.substring(0, 5) + '...' : null,
      hasJwtSecret: !!process.env.JWT_SECRET,
      nodeEnv: process.env.NODE_ENV
    });
    
    // Log user info
    console.log('User info:', {
      id: req.user._id,
      hasKiteToken: !!req.user.kiteAccessToken,
      lastLogin: req.user.lastLogin
    });
    
    // Check Kite API key
    if (!process.env.KITE_API_KEY) {
      return res.status(500).json({ error: 'Kite API key not configured' });
    }
    
    // Try header token first, fall back to user's stored token
    let kiteAccessToken = req.headers['x-kite-access-token'];
    if (!kiteAccessToken) {
      kiteAccessToken = req.user.kiteAccessToken;
      if (!kiteAccessToken) {
        return res.status(401).json({ error: 'No Kite access token available' });
      }
    }
    
    // Create Kite instance and verify connection
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY,
      debug: true
    });
    kite.setAccessToken(kiteAccessToken);
    
    // Try to get user profile to verify connection
    const profile = await kite.getProfile();
    
    res.json({
      status: 'connected',
      profile: {
        user_id: profile.user_id,
        user_name: profile.user_name,
        email: profile.email,
        broker: profile.broker
      },
      config: {
        hasKiteApiKey: true,
        hasKiteAccessToken: true,
        hasJwtToken: true
      }
    });
  } catch (error) {
    console.error('Error checking Kite connection status:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      details: {
        hasKiteApiKey: !!process.env.KITE_API_KEY,
        hasKiteAccessToken: !!req.headers['x-kite-access-token'] || !!req.user.kiteAccessToken,
        errorType: error.name,
        errorCode: error.code
      }
    });
  }
});

module.exports = router; 