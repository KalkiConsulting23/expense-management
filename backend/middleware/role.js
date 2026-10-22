const { getAuth, clerkClient } = require('@clerk/express')
const Staff = require('../models/staff')

// Works out who is calling the API:
//   - email found in the Staff list  → role 'employee' (req.staff = their Staff record)
//   - anyone else                    → role 'admin'    (full dashboard, as before)
//
// Only a VERIFIED email counts, so nobody can pose as an employee
// by typing someone else's address.

// Small cache so we don't ask Clerk for the email on every request
const EMAIL_CACHE_MS = 5 * 60 * 1000
const emailCache = new Map() // clerkUserId → { email, at }

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getVerifiedEmail = async (userId) => {
  const cached = emailCache.get(userId)
  if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return cached.email

  const user = await clerkClient.users.getUser(userId)
  const primary = (user.emailAddresses || []).find(e => e.id === user.primaryEmailAddressId)
  const email = primary && primary.verification && primary.verification.status === 'verified'
    ? primary.emailAddress.trim().toLowerCase()
    : null

  emailCache.set(userId, { email, at: Date.now() })
  return email
}

const resolveRole = async (req, res, next) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const email = await getVerifiedEmail(userId)

    // Case-insensitive match, newest staff record first if the email appears more than once
    const staff = email
      ? await Staff.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } }).sort({ createdAt: -1 })
      : null

    // The person who added this staff member is the owner of the data
    if (staff && staff.userId === userId) {
      // Owner added their own email as staff → still treat them as admin
      req.role = 'admin'
      req.staff = null
    } else {
      req.role = staff ? 'employee' : 'admin'
      req.staff = staff || null
    }
    req.authEmail = email
    next()
  } catch (err) {
    console.error('resolveRole failed:', err)
    res.status(500).json({ error: 'Could not check your access' })
  }
}

// Blocks employees from admin-only routes
const adminOnly = (req, res, next) => {
  if (req.role === 'admin') return next()
  return res.status(403).json({ error: 'Employees can only access their own attendance' })
}

// Use on every admin route:  app.use('/api/staff', requireAdmin, staffRoutes)
const requireAdmin = [resolveRole, adminOnly]

module.exports = { resolveRole, adminOnly, requireAdmin }