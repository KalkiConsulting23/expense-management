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

  const navItems = [
    {
      label: 'Expense',
      path: '/',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      ),
    },
    {
      label: 'Projects',
      path: '/projecttable',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
      ),
    },
    {
      label: 'Expense Master',
      path: '/expensemaster',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        .hamburger-btn {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 200;
          width: 40px;
          height: 40px;
          border-radius: 0 0 10px 0;
          border: none;
          border-right: 1.5px solid #e8dece;
          border-bottom: 1.5px solid #e8dece;
          background: #fffdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.18s ease;
          box-shadow: 2px 2px 0 #e2d9c8;
        }
        .hamburger-btn:hover { background: #fdf0e0; }
        .hamburger-btn.open { background: #fdf0e0; border-color: #d4b090; }
        .hamburger-lines { display: flex; flex-direction: column; gap: 4px; width: 16px; }
        .hamburger-lines span {
          display: block; height: 1.5px; border-radius: 2px;
          background: #c97844; transition: none;
        }

        .sidebar-overlay {
          position: fixed; inset: 0;
          background: rgba(46, 35, 24, 0.35);
          z-index: 99; backdrop-filter: blur(2px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .navbar {
          position: fixed; top: 0; left: 0;
          height: 100vh; width: 240px;
          background: #fffdf8;
          display: flex; flex-direction: column;
          z-index: 100;
          font-family: 'DM Sans', sans-serif;
          border-right: 1.5px solid #e8dece;
          box-shadow: 2px 0 0 #e2d9c8, 4px 0 24px rgba(160,130,90,0.08);
          transform: translateX(-100%);
          transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .navbar.open { transform: translateX(0); }

        .navbar-brand {
          display: flex; align-items: center; gap: 11px;
          padding: 0 18px 0 50px; height: 40px;
          cursor: pointer; border-bottom: 1.5px solid #e8dece; flex-shrink: 0;
        }
        .brand-logo {
          width: 30px; height: 30px; border-radius: 8px;
          background: #c97844; display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
          font-family: 'DM Sans', sans-serif;
        }
        .brand-text { display: flex; flex-direction: column; line-height: 1.2; }
        .brand-name { font-family: 'Lora', serif; font-size: 12px; font-weight: 600; color: #2e2318; }
        .brand-sub {
          font-size: 9px; font-weight: 500; color: #b08a5e;
          letter-spacing: 1.4px; text-transform: uppercase; margin-top: 2px;
        }

        .navbar-inner {
          flex: 1; overflow-y: auto; padding: 14px 10px;
          display: flex; flex-direction: column; gap: 2px; scrollbar-width: none;
        }
        .navbar-inner::-webkit-scrollbar { display: none; }

        .nav-section-label {
          font-size: 10px; font-weight: 500; color: #b08a5e;
          letter-spacing: 1.4px; text-transform: uppercase; padding: 10px 12px 6px;
        }
        .nav-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 9px 12px;
          border-radius: 10px; border: none;
          border-left: 3px solid transparent;
          background: none; font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 500; color: #9a8775;
          cursor: pointer; text-align: left; transition: all 0.15s;
        }
        .nav-btn:hover { background: #f5ede0; color: #2e2318; }
        .nav-btn.active { background: #fff2e8; color: #c97844; border-left-color: #c97844; }

        .nav-btn.master-btn {
          border: 1px dashed #d4b090;
          color: #8c7a68;
          background: #fdf8f2;
          margin-top: 2px;
        }
        .nav-btn.master-btn:hover { background: #f5ede0; color: #2e2318; border-color: #c97844; }
        .nav-btn.master-btn.active {
          background: #fff2e8; color: #c97844;
          border-left-color: #c97844; border-color: #c97844;
        }

        .nav-divider {
          height: 1px;
          background: linear-gradient(to right, #e8dece, transparent);
          margin: 8px 2px;
        }
        .year-badge { font-size: 10px; font-weight: 500; color: #c5b49e; padding: 0 12px 4px; letter-spacing: 0.8px; }
        .nav-add-wrapper { position: relative; margin-top: 2px; }
        .nav-add-btn {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 10px 12px; border-radius: 10px; border: none;
          background: #c97844; font-family: 'DM Sans', sans-serif;
          font-size: 11px; font-weight: 500; color: #fff; cursor: pointer;
          transition: all 0.15s; letter-spacing: 1px; text-transform: uppercase;
        }
        .nav-add-btn:hover { background: #b5672f; }
        .nav-add-btn-left { display: flex; align-items: center; gap: 8px; }
        .nav-add-chevron { color: rgba(255,255,255,0.7); transition: transform 0.15s ease; }
        .nav-add-chevron.open { transform: rotate(180deg); }

        .nav-analytics-wrapper { position: relative; margin-top: 6px; }
        .nav-analytics-btn {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 10px 12px; border-radius: 10px;
          border: 1.5px solid #e0d4c0; background: #faf6ee;
          font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 500;
          color: #8c7a68; cursor: pointer; transition: all 0.15s;
          letter-spacing: 1px; text-transform: uppercase;
        }
        .nav-analytics-btn:hover { background: #f5ede0; border-color: #c97844; color: #2e2318; }
        .nav-analytics-btn-left { display: flex; align-items: center; gap: 8px; }
        .nav-analytics-chevron { color: #c5b49e; transition: transform 0.15s ease; }
        .nav-analytics-chevron.open { transform: rotate(180deg); }

        .nav-add-dropdown {
          background: #fffdf8; border: 1.5px solid #e0d4c0; border-radius: 12px;
          overflow: hidden; margin-top: 6px;
          box-shadow: 0 2px 0 #e2d9c8, 0 8px 24px rgba(160,130,90,0.10);
          animation: fadeDown 0.12s ease;
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .nav-add-dropdown-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 14px; border: none; background: none;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 400;
          color: #9a8775; cursor: pointer; text-align: left; transition: all 0.12s;
        }
        .nav-add-dropdown-item:hover { background: #f5ede0; color: #2e2318; }
        .nav-add-dropdown-divider { height: 1px; background: #e8dece; }

        .sidebar-user {
          display: flex; flex-direction: column; gap: 4px;
          padding: 16px 18px; border-top: 1.5px solid #e8dece; flex-shrink: 0;
        }
        .user-name {
          font-family: 'Lora', serif; font-size: 13px; font-weight: 600; color: #2e2318;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .user-role {
          font-size: 10px; font-weight: 500; color: #b08a5e;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          text-transform: uppercase; letter-spacing: 0.8px;
        }
      `}</style>

      <button
        className={`hamburger-btn${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(prev => !prev)}
        aria-label="Toggle navigation"
      >
        <div className="hamburger-lines">
          <span /><span /><span />
        </div>
      </button>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={handleOverlayClick} />
      )}

      <nav className={`navbar${sidebarOpen ? ' open' : ''}`}>
        <div className="navbar-brand" onClick={() => { navigate('/'); setSidebarOpen(false) }}>
          <div className="brand-logo">KC</div>
          <div className="brand-text">
            <span className="brand-name">Kalki Consulting</span>
            <span className="brand-sub">Management Portal</span>
          </div>
        </div>

        <div className="navbar-inner">
          <span className="nav-section-label">Navigation</span>

          {/* Regular nav items */}
          {navItems.slice(0, 3).map((item) => (
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
            const item = navItems[3]
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
            const item = navItems[4]
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
          <span className="year-badge">{new Date().getFullYear()}</span>

          <div className="nav-add-wrapper" ref={dropdownRef}>
            <button className="nav-add-btn" onClick={() => setDropdownOpen(prev => !prev)}>
              <div className="nav-add-btn-left">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add New
              </div>
              <svg className={`nav-add-chevron${dropdownOpen ? ' open' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div className="nav-add-dropdown">
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/employee')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Expense
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/project')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                  </svg>
                  Project
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAddNavigate('/salesform')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                View Analytics
              </div>
              <svg className={`nav-analytics-chevron${analyticsOpen ? ' open' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {analyticsOpen && (
              <div className="nav-add-dropdown">
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/projectanl')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                  </svg>
                  Project Analytics
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/salesanl')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                    <polyline points="16 7 22 7 22 13"/>
                  </svg>
                  Sales Analytics
                </button>
                <div className="nav-add-dropdown-divider" />
                <button className="nav-add-dropdown-item" onClick={() => handleAnalyticsNavigate('/expenseanl')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <span className="user-name">Prasang Sachdev</span>
          <span className="user-role">Owner</span>
        </div>
      </nav>
    </>
  )
}

export default Navbar