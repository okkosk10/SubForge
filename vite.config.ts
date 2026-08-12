import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@renderer': path.resolve(import.meta.dirname, 'src/renderer'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: 'src/preload/preload.ts',
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
    renderer(),
  ],
})
