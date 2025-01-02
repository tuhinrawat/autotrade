const express = require('express');
const router = express.Router();
const config = require('../config');
const { AppError } = require('../middleware/error');
const { protect, validateKiteToken } = require('../middleware/auth.middleware');
const UserService = require('../services/user.service');
const KiteService = require('../services/kite.service');

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
    console.error('Validation error:', error);
    res.status(401).json({ valid: false, error: error.message });
  }
});

// Login route - redirects to Kite login
router.get('/login', (req, res) => {
  const kiteService = new KiteService(process.env.KITE_API_KEY);
  const loginUrl = kiteService.getLoginURL();
  res.json({ loginUrl });
});

// Kite callback route
router.get('/callback', async (req, res, next) => {
  try {
    const { request_token: requestToken, status } = req.query;

    if (status !== 'success' || !requestToken) {
      throw new AppError('Authentication failed', 401);
    }

    // Generate Kite session
    const session = await kiteService.generateSession(requestToken, config.kite.apiSecret);
    if (!session.success) {
      throw new AppError('Failed to generate Kite session', 401);
    }

    // Set the access token for future Kite requests
    kiteService.setAccessToken(session.data.access_token);

    // Get user profile from Kite
    const profile = await kiteService.getProfile();
    if (!profile.success) {
      throw new AppError('Failed to fetch Kite profile', 401);
    }

    // Find or create user
    let user = await userService.findUserByEmail(profile.data.email);
    if (!user.success || !user.data) {
      // Create new user
      const userData = {
        email: profile.data.email,
        name: profile.data.user_name,
        kiteUserId: profile.data.user_id,
        kiteAccessToken: session.data.access_token,
        role: 'user'
      };

      user = await userService.createUser(userData);
      if (!user.success) {
        throw new AppError('Failed to create user', 500);
      }
    } else {
      // Update existing user's Kite token
      user = await userService.updateKiteToken(user.data._id, session.data.access_token);
      if (!user.success) {
        throw new AppError('Failed to update user', 500);
      }
    }

    // Generate JWT token
    const token = userService.generateToken({
      userId: user.data._id,
      email: user.data.email,
      kiteUserId: user.data.kiteUserId
    });

    if (!token.success) {
      throw new AppError('Failed to generate token', 500);
    }

    // Set cookie and redirect to frontend
    res.cookie('token', token.data, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.redirect(`${config.cors.origin}/dashboard`);
  } catch (error) {
    next(error);
  }
});

// POST version of callback route for API requests
router.post('/callback', async (req, res, next) => {
  try {
    console.log('POST callback received:', {
      hasRequestToken: !!req.body.requestToken,
      hasApiKey: !!req.body.apiKey,
      hasApiSecret: !!req.body.apiSecret,
      timestamp: req.body.timestamp,
      tokenLength: req.body.requestToken?.length
    });

    const { requestToken, apiKey, apiSecret, timestamp } = req.body;
    if (!requestToken || !apiKey || !apiSecret) {
      console.error('Missing required parameters:', {
        hasRequestToken: !!requestToken,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret
      });
      throw new AppError('Request token, API key, and API secret are required', 400);
    }

    // Check if token is too old (more than 2 minutes)
    const tokenAge = Date.now() - timestamp;
    console.log('Token age check:', {
      tokenAge: `${tokenAge}ms`,
      isExpired: tokenAge > 2 * 60 * 1000
    });
    
    if (tokenAge > 2 * 60 * 1000) {
      throw new AppError('Token has expired. Please try logging in again.', 401);
    }

    // Create a new KiteService instance with the provided API key
    const kiteService = new KiteService(apiKey);

    try {
      // Generate Kite session
      const session = await kiteService.generateSession(requestToken, apiSecret);
      console.log('Session generation response:', {
        success: session.success,
        error: session.error,
        hasData: !!session.data,
        errorType: session.error_type
      });

      if (!session.success) {
        console.error('Session generation error:', session);
        throw new AppError(session.error || 'Failed to generate Kite session', 401);
      }

      // Set the access token for future Kite requests
      kiteService.setAccessToken(session.data.access_token);

      // Get user profile from Kite
      const profile = await kiteService.getProfile();
      console.log('Profile fetch response:', {
        success: profile.success,
        hasData: !!profile.data,
        error: profile.error
      });

      if (!profile.success) {
        throw new AppError('Failed to fetch Kite profile', 401);
      }

      // Find or create user
      let user = await userService.findUserByEmail(profile.data.email);
      if (!user.success || !user.data) {
        // Create new user
        const userData = {
          email: profile.data.email,
          name: profile.data.user_name,
          kiteUserId: profile.data.user_id,
          kiteAccessToken: session.data.access_token,
          role: 'user'
        };

        user = await userService.createUser(userData);
        if (!user.success) {
          throw new AppError('Failed to create user', 500);
        }
      } else {
        // Update existing user's Kite token
        user = await userService.updateKiteToken(user.data._id, session.data.access_token);
        if (!user.success) {
          throw new AppError('Failed to update user', 500);
        }
      }

      // Generate JWT token
      const token = userService.generateToken({
        userId: user.data._id,
        email: user.data.email,
        kiteUserId: user.data.kiteUserId
      });

      if (!token.success) {
        throw new AppError('Failed to generate token', 500);
      }

      // Return tokens and profile
      res.json({
        accessToken: session.data.access_token,
        token: token.data,
        profile: {
          email: profile.data.email,
          name: profile.data.user_name,
          userId: profile.data.user_id
        }
      });
    } catch (error) {
      console.error('Error in POST callback:', error);
      next(error);
    }
  } catch (error) {
    console.error('Error in POST callback:', error);
    next(error);
  }
});

// Get user profile
router.get('/user', protect, async (req, res, next) => {
  try {
    console.log('User profile request received for user:', {
      userId: req.user._id,
      email: req.user.email,
      hasKiteToken: !!req.user.kiteAccessToken
    });

    // Create new KiteService instance
    const kiteService = new KiteService(process.env.KITE_API_KEY);

    // Set Kite access token from user
    kiteService.setAccessToken(req.user.kiteAccessToken);
    console.log('Kite access token set, fetching profile and margins...');

    // First get the profile
    const profile = await kiteService.getProfile();
    console.log('Profile response:', {
      success: profile.success,
      error: profile.error,
      data: profile.success ? {
        user_id: profile.data.user_id,
        user_name: profile.data.user_name,
        email: profile.data.email
      } : null
    });

    if (!profile.success) {
      console.error('Profile fetch failed:', profile.error);
      // If profile fetch fails, clear Kite token and throw error
      await userService.clearKiteToken(req.user._id);
      throw new AppError('Failed to fetch Kite profile: ' + profile.error, 401);
    }

    // Then try to get margins
    let margins = null;
    try {
      margins = await kiteService.getMargins();
      console.log('Margins response:', {
        success: margins.success,
        error: margins.error,
        hasData: margins.success && !!margins.data
      });
    } catch (error) {
      console.warn('Failed to fetch margins:', error.message);
      // Don't throw error for margins failure
    }

    // Format the response to match frontend's expected structure
    const response = {
      user: {
        _id: req.user._id,
        kiteUserId: req.user.kiteUserId,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      profile: profile.data,
      margins: margins?.success ? margins.data : {
        equity: {
          available: {
            cash: 0,
            collateral: 0,
            intraday_payin: 0
          },
          used: {
            debits: 0,
            exposure: 0,
            m2m: 0,
            option_premium: 0,
            span: 0,
            holding_sales: 0,
            turnover: 0
          }
        }
      }
    };

    console.log('Sending response:', {
      hasUserId: !!response.user._id,
      hasUserName: !!response.user.name,
      hasEmail: !!response.user.email,
      hasUserType: !!response.user.role,
      hasBalance: response.margins?.equity?.available?.cash !== undefined,
      hasProfile: !!response.profile,
      hasMargins: !!response.margins
    });

    res.json(response);
  } catch (error) {
    console.error('Error in /user endpoint:', error);
    next(error);
  }
});

// Logout route
router.post('/logout', protect, async (req, res, next) => {
  try {
    // Clear Kite access token
    await userService.clearKiteToken(req.user._id);

    // Clear cookie
    res.clearCookie('token');

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 