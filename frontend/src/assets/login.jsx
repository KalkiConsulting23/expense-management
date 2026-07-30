import React from 'react'
import { SignIn } from '@clerk/clerk-react'
import kalkiLogo from './kalki-logo.jpeg'

const clerkAppearance = {
  variables: {
    colorPrimary: '#2563eb',
    colorText: '#1f2937',
    colorTextSecondary: '#9ca3af',
    colorBackground: '#ffffff',
    colorInputBackground: '#f4f5f7',
    colorInputText: '#1f2937',
    borderRadius: '8px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    rootBox: { width: '100%' },
    card: {
      boxShadow: 'none',
      border: 'none',
      background: 'transparent',
      padding: 0,
      margin: 0,
      width: '100%',
    },
    header: { display: 'none' },
    socialButtonsBlockButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      border: '1px solid #eef0f3',
      background: '#fff',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 500,
      color: '#6b7280',
      height: '42px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      '&:hover': { background: '#fafbfc' },
    },
    socialButtonsBlockButtonText: {
      fontWeight: 500,
      color: '#6b7280',
      flex: 'initial',
    },
    socialButtonsProviderIcon: { width: '18px', height: '18px' },
    dividerLine: { background: '#eef0f3' },
    dividerText: { color: '#c4c9d1', fontSize: '12px', textTransform: 'lowercase' },
    formFieldLabel: {
      fontSize: '13px',
      fontWeight: 600,
      color: '#4b5563',
      marginBottom: '6px',
    },
    formFieldInput: {
      background: '#f4f5f7',
      border: '1px solid transparent',
      borderRadius: '8px',
      fontSize: '13px',
      padding: '11px 14px',
      color: '#4b5563',
      '&:focus': {
        background: '#fff',
        borderColor: '#2563eb',
        boxShadow: '0 0 0 3px rgba(37,99,235,0.10)',
      },
    },
    formButtonPrimary: {
      background: '#2563eb',
      borderRadius: '999px',
      fontSize: '14px',
      fontWeight: 700,
      textTransform: 'none',
      padding: '12px',
      boxShadow: '0 6px 16px rgba(37,99,235,0.3)',
      '&:hover': { background: '#1d4ed8' },
    },
    footerAction: { display: 'flex', justifyContent: 'flex-start' },
    footerActionLink: {
      color: '#2563eb',
      fontWeight: 600,
      '&:hover': { color: '#1d4ed8' },
    },
    formFieldAction: { color: '#2563eb', fontWeight: 600 },
    identityPreviewEditButton: { color: '#2563eb' },
  },
}

const Login = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        boxSizing: 'border-box',
        fontFamily: "'Inter', system-ui, sans-serif",
        background:
          'linear-gradient(135deg, #d1483f 0%, #e8734d 45%, #f0955e 100%)',
      }}
    >
      {/* Floating card */}
      <div
        className="kalki-login-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '1040px',
          minHeight: '600px',
          background: '#fff',
          borderRadius: '28px',
          boxShadow: '0 40px 90px rgba(0,0,0,0.22)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          overflow: 'hidden',
        }}
      >
        {/* Left navy panel */}
        <div
          className="kalki-login-brand"
          style={{
            position: 'relative',
            background: '#1f2544',
            padding: '48px',
            color: '#fff',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Ghosted watermark logo text */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '30px',
              top: '90px',
              fontSize: '190px',
              fontWeight: 800,
              lineHeight: 0.82,
              letterSpacing: '-0.05em',
              color: 'rgba(255,255,255,0.04)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            L<br />o<br />g
          </div>

          {/* Logo lockup */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <img
              src={kalkiLogo}
              alt="Kalki Consulting"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#fff',
              }}
            />
            <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.01em' }}>
              Kalki
            </span>
          </div>

          {/* Headline block */}
          <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', marginBottom: 'auto' }}>
            <h1
              style={{
                fontSize: '52px',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                margin: '0 0 20px',
              }}
            >
              Welcome
              <br />
              Back
            </h1>
            <p
              style={{
                fontSize: '14px',
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.55)',
                maxWidth: '330px',
                margin: 0,
              }}
            >
              Track expenses, projects, sales, and budgets across the financial
              year — all in one unified workspace for your business.
            </p>
          </div>
        </div>

        {/* Right form panel */}
        <div
          style={{
            position: 'relative',
            padding: '56px 52px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#fff',
          }}
        >
          {/* Decorative blob bottom-right */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '-40px',
              bottom: '-40px',
              width: '150px',
              height: '150px',
              borderRadius: '40px',
              background: '#aeb4c7',
              opacity: 0.35,
              transform: 'rotate(20deg)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '340px', margin: '0 auto' }}>
            <h2
              style={{
                fontSize: '26px',
                fontWeight: 600,
                color: '#374151',
                margin: '0 0 24px',
              }}
            >
              Sign In
            </h2>

            <SignIn routing="hash" appearance={clerkAppearance} />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .kalki-login-card { grid-template-columns: 1fr !important; max-width: 440px !important; }
          .kalki-login-brand { display: none !important; }
        }
      `}</style>
    </div>
  )
}

export default Login