import { useCallback, useEffect, useRef, useState } from 'react'
import { getConveyorTickMs } from '../game/conveyor'
import { assessSearchResult, createWeightSearch, defaultWeights, getWeightSearchView, weightSearchReducer } from './engine'
import type { Measurement, WeightSearchAction } from './engine'

export const weightSearchTickMs = getConveyorTickMs(1)

export function useWeightSearch(initialSample: number, random: () => number) {
  const [state, setState] = useState(() => createWeightSearch(defaultWeights, initialSample))
  const current = useRef(state)
  const timer = useRef<number | undefined>(undefined)

  const clearClock = useCallback(() => {
    window.clearInterval(timer.current)
    timer.current = undefined
  }, [])
  useEffect(() => clearClock, [clearClock])

  // Apply each action once so Worker messages and clicks see the committed game
  // state even when React batches the resulting renders.
  function apply(action: WeightSearchAction) {
    const next = weightSearchReducer(current.current, action)
    if (next === current.current) return undefined
    current.current = next
    setState(next)
    return next
  }

  return {
    view: getWeightSearchView(state),
    beginAttempt() {
      const next = apply({ type: 'resetAttempt' })
      if (next) return { n: next.weights.length, target: next.order.requiredWeight }
    },
    assess(index: number) { return assessSearchResult(current.current, index) },
    weigh(index: number, onComplete?: (measurement: Measurement) => void) {
      if (!apply({ type: 'weigh', index })) return false
      const clock = window.setInterval(() => {
        if (timer.current !== clock) return
        const next = apply({ type: 'tick' })
        if (!next || next.pending) return
        clearClock()
        onComplete?.(next.log.at(-1)!)
      }, weightSearchTickMs)
      timer.current = clock
      return true
    },
    cancelWeigh() {
      clearClock()
      apply({ type: 'cancelWeigh' })
    },
    ship(index: number) { apply({ type: 'ship', index }) },
    nextOrder() {
      if (getWeightSearchView(current.current).completion) apply({ type: 'nextOrder', sample: random() })
    },
  }
}

export type WeightSearchGame = ReturnType<typeof useWeightSearch>
