const { getAuth, clerkClient } = require('@clerk/express')
const Staff = require('../models/staff')

// Works out who is calling the API:
//   - email found in the Staff list (work or personal email) → role 'employee' (req.staff = their Staff record)
//   - anyone else                    → role 'admin'    (full dashboard, as before)
//
// Every VERIFIED email on the Clerk account is checked (work or personal),
// so nobody can pose as an employee by typing someone else's address.

// Small cache so we don't ask Clerk for the emails on every request
const EMAIL_CACHE_MS = 5 * 60 * 1000
const emailCache = new Map() // clerkUserId → { emails, primary, at }

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ALL verified emails on the person's Clerk account (not only the primary one),
// so it works whichever address they signed in with.
const getVerifiedEmails = async (userId) => {
  const cached = emailCache.get(userId)
  if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return cached

  const user = await clerkClient.users.getUser(userId)
  const verified = (user.emailAddresses || [])
    .filter(e => e && e.emailAddress && e.verification && e.verification.status === 'verified')
    .map(e => ({ id: e.id, email: e.emailAddress.trim().toLowerCase() }))

  const primaryEntry = verified.find(e => e.id === user.primaryEmailAddressId) || verified[0]
  const result = {
    emails: [...new Set(verified.map(e => e.email))],
    primary: primaryEntry ? primaryEntry.email : null,
    at: Date.now(),
  }
  emailCache.set(userId, result)
  return result
}

const resolveRole = async (req, res, next) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const { emails, primary } = await getVerifiedEmails(userId)

    // Case-insensitive match of ANY verified email against the Staff
    // work email OR personal email. Newest staff record wins if several match.
    let staff = null
    if (emails.length > 0) {
      const patterns = emails.map(e => new RegExp(`^\\s*${escapeRegex(e)}\\s*$`, 'i'))
      staff = await Staff.findOne({
        $or: [
          { email: { $in: patterns } },
          { personalEmailAddress: { $in: patterns } },
        ],
      }).sort({ createdAt: -1 })
    }

    // The person who added this staff member is the owner of the data
    if (staff && staff.userId === userId) {
      // Owner added their own email as staff → still treat them as admin
      req.role = 'admin'
      req.staff = null
    } else {
      req.role = staff ? 'employee' : 'admin'
      req.staff = staff || null
    }
    req.authEmail = primary
    req.authEmails = emails
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