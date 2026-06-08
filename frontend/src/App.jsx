import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react'
import { ClerkLoaded } from '@clerk/clerk-react'  // ADD THIS
// ADD this import at the top
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import Navbar from './assets/Navbar'
import LoginPage from './assets/LoginPage'
import Employee from './assets/employee'
import Project from './assets/project'
import EmployeeTable from './assets/employeetable'
import Projecttable from './assets/projecttable'
import Salesform from './assets/salesform'
import Salestable from './assets/salestable'
import Salesanl from './assets/salesanl'
import Projectanl from './assets/projectanl'
import Expenseanl from './assets/expenseanl'

function ProtectedLayout({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><Navigate to="/login" /></SignedOut>
    </>
  )
}

function PublicRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null
  if (isSignedIn) return <Navigate to="/" />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <SignedIn>
        <Navbar />
        <div style={{ paddingTop: '70px' }}></div>
      </SignedIn>

      <Routes>
        {/* Public — login page */}
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />

        <Route path="/login/sso-callback" element={<AuthenticateWithRedirectCallback /> } /> 
         <Route path="/login/factor-one" element={<LoginPage />} />
        {/* Protected routes */}
        <Route path="/" element={<ProtectedLayout><Employee /></ProtectedLayout>} />
        <Route path="/projecttable" element={<ProtectedLayout><Projecttable /></ProtectedLayout>} />
        <Route path="/employee" element={<ProtectedLayout><EmployeeTable /></ProtectedLayout>} />
        <Route path="/project" element={<ProtectedLayout><Project /></ProtectedLayout>} />
        <Route path="/salesform" element={<ProtectedLayout><Salesform /></ProtectedLayout>} />
        <Route path="/salestable" element={<ProtectedLayout><Salestable /></ProtectedLayout>} />
        <Route path="/salesanl" element={<ProtectedLayout><Salesanl /></ProtectedLayout>} />
        <Route path="/projectanl" element={<ProtectedLayout><Projectanl /></ProtectedLayout>} />
        <Route path="/expenseanl" element={<ProtectedLayout><Expenseanl /></ProtectedLayout>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App