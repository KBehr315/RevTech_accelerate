import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // There is no local database: /api goes to the deployed server, which accepts
    // a localhost sign-in because http://localhost:3000/ is a registered redirect URI.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'https://accelerate.revtech.consulting',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
