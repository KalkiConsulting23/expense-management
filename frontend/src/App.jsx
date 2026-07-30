import React, { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, useAuth, useUser } from '@clerk/clerk-react'

const Navbar        = lazy(() => import('./assets/Navbar'))
const Login         = lazy(() => import('./assets/login'))
const Employee      = lazy(() => import('./assets/employee'))
const Project       = lazy(() => import('./assets/project'))
const EmployeeTable = lazy(() => import('./assets/employeetable'))
const Projecttable  = lazy(() => import('./assets/projecttable'))
const Salesform     = lazy(() => import('./assets/salesform'))
const Salestable    = lazy(() => import('./assets/salestable'))
const Salesanl      = lazy(() => import('./assets/salesanl'))
const Projectanl    = lazy(() => import('./assets/projectanl'))
const Expenseanl    = lazy(() => import('./assets/expenseanl'))
const Expensemaster = lazy(() => import('./assets/expensemaster'))
const Projectmaster = lazy(() => import('./assets/projectmaster'))
const Incometracker = lazy(() => import('./assets/incometracker'))
const Borrow        = lazy(() => import('./assets/borrow'))
const Borrowform    = lazy(() => import('./assets/borrowform'))
const Lending       = lazy(() => import('./assets/Lending'))
const Lendingform   = lazy(() => import('./assets/lendingform'))

const PageLoader = () => (
  <div style={{
    background: '#f7f7f8', minHeight: '100vh', display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: 12,
    fontFamily: "'Inter', system-ui, sans-serif", color: '#6b7280'
  }}>
    <div style={{
      width: 24, height: 24, border: '2.5px solid #ececec',
      borderTopColor: '#18181b', borderRadius: '50%',
      animation: 'spin 0.7s linear infinite'
    }} />
    Loading view…
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

// Full-screen welcome overlay, styled to match the Salesform success overlay.
function WelcomeOverlay({ name, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2600)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="wl-overlay">
      <div className="wl-ov-panel">
        <div className="wl-ov-glow" />
        <div className="wl-ov-check">
          <svg viewBox="0 0 80 80">
            <circle className="wl-ov-ring" cx="40" cy="40" r="36" />
          </svg>
          <div className="wl-ov-disc">
            <svg className="wl-ov-tick" viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <div className="wl-ov-title">Welcome, {name}</div>
        <div className="wl-ov-sub">You're signed in. Loading your dashboard&hellip;</div>
        <div className="wl-ov-progress"><div className="wl-ov-bar" /></div>
        <div className="wl-ov-foot">
          <span className="wl-ov-dot" /> Setting things up&hellip;
        </div>
      </div>

      <style>{`
        .wl-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: rgba(17,17,20,0.55);
          backdrop-filter: blur(6px);
          font-family: 'Inter', system-ui, sans-serif;
          animation: wlFade 0.25s ease;
        }
        @keyframes wlFade { from { opacity: 0; } to { opacity: 1; } }
        .wl-ov-panel {
          position: relative; width: 340px; padding: 40px 32px 28px;
          background: #fff; border-radius: 20px; text-align: center;
          box-shadow: 0 30px 80px rgba(0,0,0,0.35);
          animation: wlPop 0.4s cubic-bezier(0.16,1,0.3,1);
          overflow: hidden;
        }
        @keyframes wlPop {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .wl-ov-glow {
          position: absolute; top: -60px; left: 50%; transform: translateX(-50%);
          width: 200px; height: 200px; border-radius: 50%;
          background: radial-gradient(circle, rgba(34,197,94,0.18), transparent 70%);
          pointer-events: none;
        }
        .wl-ov-check {
          position: relative; width: 80px; height: 80px; margin: 0 auto 20px;
        }
        .wl-ov-check svg { width: 80px; height: 80px; }
        .wl-ov-ring {
          fill: none; stroke: #22c55e; stroke-width: 3;
          stroke-dasharray: 226; stroke-dashoffset: 226;
          transform: rotate(-90deg); transform-origin: 40px 40px;
          animation: wlRing 0.7s ease forwards 0.15s;
        }
        @keyframes wlRing { to { stroke-dashoffset: 0; } }
        .wl-ov-disc {
          position: absolute; inset: 0; margin: auto;
          width: 52px; height: 52px; border-radius: 50%;
          background: #22c55e; display: flex; align-items: center; justify-content: center;
          animation: wlDisc 0.35s cubic-bezier(0.16,1,0.3,1) forwards 0.5s;
          opacity: 0; transform: scale(0.4);
        }
        @keyframes wlDisc { to { opacity: 1; transform: scale(1); } }
        .wl-ov-tick { width: 28px; height: 28px; }
        .wl-ov-tick path {
          fill: none; stroke: #fff; stroke-width: 2.5;
          stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 30; stroke-dashoffset: 30;
          animation: wlTick 0.3s ease forwards 0.75s;
        }
        @keyframes wlTick { to { stroke-dashoffset: 0; } }
        .wl-ov-title {
          font-size: 21px; font-weight: 700; color: #18181b;
          letter-spacing: -0.02em; margin-bottom: 6px;
        }
        .wl-ov-sub { font-size: 13.5px; color: #6b7280; margin-bottom: 22px; }
        .wl-ov-progress {
          width: 100%; height: 4px; border-radius: 999px;
          background: #eef0f2; overflow: hidden; margin-bottom: 16px;
        }
        .wl-ov-bar {
          height: 100%; width: 100%; background: #22c55e; border-radius: 999px;
          transform-origin: left; transform: scaleX(0);
          animation: wlBar 2.2s linear forwards 0.3s;
        }
        @keyframes wlBar { to { transform: scaleX(1); } }
        .wl-ov-foot {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          font-size: 12.5px; color: #9ca3af;
        }
        .wl-ov-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
          animation: wlPulse 1s ease-in-out infinite;
        }
        @keyframes wlPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}

// Attaches the Clerk session token to every API request automatically, so
// individual components don't each need their own auth wiring. Also clears
// cached data when the signed-in user changes, so one user never sees
// another user's cached records on a shared browser.
function ApiTokenBridge({ children }) {
  const { getToken, userId } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const LAST_USER_KEY = 'last_signed_in_user'
    const previous = sessionStorage.getItem(LAST_USER_KEY)
    if (previous && previous !== userId) {
      sessionStorage.clear()
    }
    if (userId) sessionStorage.setItem(LAST_USER_KEY, userId)
  }, [userId])

  useEffect(() => {
    const originalFetch = window.fetch
    const API_BASE = import.meta.env.VITE_API_BASE

    window.fetch = async (url, options = {}) => {
      const isApi = typeof url === 'string' && API_BASE && url.includes(API_BASE)
      if (!isApi) return originalFetch(url, options)
      const token = await getToken()
      return originalFetch(url, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
      })
    }

    setReady(true)
    return () => { window.fetch = originalFetch }
  }, [getToken])

  if (!ready) return <PageLoader />
  return children
}

// Shows a one-time full-screen welcome overlay per sign-in.
function SignedInApp() {
  const { user } = useUser()
  const [welcomeName, setWelcomeName] = useState(null)
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current || !user) return
    checked.current = true

    const KEY = 'welcome_overlay_shown'
    const alreadyShown = sessionStorage.getItem(KEY) === user.id
    if (!alreadyShown) {
      const name = user.firstName || user.username || 'there'
      setWelcomeName(name)
      sessionStorage.setItem(KEY, user.id)
    }
  }, [user])

  return (
    <ApiTokenBridge>
      {welcomeName && (
        <WelcomeOverlay name={welcomeName} onDone={() => setWelcomeName(null)} />
      )}
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Navbar />
          <div style={{ minHeight: '100vh', background: '#f7f7f8' }}>
            <Routes>
              <Route path="/"               element={<Projectanl />} />
              <Route path="/employeetable"  element={<EmployeeTable />} />
              <Route path="/employee"       element={<Employee />} />

              <Route path="/projecttable"   element={<Projecttable />} />
              <Route path="/project"        element={<Project />} />

              <Route path="/salesform"      element={<Salesform />} />
              <Route path="/salestable"     element={<Salestable />} />

              <Route path="/salesanl"       element={<Salesanl />} />
              <Route path="/projectanl"     element={<Projectanl />} />
              <Route path="/expenseanl"     element={<Expenseanl />} />

              <Route path="/expensemaster"  element={<Expensemaster />} />
              <Route path="/projectmaster"  element={<Projectmaster />} />

              <Route path="/incometracker"  element={<Incometracker />} />
              <Route path="/borrow"         element={<Borrow />} />
              <Route path="/borrowform"     element={<Borrowform />} />
              <Route path="/lending"        element={<Lending />} />
              <Route path="/lendingform"    element={<Lendingform />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Suspense>
      </BrowserRouter>
    </ApiTokenBridge>
  )
}

function App() {
  return (
    <>
      <SignedOut>
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      </SignedOut>

      <SignedIn>
        <SignedInApp />
      </SignedIn>
    </>
  )
}

export default App