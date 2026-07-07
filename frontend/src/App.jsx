import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const Navbar        = lazy(() => import('./assets/Navbar'))
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

function App() {
  return (
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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Suspense>
    </BrowserRouter>
  )
}

export default App