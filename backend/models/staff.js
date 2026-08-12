const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
     
    employeeId: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    email: { type: String, trim: true },
    designation: { type: String, trim: true },
    workPhoneNumber: { type: String, trim: true },
    dateOfJoining: { type: Date },
    reportingManager: { type: String, trim: true },
    dateOfBirth: { type: Date },
    personalMobileNumber: { type: String, trim: true },
    personalEmailAddress: { type: String, trim: true },
    dateOfExit: { type: Date, default: null },
    gender: { type: String, trim: true },
    maritalStatus: { type: String, trim: true },
    sourceOfHire: { type: String, trim: true },
    employeeStatus: { type: String, trim: true },
    employmentType: { type: String, trim: true },
    age: { type: Number },
    currentExperience: { type: Number },
    totalExperience: { type: Number },
    permanentAddress: { type: String, trim: true },
    aadhaar: { type: String, trim: true },
    pan: { type: String, trim: true },
    fatherName: { type: String, trim: true },
    paymentMode: { type: String, trim: true },
    bankHolderName: { type: String, trim: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true },
    bankAccountType: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", staffSchema);
