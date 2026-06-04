const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectName: { type: String, required: true, trim: true },
  projectType: { type: String, required: true, enum: ['hourly', 'daily', 'monthly'] },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  
  // Base configuration parameter for tracking monthly agreements
  expectedAmount: { type: Number, default: 0 },
  currency:       { type: String, default: 'INR' },

  // Holds both dynamic calculation metrics AND payments per month
  monthlyBreakdowns: [{
    month: { type: String, required: true }, // e.g., "Jan"
    year:  { type: Number, required: true }, // e.g., 2026
    amt:   { type: Number, default: 0 },      // Calculated invoice payable value
    paid:  { type: Number, default: 0 },      // Received amount from tracking

    // Flexible metadata storage for dynamic popups
    hourlyRate:        { type: Number },
    hoursWorked:       { type: Number },
    dailyRate:         { type: Number },
    daysWorked:        { type: Number },
    totalMonthDays:    { type: Number },
    daysWorkedMonthly: { type: Number }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);