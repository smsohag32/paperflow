/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // Heavy, lazily loaded libraries — keep them out of the dev pre-bundle scan
    exclude: ['@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('pdf-lib') || id.includes('pako') || id.includes('fontkit')) return 'pdflib'
          if (id.includes('@huggingface') || id.includes('onnxruntime')) return 'ai'
          if (id.includes('tesseract')) return 'ocr'
          if (id.includes('mammoth')) return 'mammoth'
          if (id.includes('@dnd-kit')) return 'dnd'
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('radix-ui') || id.includes('@radix-ui')) return 'radix'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
  },
})
