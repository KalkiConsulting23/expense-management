const { createClerkClient } = require('@clerk/backend')

const clerk = createClerkClient({ 
  secretKey: process.env.CLERK_SECRET_KEY 
})

const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { sub: userId } = await clerk.verifyToken(token)
    req.userId = userId
    next()

  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { requireAuth }