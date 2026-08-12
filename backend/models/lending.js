const mongoose = require('mongoose')

const lendingSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    // Which pool the lent money left from (money out of that pool)
    lentPool: {
      type: String,
      enum: ['Home', 'Office'],
      default: 'Home',
    },
    // How much of `amount` has been received back so far
    receivedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // When money was last received (null until first receipt)
    receivedDate: {
      type: Date,
      default: null,
    },
    // Which budget pool a received repayment credits (defaults to Home)
    receivedPool: {
      type: String,
      enum: ['Home', 'Office'],
      default: 'Home',
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Lending', lendingSchema)