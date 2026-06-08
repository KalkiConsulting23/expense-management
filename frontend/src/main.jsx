import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClerkProvider } from '@clerk/clerk-react'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <ClerkProvider 
    publishableKey={publishableKey}
    appearance={{
      variables: {
        colorPrimary: '#c97844',           // your brand orange
        colorBackground: '#fffdf8',        // your app background
        colorText: '#2e2318',              // your dark text
        colorTextSecondary: '#b08a5e',     // your muted text
        colorInputBackground: '#faf6ee',   // your input background
        colorInputText: '#2e2318',         // your input text
        borderRadius: '10px',              // your border radius
        fontFamily: 'DM Sans, sans-serif', // your font
      },
      elements: {
        card: {
          boxShadow: '0 2px 0 #e2d9c8, 0 8px 24px rgba(160,130,90,0.10)',
          border: '1.5px solid #e8dece',
        },
        formButtonPrimary: {
          backgroundColor: '#c97844',
          '&:hover': { backgroundColor: '#b5672f' },
        },
      }
    }}
  >
    <App />
  </ClerkProvider>
)