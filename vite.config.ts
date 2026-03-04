import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  // './' makes asset URLs relative so they work with file:// protocol in Electron
  base: './',
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Electron 33 ships Chromium 130 — no need to transpile down further
    target: 'chrome118',
    // esbuild is already the default minifier and the fastest option
    minify: 'esbuild',
    // Skip gzip size reporting — saves a few seconds per build
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
  esbuild: {
    // Skip extracting/preserving license comments — speeds up esbuild pass
    legalComments: 'none',
  },
})
