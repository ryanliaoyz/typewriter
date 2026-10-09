import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { MODEL_PROXY_PATH, readModelConfig } from './src/checking/config.ts'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      [MODEL_PROXY_PATH]: {
        target: readModelConfig(loadEnv(mode, process.cwd(), 'VITE_'), true).serverUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama(?=\/|$)/, ''),
      },
    },
  },
  // Vite preview otherwise inherits server.proxy, but this proxy is dev-only.
  preview: { proxy: {} },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
