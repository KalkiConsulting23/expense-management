import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // 👈 ADD THIS: Forces absolute paths for your built assets
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000', 
        changeOrigin: true,
      }
    }
  }
})