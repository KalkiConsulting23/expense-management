const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  userId: {          // ← ADD THIS
    type: String,
    required: true,
    index: true,
  },

  projectName: { type: String, required: true, trim: true },
  projectType: { type: String, required: true, enum: ['hourly', 'daily', 'monthly'] },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  expectedAmount: { type: Number, default: 0 },
  currency:       { type: String, default: 'INR' },

  monthlyBreakdowns: [{
    month: { type: String, required: true },
    year:  { type: Number, required: true },
    amt:   { type: Number, default: 0 },
    paid:  { type: Number, default: 0 },
    hourlyRate:        { type: Number },
    hoursWorked:       { type: Number },
    dailyRate:         { type: Number },
    daysWorked:        { type: Number },
    totalMonthDays:    { type: Number },
    daysWorkedMonthly: { type: Number }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);