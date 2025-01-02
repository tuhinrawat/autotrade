const { AppError } = require('./error');
const UserService = require('../services/user.service');
const config = require('../config');

const userService = new UserService(config.jwtSecret);

const protect = async (req, res, next) => {
  try {
    console.log('Authenticating request...');
    
    // 1) Getting token and check if it exists
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    console.log('Token check:', {
      hasAuthHeader: !!authHeader,
      hasToken: !!token
    });

    if (!token) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    // 2) Verification token
    console.log('Verifying token...');
    const decoded = await userService.verifyToken(token);
    console.log('Token verification result:', {
      success: decoded.success,
      error: decoded.error,
      payload: decoded.success ? decoded.data : null
    });

    if (!decoded.success) {
      return next(new AppError('Invalid token: ' + decoded.error, 401));
    }

    // 3) Check if user still exists
    console.log('Finding user by ID:', decoded.data.userId);
    const currentUser = await userService.findUserById(decoded.data.userId);
    console.log('User lookup result:', {
      success: currentUser.success,
      userFound: !!currentUser.data,
      error: currentUser.error
    });

    if (!currentUser.success || !currentUser.data) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // 4) Check if user has a valid Kite token
    console.log('Checking Kite token:', {
      hasKiteToken: !!currentUser.data.kiteAccessToken
    });

    if (!currentUser.data.kiteAccessToken) {
      return next(new AppError('No Kite access token found. Please login again.', 401));
    }

    // Validate user object has required fields
    const requiredFields = ['_id', 'email', 'name', 'role', 'kiteUserId'];
    const missingFields = requiredFields.filter(field => !currentUser.data[field]);
    
    console.log('User data validation:', {
      hasAllFields: missingFields.length === 0,
      missingFields
    });

    if (missingFields.length > 0) {
      console.warn('User data is incomplete:', {
        userId: currentUser.data._id,
        missingFields
      });
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser.data;
    console.log('Authentication successful for user:', {
      userId: req.user._id,
      email: req.user.email
    });

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    next(error);
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

const validateKiteToken = async (req, res, next) => {
  try {
    const kiteAccessToken = req.headers['x-kite-access-token'];
    if (!kiteAccessToken) {
      return next(new AppError('No Kite access token provided', 401));
    }

    if (!req.user || !req.user.kiteAccessToken) {
      return next(new AppError('User not authenticated with Kite', 401));
    }

    if (req.user.kiteAccessToken !== kiteAccessToken) {
      return next(new AppError('Invalid Kite access token', 401));
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  protect,
  restrictTo,
  validateKiteToken
}; 