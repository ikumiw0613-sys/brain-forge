import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorldMap } from './WorldMap'

createRoot(document.getElementById('root')!).render(<StrictMode><WorldMap /></StrictMode>)
