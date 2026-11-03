const mongoose = require('mongoose');

// "HH:MM" in 24-hour time, e.g. "09:00" or "13:30" (empty = no login time)
const LOGIN_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const projectSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },

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

  // ─── Team & project attendance ───
  // Daily login time for this project (India time), e.g. "09:00".
  // After this time a login counts as Late; after lateWindowMinutes more,
  // the staff member can no longer log in for the day (the admin still can).
  loginTime: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: (v) => v === '' || LOGIN_TIME_REGEX.test(v),
      message: 'Login time must be in HH:MM format, e.g. 09:00',
    },
  },
  lateWindowMinutes: { type: Number, default: 30, min: 0, max: 240 },

  // Staff members working on this project
  assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],

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

// Fast lookup of "which projects is this staff member on?"
projectSchema.index({ userId: 1, assignedStaff: 1 });

module.exports = mongoose.model('Project', projectSchema);
module.exports.LOGIN_TIME_REGEX = LOGIN_TIME_REGEX;