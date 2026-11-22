import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ManufacturingPrototype } from './ManufacturingPrototype'

function mount() {
  const root = createRoot(document.getElementById('root')!)
  root.render(<StrictMode><ManufacturingPrototype /></StrictMode>)
  window.addEventListener('pagehide', () => root.unmount(), { once: true })
}

mount()
window.addEventListener('pageshow', event => { if (event.persisted) mount() })
