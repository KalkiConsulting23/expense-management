import { SignIn } from '@clerk/clerk-react'

function LoginPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#fffdf8',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        marginBottom: '24px',
      }}>
        <div style={{
          width: '40px', height: '40px',
          borderRadius: '10px',
          background: '#c97844',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: '700',
          color: '#fff',
        }}>KC</div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#2e2318' }}>
            Kalki Consulting
          </div>
          <div style={{ fontSize: '10px', color: '#b08a5e', letterSpacing: '1.4px', textTransform: 'uppercase' }}>
            Management Portal
          </div>
        </div>
      </div>

      <SignIn 
  routing="path" 
  path="/login"
  afterSignInUrl="/"
  afterSignUpUrl="/"
/>
    </div>
  )
}

export default LoginPage