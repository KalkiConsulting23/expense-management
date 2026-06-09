import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ClerkProvider has been completely removed to match your broad auth-free local server setup
createRoot(document.getElementById('root')).render(
  <App />
)