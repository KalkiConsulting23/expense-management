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
  // International projects added from now on keep their rate / amount in the
  // project's currency (e.g. 50 USD per day). Each month's exchange rate is set
  // in the Project Tracker (monthlyBreakdowns.fxRate). Older international
  // projects were converted to ₹ when added, so they keep this false.
  amountsInForeignCurrency: { type: Boolean, default: false },
  defaultFxRate:     { type: Number, min: 0 },   // ₹ per 1 unit of currency, pre-fills new months
  projectScope:      { type: String, enum: ['domestic', 'international'], default: 'domestic' },

  // Billing period length in days (e.g. 30 = bill every 30 days).
  daysCycle: { type: Number, default: 30 },

  // ─── Tax (domestic and international projects) ───
  // The rate / amount above is the base amount BEFORE GST.
  //   GST      = base × 18%            (when gstApplicable)
  //   Invoice  = base + GST
  //   TDS      = base × tdsPercent%    (deducted by the client on the base)
  //   To be received = Invoice − TDS
  // Older projects keep gstApplicable = false and tdsPercent = 0, so their numbers don't change.
  gstApplicable: { type: Boolean, default: false },
  tdsPercent:    { type: Number, default: 0, min: 0, max: 100 },

  // ─── Team & project attendance ───
  // Daily login time for this project (India time), e.g. "09:00".
  // Staff can log in from this time until lateWindowMinutes after it (Present).
  // 0 = any time that day. After the window only the admin can mark the day.
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
    daysWorked:        { type: Number },   // from the Attendance Tracker (person-days)
    totalMonthDays:    { type: Number },
    daysWorkedMonthly: { type: Number },
    hoursPerDay:       { type: Number },   // hourly projects: hours per working day (8)
    workingDays:       { type: Number },   // Mon–Fri minus holidays in the month (monthly proration)
    // Tax breakdown for the month (amt above = to be received, paid = received)
    tdsPercent:        { type: Number },   // TDS % entered for this month
    fxRate:            { type: Number },   // international: ₹ per 1 unit of currency for this month
    grossForeign:      { type: Number },   // international: gross in the project's currency
    baseAmount:        { type: Number },   // gross amount
    gstAmount:         { type: Number },
    tdsAmount:         { type: Number },
    invoiceAmount:     { type: Number }
  }]
}, { timestamps: true });

// Fast lookup of "which projects is this staff member on?"
projectSchema.index({ userId: 1, assignedStaff: 1 });

module.exports = mongoose.model('Project', projectSchema);
module.exports.LOGIN_TIME_REGEX = LOGIN_TIME_REGEX;