// Runs the renderer in a plain browser. Without the Electron preload bridge the
// UI falls back to demo mode, which is handy for working on the farm visuals.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  plugins: [react()],
  server: { port: 5173, strictPort: true }
})
