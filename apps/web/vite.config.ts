import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { sortingJudgeProxy } from './dev/sortingJudgeProxy.ts'

const pyodideDir = dirname(fileURLToPath(import.meta.resolve('pyodide/pyodide.mjs')))
const pyodideFiles = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

export default defineConfig(({ command, mode, isPreview }) => ({
  define: { __DEV_SORTING_JUDGE__: command === 'serve' && !isPreview && (mode === 'development' || process.env.VITEST === 'true') },
  plugins: [
    command === 'serve' && mode === 'development' && !isPreview && sortingJudgeProxy(resolve(import.meta.dirname, '../api')),
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
        resolve(import.meta.dirname, 'map/index.html'),
        resolve(import.meta.dirname, 'prototypes/conveyor/index.html'),
        resolve(import.meta.dirname, 'prototypes/weight-search/index.html'),
        resolve(import.meta.dirname, 'prototypes/manufacturing/index.html'),
      ],
    },
  },
}))
