const { AppError } = require('./error');
const UserService = require('../services/user.service');
const config = require('../config');
const logger = require('../utils/logger');

const userService = new UserService(config.jwtSecret);

const protect = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const verifyResponse = userService.verifyToken(token);
    if (!verifyResponse.success) {
      throw new AppError('Invalid token', 401);
    }

    // Get user from token
    const decoded = verifyResponse.data;
    const userResponse = await userService.findUserById(decoded.userId);
    
    if (!userResponse.success || !userResponse.data) {
      throw new AppError('User not found', 404);
    }

    // Add user to request
    req.user = userResponse.data;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(error.statusCode || 401).json({ error: error.message });
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