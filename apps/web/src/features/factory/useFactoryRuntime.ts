import { useState } from 'react'
import type { ConveyorSpeed } from '../game/conveyor'
import { defaultSupplySeed } from '../manufacturing/pythonSupply'
import { useManufacturingLine } from '../manufacturing/useManufacturingLine'
import { initialPythonCode } from '../weight-search/PythonEditor'

export function useFactoryRuntime() {
  const [speed, setSpeed] = useState<ConveyorSpeed>(1)
  const [instant, setInstant] = useState(false)
  const [draft, setDraft] = useState(initialPythonCode)
  const line = useManufacturingLine(speed, instant, defaultSupplySeed, initialPythonCode)

  return {
    line, speed, setSpeed, instant, setInstant, draft, setDraft,
  }
}

export type FactoryRuntime = ReturnType<typeof useFactoryRuntime>
