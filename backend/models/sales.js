const mongoose = require('mongoose')

const salesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      enum: ['cash', 'upi', 'card'],
      required: true,
    },
    billNumber: {
      type: String,
      required: true,
      trim: true,
    },
    comment: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Sales', salesSchema)