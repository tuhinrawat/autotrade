const User = require('../models/User');
const jwt = require('jsonwebtoken');

class UserService {
  constructor(jwtSecret) {
    this.jwtSecret = jwtSecret || 'your-secret-key';
  }

  async findUserByEmail(email) {
    try {
      const user = await User.findOne({ email });
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('User lookup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async findUserById(userId) {
    try {
      const user = await User.findById(userId);
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('User lookup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createUser(userData) {
    try {
      const user = new User(userData);
      await user.save();
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('User creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateUser(userId, updateData) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      );
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('User update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateKiteToken(userId, kiteAccessToken) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { kiteAccessToken },
        { new: true }
      );
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('Token update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async clearKiteToken(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { kiteAccessToken: null },
        { new: true }
      );
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('Token clear error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateToken(payload, expiresIn = '7d') {
    try {
      const token = jwt.sign(payload, this.jwtSecret, { expiresIn });
      return {
        success: true,
        data: token
      };
    } catch (error) {
      console.error('Token generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return {
        success: true,
        data: decoded
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateBalance(userId, balance) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { balance },
        { new: true }
      );
      return {
        success: true,
        data: user
      };
    } catch (error) {
      console.error('Balance update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = UserService; 