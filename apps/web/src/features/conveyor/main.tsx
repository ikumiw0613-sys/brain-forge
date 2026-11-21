import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConveyorPrototype } from './ConveyorPrototype'
import '../../style.css'

function mountFactory() {
  const root = createRoot(document.getElementById('root')!)
  root.render(<StrictMode><ConveyorPrototype /></StrictMode>)
  window.addEventListener('pagehide', () => root.unmount(), { once: true })
}

mountFactory()
window.addEventListener('pageshow', event => {
  if (event.persisted) mountFactory()
})
