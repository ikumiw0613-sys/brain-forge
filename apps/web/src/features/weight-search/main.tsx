import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WeightSearchPrototype } from './WeightSearchPrototype'

const initialSample = Math.random()
createRoot(document.getElementById('root')!).render(
  <StrictMode><WeightSearchPrototype initialSample={initialSample} /></StrictMode>,
)
