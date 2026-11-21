import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConveyorPrototype } from './ConveyorPrototype'
import '../../style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><ConveyorPrototype /></StrictMode>,
)
