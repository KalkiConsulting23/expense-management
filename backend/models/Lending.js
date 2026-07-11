const mongoose = require('mongoose')

const lendingSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
)

module.exports = mongoose.model('Lending', lendingSchema)