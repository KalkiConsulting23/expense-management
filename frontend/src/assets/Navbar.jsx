import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const Navbar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dropdownRef = useRef(null)
  const analyticsRef = useRef(null)

  // Map current route → top bar label. Default to "Dashboard".
  const TITLE_MAP = {
    '/': 'Dashboard',
    '/employee': 'Add Expense',
    '/expensemaster': 'Expense Master',
    '/salestable': 'Sales',
    '/salesform': 'Add Sale',
    '/salesanl': 'Sales Analytics',
    '/projecttable': 'Projects',
    '/project': 'Add Project',
    '/projectmaster': 'Project Master',
    '/projectanl': 'Project Analytics',
    '/expenseanl': 'Expense Analytics',
    '/incometracker': 'Income Tracker',
    '/borrow': 'Borrow',
    '/lending': 'Lending',
  }
  const pageTitle = TITLE_MAP[location.pathname] || 'Dashboard'

  const navItems = [
    {
      label: 'Expense',
      path: '/employeetable',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
    },
    {
      label: 'Sales',
      path: '/salestable',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
    },
    {
      label: 'Projects',
      path: '/projecttable',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
      ),
    },
    {
      label: 'Income Tracker',
      path: '/incometracker',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      label: 'Borrow',
      path: '/borrow',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          <line x1="12" y1="1" x2="12" y2="23"/>
          <polyline points="7 8 3 12 7 16"/>
        </svg>
      ),
    },
    {
      label: 'Lending',
      path: '/lending',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5h7.5a3.5 3.5 0 0 1 0 7h-5a3.5 3.5 0 0 0 0 7H18"/>
          <line x1="12" y1="1" x2="12" y2="23"/>
          <polyline points="17 8 21 12 17 16"/>
        </svg>
      ),
    },
    {
      label: 'Expense Master',
      path: '/expensemaster',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="9" x2="9" y2="21"/>
        </svg>
      ),
    },
    {
      label: 'Project Master',
      path: '/projectmaster',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
          <line x1="7" y1="8" x2="17" y2="8"/>
          <line x1="7" y1="12" x2="13" y2="12"/>
        </svg>
      ),
    },
  ]

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (analyticsRef.current && !analyticsRef.current.contains(e.target)) setAnalyticsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOverlayClick = () => {
    setSidebarOpen(false)
    setDropdownOpen(false)
    setAnalyticsOpen(false)
  }

  const handleAddNavigate = (path) => {
    setDropdownOpen(false)
    setSidebarOpen(false)
    navigate(path)
  }

  const handleAnalyticsNavigate = (path) => {
    setAnalyticsOpen(false)
    setSidebarOpen(false)
    navigate(path)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        /* Full-width fixed top bar holding the hamburger + page label */
        .topbar {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 200;
          height: 56px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 16px;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid #ececec;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        /* Spacer that occupies the same height so page content starts below the bar */
        .topbar-spacer { height: 56px; width: 100%; flex-shrink: 0; }

        .topbar-title {
          font-size: 16px;
          font-weight: 600;
          color: #18181b;
          letter-spacing: -0.2px;
        }

        .hamburger-btn {
          z-index: 200;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.18s ease;
          box-shadow: 0 1px 2px rgba(16,24,40,0.05);
          flex-shrink: 0;
        }
        .hamburger-btn:hover { background: #f9fafb; }
        .hamburger-btn.open { background: #f3f4f6; border-color: #d1d5db; }
        .hamburger-lines { display: flex; flex-direction: column; gap: 4px; width: 16px; }
        .hamburger-lines span {
          display: block; height: 1.6px; border-radius: 2px;
          background: #4b5563;
        }

        .sidebar-overlay {
          position: fixed; inset: 0;
          background: rgba(17, 24, 39, 0.35);
          z-index: 99; backdrop-filter: blur(2px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .navbar {
          position: fixed; top: 0; left: 0;
          height: 100vh; width: 248px;
          background: #ffffff;
          display: flex; flex-direction: column;
          z-index: 100;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          border-right: 1px solid #ececec;
          transform: translateX(-100%);
          transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .navbar.open { transform: translateX(0); }

        .navbar-brand {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 16px 16px; flex-shrink: 0;
          cursor: pointer;
          border-bottom: 1px solid #f1f1f1;
        }
        .navbar-brand-left { display: flex; align-items: center; gap: 10px; }
        .brand-logo {
          width: 32px; height: 32px; border-radius: 9px;
          background: #18181b; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .brand-logo svg { color: #fff; }
        .brand-name { font-size: 15px; font-weight: 600; color: #18181b; letter-spacing: -0.2px; }
        .brand-chevrons { color: #9ca3af; display: flex; }

        .navbar-inner {
          flex: 1; overflow-y: auto; padding: 8px 12px 12px;
          display: flex; flex-direction: column; gap: 1px; scrollbar-width: none;
        }
        .navbar-inner::-webkit-scrollbar { display: none; }

        .nav-section-label {
          font-size: 11px; font-weight: 500; color: #9ca3af;
          letter-spacing: 0.3px; padding: 14px 10px 6px;
        }

        .nav-btn {
          display: flex; align-items: center; gap: 11px;
          width: 100%; padding: 8px 10px;
          border-radius: 8px; border: none;
          background: none; font-family: inherit;
          font-size: 13.5px; font-weight: 500; color: #4b5563;
          cursor: pointer; text-align: left; transition: all 0.13s;
        }
        .nav-btn svg { color: #6b7280; flex-shrink: 0; }
        .nav-btn:hover { background: #f7f7f7; color: #18181b; }
        .nav-btn:hover svg { color: #18181b; }
        .nav-btn.active { background: #f3f4f6; color: #18181b; font-weight: 600; }
        .nav-btn.active svg { color: #18181b; }

        .nav-btn.master-btn { color: #4b5563; }
        .nav-btn.master-btn.active { background: #f3f4f6; color: #18181b; }

        .nav-divider {
          height: 1px;
          background: #f1f1f1;
          margin: 10px 4px;
        }

        .nav-add-wrapper { position: relative; margin-top: 1px; }
        .nav-add-btn {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 8px 10px; border-radius: 8px; border: none;
          background: none; font-family: inherit;
          font-size: 13.5px; font-weight: 500; color: #4b5563; cursor: pointer;
          transition: all 0.13s;
        }
        .nav-add-btn:hover { background: #f7f7f7; color: #18181b; }
        .nav-add-btn:hover svg { color: #18181b; }
        .nav-add-btn-left { display: flex; align-items: center; gap: 11px; }
        .nav-add-btn-left svg { color: #6b7280; }
        .nav-add-chevron { color: #9ca3af; transition: transform 0.15s ease; }
        .nav-add-chevron.open { transform: rotate(180deg); }

        .nav-analytics-wrapper { position: relative; margin-top: 1px; }
        .nav-analytics-btn {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 8px 10px; border-radius: 8px; border: none;
          background: none; font-family: inherit;
          font-size: 13.5px; font-weight: 500; color: #4b5563; cursor: pointer;
          transition: all 0.13s;
        }
        .nav-analytics-btn:hover { background: #f7f7f7; color: #18181b; }
        .nav-analytics-btn:hover svg { color: #18181b; }
        .nav-analytics-btn-left { display: flex; align-items: center; gap: 11px; }
        .nav-analytics-btn-left svg { color: #6b7280; }
        .nav-analytics-chevron { color: #9ca3af; transition: transform 0.15s ease; }
        .nav-analytics-chevron.open { transform: rotate(180deg); }

        .nav-add-dropdown {
          background: #ffffff; border: 1px solid #ececec; border-radius: 10px;
          overflow: hidden; margin: 4px 0 2px 8px;
          box-shadow: 0 4px 16px rgba(16,24,40,0.08);
          animation: fadeDown 0.12s ease;
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .nav-add-dropdown-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 9px 13px; border: none; background: none;
          font-family: inherit; font-size: 13px; font-weight: 500;
          color: #4b5563; cursor: pointer; text-align: left; transition: all 0.12s;
        }
        .nav-add-dropdown-item svg { color: #6b7280; flex-shrink: 0; }
        .nav-add-dropdown-item:hover { background: #f7f7f7; color: #18181b; }
        .nav-add-dropdown-item:hover svg { color: #18181b; }
        .nav-add-dropdown-divider { height: 1px; background: #f1f1f1; }

        .sidebar-user {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-top: 1px solid #f1f1f1; flex-shrink: 0;
        }
        .user-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: #18181b; color: #fff; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600;
        }
        .user-meta { display: flex; flex-direction: column; line-height: 1.3; overflow: hidden; }
        .user-name {
          font-size: 13px; font-weight: 600; color: #18181b;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .user-role {
          font-size: 11px; font-weight: 400; color: #9ca3af;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
      `}</style>

      <div className="topbar">
        <button
          className={`hamburger-btn${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(prev => !prev)}
          aria-label="Toggle navigation"
        >
          <div className="hamburger-lines">
            <span /><span /><span />
          </div>
        </button>
        <span className="topbar-title">{pageTitle}</span>
      </div>
      {/* Spacer pushes page content below the fixed top bar */}
      <div className="topbar-spacer" />

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={handleOverlayClick} />
      )}

      <nav className={`navbar${sidebarOpen ? ' open' : ''}`}>
        <div className="navbar-brand" onClick={() => { navigate('/'); setSidebarOpen(false) }}>
          <div className="navbar-brand-left">
            <div className="brand-logo">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10A6 6 0 0 1 12 2z"/>
              </svg>
            </div>
            <span className="brand-name">Kalki Consulting</span>
          </div>
          <div className="brand-chevrons">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 15 12 20 17 15"/>
              <polyline points="7 9 12 4 17 9"/>
            </svg>
          </div>
        </div>

        <div className="navbar-inner">
          <span className="nav-section-label">Navigation</span>

          {/* Regular nav items: Expense, Sales, Projects, Income Tracker, Borrow, Lending */}
          {navItems.slice(0, 6).map((item) => (
            <button
              key={item.path}
              className={`nav-btn${location.pathname === item.path ? ' active' : ''}`}
              onClick={() => { navigate(item.path); setSidebarOpen(false) }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Expense Master */}
          {(() => {
            const item = navItems[6]
            return (
              <button
                key={item.path}
                className={`nav-btn master-btn${location.pathname === item.path ? ' active' : ''}`}
                onClick={() => { navigate(item.path); setSidebarOpen(false) }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })()}

          {/* Project Master */}
          {(() => {
            const item = navItems[7]
            return (
              <button
                key={item.path}
                className={`nav-btn master-btn${location.pathname === item.path ? ' active' : ''}`}
                onClick={() => { navigate(item.path); setSidebarOpen(false) }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })()}

          <div className="nav-divider" />
          <span className="nav-section-label" style={{ paddingTop: 0 }}>Actions</span>

          <div className="nav-add-wrapper" ref={dropdownRef}>
            <button className="nav-add-btn" onClick={() => setDropdownOpen(prev => !prev)}>
              <div className="nav-add-btn-left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add New
              </div>
              <svg className={`nav-add-chevron${dropdownOpen ? ' open' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div className="nav-add-dropdown">
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/employee')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Expense
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/project')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                  </svg>
                  Project
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/salesform')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Sales
                </button>
              </div>
            )}
          </div>

          <div className="nav-analytics-wrapper" ref={analyticsRef}>
            <button className="nav-analytics-btn" onClick={() => setAnalyticsOpen(prev => !prev)}>
              <div className="nav-analytics-btn-left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                View Analytics
              </div>
              <svg className={`nav-analytics-chevron${analyticsOpen ? ' open' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {analyticsOpen && (
              <div className="nav-add-dropdown">
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/projectanl')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                  </svg>
                  Project Analytics
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/salesanl')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                    <polyline points="16 7 22 7 22 13"/>
                  </svg>
                  Sales Analytics
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/expenseanl')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Expense Analytics
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">PS</div>
          <div className="user-meta">
            <span className="user-name">Prasang Sachdev</span>
            <span className="user-role">Owner</span>
          </div>
        </div>
      </nav>
    </>
  )
}

export default Navbar