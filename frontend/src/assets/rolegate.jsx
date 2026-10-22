import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import MyAttendance from './MyAttendance'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

// Decides what a signed-in person sees:
//   - staff member (their email is in Staff) → only their own attendance page
//   - anyone else                            → the full dashboard (children)
//
// Wrap your signed-in app with it:
//   <SignedIn>
//     <RoleGate> ...your existing dashboard... </RoleGate>
//   </SignedIn>
const RoleGate = ({ children }) => {
  const { getToken, isSignedIn } = useAuth()
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Could not check your access (${res.status})`)
      setMe(await res.json())
    } catch (err) {
      setError(err.message || 'Could not check your access')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (isSignedIn) loadMe()
  }, [isSignedIn, loadMe])

  if (!isSignedIn) return children

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <style>{'@keyframes rg-spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.center}>
        <div style={styles.box}>
          <p style={{ margin: '0 0 12px', color: '#dc2626', fontSize: 14 }}>{error}</p>
          <button style={styles.btn} onClick={loadMe}>Try again</button>
        </div>
      </div>
    )
  }

  if (me?.role === 'employee') return <MyAttendance me={me} />

  return children
}

const styles = {
  center: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f7f7f8', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%', border: '3px solid #e4e4e7',
    borderTopColor: '#4338ca', animation: 'rg-spin 0.8s linear infinite',
  },
  box: {
    background: '#fff', border: '1px solid #ececec', borderRadius: 14, padding: '24px 28px',
    textAlign: 'center', boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
  },
  btn: {
    padding: '8px 16px', borderRadius: 9, border: '1px solid #e4e4e7', background: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#18181b',
  },
}

export default RoleGate