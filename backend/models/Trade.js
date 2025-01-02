const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  totalAmount: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Calculate total amount before saving
tradeSchema.pre('save', function(next) {
  this.totalAmount = this.price * this.quantity;
  next();
});

const Trade = mongoose.model('Trade', tradeSchema);
module.exports = Trade; 