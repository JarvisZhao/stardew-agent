import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// Production builds get a strict CSP. Dev mode skips it because React refresh
// injects an inline script.
const csp: Plugin = {
  name: 'stardew-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
      },
      injectTo: 'head-prepend'
    }
  ]
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(root, 'src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(root, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    build: {
      rollupOptions: { input: { index: resolve(root, 'src/renderer/index.html') } }
    },
    plugins: [react(), csp]
  }
})
