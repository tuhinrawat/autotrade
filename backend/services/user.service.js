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

  async updateUser(userId, updates) {
    try {
      if (updates.kiteAccessToken) {
        updates.lastLogin = new Date();
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { ...updates, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, data: user };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false, error: error.message };
    }
  }

  async updateKiteToken(userId, token) {
    return this.updateUser(userId, {
      kiteAccessToken: token,
      lastLogin: new Date()
    });
  }

  async clearKiteToken(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $unset: { kiteAccessToken: 1 },
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, data: user };
    } catch (error) {
      console.error('Error clearing Kite token:', error);
      return { success: false, error: error.message };
    }
  }

  generateToken(user) {
    try {
      const payload = {
        id: user._id,
        email: user.email,
        role: user.role
      };
      return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '24h'
      });
    } catch (error) {
      logger.error('Token generation error:', error);
      throw error;
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

  async createOrUpdateUser(userData) {
    try {
      const { email } = userData;
      let user = await User.findOne({ email });
      
      if (user) {
        // Update existing user
        Object.assign(user, userData);
        await user.save();
      } else {
        // Create new user
        user = new User(userData);
        await user.save();
      }
      
      return user;
    } catch (error) {
      console.error('User creation/update error:', error);
      throw error;
    }
  }
}

module.exports = UserService; 