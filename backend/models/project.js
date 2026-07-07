const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // userId removed completely to bypass auth restrictions

  projectName: { type: String, required: true, trim: true },
  projectType: { type: String, required: true, enum: ['hourly', 'daily', 'monthly'] },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  expectedAmount:    { type: Number, default: 0 }, // used by monthly
  defaultHourlyRate: { type: Number, default: 0 }, // used by hourly (stored in INR)
  defaultDailyRate:  { type: Number, default: 0 }, // used by daily (stored in INR)
  currency:          { type: String, default: 'INR' },
  projectScope:      { type: String, enum: ['domestic', 'international'], default: 'domestic' },

  // Billing period length in days (e.g. 30 = bill every 30 days).
  daysCycle: { type: Number, default: 30 },

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