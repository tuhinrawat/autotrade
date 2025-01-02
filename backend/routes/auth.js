const express = require('express');
const router = express.Router();
const config = require('../config');
const { AppError } = require('../middleware/error');
const { protect, validateKiteToken } = require('../middleware/auth.middleware');
const UserService = require('../services/user.service');
const KiteService = require('../services/kite.service');
const logger = require('../utils/logger');

const userService = new UserService(config.jwtSecret);

// Validate tokens endpoint
router.get('/validate', protect, async (req, res) => {
  try {
    // If we reach here, it means the protect middleware passed
    // and the tokens are valid
    res.json({
      valid: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        kiteUserId: req.user.kiteUserId
      }
    });
  } catch (error) {
    logger.error('Validation error:', { error: error.message });
    res.status(401).json({ valid: false, error: error.message });
  }
});

// Login route - redirects to Kite login
router.get('/login', (req, res) => {
  const kiteService = new KiteService(process.env.KITE_API_KEY);
  const loginUrl = kiteService.getLoginURL();
  logger.info('Generated login URL for Kite');
  res.json({ loginUrl });
});

// Kite callback route
router.post('/callback', async (req, res) => {
  try {
    const { requestToken } = req.body;
    
    logger.info('POST callback received:', {
      hasApiKey: !!process.env.KITE_API_KEY,
      hasRequestToken: !!requestToken,
      timestamp: Date.now(),
      tokenLength: requestToken?.length
    });

    // Check token age
    const tokenAge = Date.now() - req.body.timestamp;
    const isExpired = tokenAge > TOKEN_EXPIRY;
    
    logger.info('Token age check:', {
      isExpired,
      timestamp: new Date().toISOString(),
      tokenAge: `${tokenAge}ms`
    });

    if (isExpired) {
      throw new Error('Request token has expired');
    }

    const session = await kiteService.generateSession(requestToken);
    const profile = await kiteService.getProfile();
    
    // Create or update user
    const user = await userService.findOrCreateUser({
      email: profile.email,
      name: profile.user_name,
      kiteUserId: profile.user_id
    });

    // Generate JWT token
    const jwtToken = await userService.generateToken(user);

    res.json({
      success: true,
      data: {
        user: profile,
        tokens: {
          access: session.access_token,
          jwt: jwtToken
        }
      }
    });
  } catch (error) {
    logger.error('Error in POST callback:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user details
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const userResponse = await userService.findUserById(userId);
    
    if (!userResponse.success || !userResponse.data) {
      throw new AppError('User not found', 404);
    }

    const user = userResponse.data;
    
    // Construct the full response with profile and margins
    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        kiteUserId: user.kiteUserId,
        role: user.role
      },
      profile: {
        user_name: user.name,
        email: user.email,
        user_type: user.role || 'individual',
        broker: 'ZERODHA',
        exchanges: ['NSE', 'BSE', 'NFO'],
        products: ['CNC', 'NRML', 'MIS'],
        order_types: ['MARKET', 'LIMIT', 'SL', 'SL-M']
      },
      margins: {
        equity: {
          available: {
            cash: user.balance || 0,
            collateral: user.margins?.available?.collateral || 0,
            intraday_payin: user.margins?.available?.intraday_payin || 0
          },
          used: {
            debits: user.margins?.used?.debits || 0,
            exposure: user.margins?.used?.exposure || 0,
            m2m: user.margins?.used?.m2m || 0,
            option_premium: user.margins?.used?.option_premium || 0,
            span: user.margins?.used?.span || 0,
            holding_sales: user.margins?.used?.holding_sales || 0,
            turnover: user.margins?.used?.turnover || 0
          }
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router; 