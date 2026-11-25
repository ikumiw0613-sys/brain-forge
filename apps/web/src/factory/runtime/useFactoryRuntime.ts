import { useState } from 'react'
import type { ConveyorSpeed } from '../../features/game/conveyor'
import { defaultSupplySeed } from '../../features/manufacturing/pythonSupply'
import { usePythonDraft } from '../python/usePythonDraft'
import { useManufacturingLine } from './useManufacturingLine'
import { initialPythonCode } from '../warehouse/initialPythonCode'

export function useFactoryRuntime() {
  const [speed, setSpeed] = useState<ConveyorSpeed>(1)
  const [instant, setInstant] = useState(false)
  const [draft, setDraft] = usePythonDraft('warehouse', initialPythonCode)
  const line = useManufacturingLine(speed, instant, defaultSupplySeed, initialPythonCode)

  return {
    line, speed, setSpeed, instant, setInstant, draft, setDraft,
  }
}

export type FactoryRuntime = ReturnType<typeof useFactoryRuntime>
