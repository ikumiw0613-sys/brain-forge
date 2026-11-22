import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const pyodideDir = dirname(fileURLToPath(import.meta.resolve('pyodide/pyodide.mjs')))
const pyodideFiles = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: pyodideFiles.map(file => ({
        src: normalizePath(resolve(pyodideDir, file)),
        dest: 'pyodide',
        rename: { stripBase: true },
      })),
    }),
  ],
  server: { host: 'localhost', port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      input: [
        resolve(import.meta.dirname, 'index.html'),
        resolve(import.meta.dirname, 'prototypes/conveyor/index.html'),
        resolve(import.meta.dirname, 'prototypes/weight-search/index.html'),
      ],
    },
  },
})
