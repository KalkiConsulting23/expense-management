import React from 'react'
import { SignIn } from '@clerk/clerk-react'

/* ---- Black & white palette ---- */
const ACCENT = '#111111'
const ACCENT_DARK = '#000000'
const BG = '#f4f4f4'
const INK = '#111111'
const BORDER = '#e5e5e5'
const BORDER_DARK = '#cfcfcf'
const MUTED = '#6b7280'
const DOODLE = '#bdbdbd'
const DOODLE_FILL = '#d9d9d9'

const clerkAppearance = {
  layout: {
    socialButtonsPlacement: 'bottom',
    socialButtonsVariant: 'blockButton',
  },
  variables: {
    colorPrimary: ACCENT,
    colorText: INK,
    colorTextSecondary: MUTED,
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: INK,
    colorNeutral: INK,
    borderRadius: '10px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    rootBox: { width: '100%' },
    card: {
      boxShadow: 'none',
      border: 'none',
      background: '#ffffff',
      padding: 0,
      margin: 0,
      width: '100%',
    },
    header: { display: 'none' },
    formFieldLabel: {
      fontSize: '13px',
      fontWeight: 600,
      color: MUTED,
      marginBottom: '6px',
    },
    formFieldInput: {
      background: '#ffffff',
      border: `1.5px solid ${BORDER}`,
      borderRadius: '10px',
      fontSize: '14px',
      padding: '12px 14px',
      color: INK,
      fontWeight: 500,
      '&:focus': {
        borderColor: ACCENT,
        boxShadow: '0 0 0 4px rgba(17, 17, 17, 0.10)',
      },
    },
    formButtonPrimary: {
      background: ACCENT,
      borderRadius: '10px',
      fontSize: '15px',
      fontWeight: 700,
      textTransform: 'none',
      padding: '12px 24px',
      color: '#ffffff',
      boxShadow: 'none',
      '&:hover': { background: '#333333' },
    },
    socialButtonsBlockButton: {
      border: `1.5px solid ${BORDER}`,
      background: '#ffffff',
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: 600,
      color: INK,
      height: '44px',
      '&:hover': { background: '#fafafa', borderColor: BORDER_DARK },
    },
    socialButtonsBlockButtonText: { fontWeight: 600, color: INK },
    badge: { display: 'none' },
    dividerLine: { background: BORDER },
    dividerText: { color: '#9ca3af', fontSize: '12px', fontWeight: 500 },
    footer: { background: '#ffffff', borderTop: 'none' },
    footerActionText: { color: MUTED, fontSize: '13px' },
    footerActionLink: { color: ACCENT_DARK, fontWeight: 700, fontSize: '13px' },
    formFieldAction: { color: MUTED, fontWeight: 600, fontSize: '13px' },
    logoBox: { display: 'none' },
    footerPages: { display: 'none' },
  },
}

const Login = () => {
  return (
    <div className="kalki-root">
      <div className="kalki-stage">
        {/* ===== Top Navbar — brand text only ===== */}
        <header className="kalki-header">
          <span className="kalki-brand">Kalki</span>
          <a href="mailto:prasang@kalki-consulting.com" className="kalki-email">
            prasang@kalki-consulting.com &rarr;
          </a>
        </header>

        {/* ===== Body ===== */}
        <div className="kalki-body">
          <Doodles />
          <PersonIllustration />

          {/* ===== Centered White Login Card ===== */}
          <div className="kalki-card">
            <div className="kalki-card-head">
              <h1>Welcome Back</h1>
              <p>Sign in to manage your budgets, track expenses, and stay on top of your finances.</p>
            </div>
            <SignIn routing="hash" appearance={clerkAppearance} />
          </div>

          <div className="kalki-copyright">
            &copy; {new Date().getFullYear()} Kalki Consulting &nbsp;|&nbsp; Privacy Policy
          </div>
        </div>
      </div>

      <style>{`
        /* ---- prevent page scrollbar ---- */
        html, body, #root { margin: 0; padding: 0; height: 100%; }

        .kalki-root {
          min-height: 100vh;
          width: 100%;
          background: ${BG};
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
        }
        .kalki-stage {
          position: relative;
          width: 100%;
          max-width: 1080px;
          min-height: 620px;
          background: ${BG};
          border-radius: 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .kalki-header {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 26px 40px 0;
          z-index: 5;
        }
        .kalki-brand { font-size: 20px; font-weight: 800; color: ${INK}; letter-spacing: -0.02em; }
        .kalki-email { font-size: 11px; color: #9ca3af; text-decoration: none; font-weight: 500; }

        .kalki-body {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ===== The card: fixed width, everything inside forced to fit ===== */
        .kalki-card {
          position: relative;
          z-index: 4;
          width: 380px;
          max-width: calc(100% - 40px);
          background: #ffffff;
          border-radius: 20px;
          padding: 34px 32px 26px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.12);
          box-sizing: border-box;
        }
        .kalki-card-head { text-align: center; margin-bottom: 20px; }
        .kalki-card-head h1 {
          font-size: 26px; font-weight: 800; color: ${INK};
          margin: 0 0 8px; letter-spacing: -0.02em;
        }
        .kalki-card-head p {
          font-size: 13px; color: #9ca3af; line-height: 1.5; margin: 0;
        }

        /* ===== HARD RESET on every Clerk element so nothing overflows ===== */
        .kalki-card .cl-rootBox,
        .kalki-card .cl-card,
        .kalki-card .cl-main,
        .kalki-card .cl-form,
        .kalki-card .cl-footer,
        .kalki-card .cl-socialButtons,
        .kalki-card .cl-formFieldRow,
        .kalki-card .cl-formField,
        .kalki-card .cl-dividerRow {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          overflow: visible !important;
          background-color: #ffffff !important;
        }
        .kalki-card .cl-formFieldInput,
        .kalki-card .cl-formButtonPrimary,
        .kalki-card .cl-socialButtonsBlockButton {
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .kalki-card .cl-footer,
        .kalki-card .cl-footer * { background-color: #ffffff !important; }
        .kalki-card .cl-footer { border-top: none !important; }

        .kalki-copyright {
          position: absolute;
          bottom: 16px; left: 0; right: 0;
          text-align: center;
          font-size: 11px; color: #9a9a9a; font-weight: 500;
          z-index: 3;
        }

        /* doodles / person */
        .kalki-doodle { position: absolute; z-index: 1; }
        .kalki-person { position: absolute; right: 60px; bottom: 90px; z-index: 2; }

        @media (max-width: 820px) {
          .kalki-person { display: none; }
          .kalki-doodle { opacity: 0.35; }
          .kalki-card { width: 100%; }
        }
      `}</style>
    </div>
  )
}

/* ---------- presentational pieces ---------- */

const Doodles = () => (
  <>
    <svg className="kalki-doodle" style={{ top: '60px', left: '70px' }}
      width="90" height="30" viewBox="0 0 90 30" fill="none" stroke={DOODLE} strokeWidth="2" strokeLinecap="round">
      <path d="M2 15 Q12 2 22 15 T42 15 T62 15 T82 15" />
    </svg>
    <svg className="kalki-doodle" style={{ bottom: '70px', left: '90px' }}
      width="70" height="110" viewBox="0 0 70 110">
      <rect width="70" height="110" rx="6" fill={DOODLE_FILL} />
      {Array.from({ length: 6 }).map((_, r) =>
        Array.from({ length: 4 }).map((_, c) => (
          <circle key={r + '-' + c} cx={12 + c * 15} cy={14 + r * 16} r="2.4" fill={INK} opacity="0.55" />
        ))
      )}
    </svg>
    <svg className="kalki-doodle" style={{ bottom: '78px', left: '175px' }}
      width="80" height="90" viewBox="0 0 80 90" fill="none" stroke={DOODLE} strokeWidth="2">
      <rect x="2" y="2" width="76" height="86" rx="4" fill="#ffffff" />
      <path d="M24 60 L40 30 L56 46" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48 30 L56 30 L56 38" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <svg className="kalki-doodle" style={{ top: '150px', left: '150px' }}
      width="72" height="56" viewBox="0 0 72 56" fill="none" stroke={DOODLE} strokeWidth="2">
      <rect x="2" y="2" width="68" height="44" rx="4" />
      <path d="M20 52 L28 46" strokeLinecap="round" />
      <line x1="14" y1="18" x2="46" y2="18" strokeLinecap="round" />
      <line x1="14" y1="28" x2="38" y2="28" strokeLinecap="round" />
    </svg>
    <svg className="kalki-doodle" style={{ top: '120px', right: '120px' }}
      width="72" height="56" viewBox="0 0 72 56" fill="none" stroke={DOODLE} strokeWidth="2">
      <rect x="2" y="2" width="68" height="44" rx="4" />
      <line x1="14" y1="18" x2="46" y2="18" strokeLinecap="round" />
      <line x1="14" y1="28" x2="38" y2="28" strokeLinecap="round" />
    </svg>
    <svg className="kalki-doodle" style={{ bottom: '70px', right: '95px' }}
      width="60" height="95" viewBox="0 0 60 95">
      <rect width="60" height="95" rx="6" fill={DOODLE_FILL} />
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 3 }).map((_, c) => (
          <circle key={r + '-' + c} cx={12 + c * 18} cy={14 + r * 17} r="2.4" fill={INK} opacity="0.55" />
        ))
      )}
    </svg>
    <svg className="kalki-doodle" style={{ top: '175px', right: '175px' }}
      width="70" height="24" viewBox="0 0 70 24" fill="none" stroke={DOODLE} strokeWidth="2" strokeLinecap="round">
      <path d="M2 12 Q10 2 18 12 T34 12 T50 12 T66 12" />
    </svg>
  </>
)

const PersonIllustration = () => (
  <svg
    className="kalki-person"
    width="200" height="240" viewBox="0 0 200 240" fill="none"
    stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
  >
    <rect x="70" y="150" width="70" height="70" fill="#ffffff" />
    <circle cx="96" cy="48" r="16" fill={INK} />
    <circle cx="112" cy="40" r="7" fill={INK} />
    <path d="M78 150 Q80 95 96 78 Q114 92 120 150 Z" fill={INK} />
    <circle cx="94" cy="112" r="2" fill="#ffffff" />
    <circle cx="104" cy="104" r="2" fill="#ffffff" />
    <circle cx="100" cy="126" r="2" fill="#ffffff" />
    <circle cx="90" cy="132" r="2" fill="#ffffff" />
    <path d="M118 108 Q140 118 148 138" />
    <path d="M84 150 Q70 178 96 190" />
    <path d="M110 150 Q128 176 100 192" />
    <path d="M92 188 L82 196" />
    <path d="M96 190 L106 198" />
    <path d="M132 138 L164 138 L170 154 L126 154 Z" fill="#ffffff" />
    <line x1="138" y1="138" x2="158" y2="138" />
  </svg>
)

export default Login