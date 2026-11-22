import { useCallback, useEffect, useRef, useState } from 'react'
import { getConveyorTickMs } from '../game/conveyor'
import { assessSearchResult, createWeightSearch, defaultWeights, generateWeights, getWeightSearchView, weightSearchReducer } from './engine'
import type { Measurement, WeightSearchAction } from './engine'
import { dockIndex, retractMs, shipmentMs } from './robotMotion'
import type { RobotMotion } from './robotMotion'

export const weightSearchTickMs = getConveyorTickMs(1)

type RobotState = Readonly<{ parked: number; motion: RobotMotion | null }>

export function useWeightSearch(initialSample: number, random: () => number) {
  const [state, setState] = useState(() => createWeightSearch(defaultWeights, initialSample))
  const [robot, setRobot] = useState<RobotState>({ parked: 0, motion: null })
  const current = useRef(state)
  const currentRobot = useRef(robot)
  const timer = useRef<number | undefined>(undefined)

  const clearClock = useCallback(() => {
    window.clearTimeout(timer.current)
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

  function publishRobot(next: RobotState) {
    currentRobot.current = next
    setRobot(next)
  }

  function startMotion(kind: RobotMotion['kind'], index: number): RobotMotion {
    const { parked } = currentRobot.current
    const motion = { kind, from: parked, index, startedAt: performance.now() }
    publishRobot({ parked, motion })
    return motion
  }

  function park(index: number) {
    clearClock()
    publishRobot({ parked: index, motion: null })
  }

  return {
    view: getWeightSearchView(state),
    robot,
    resize(size: number) {
      clearClock()
      publishRobot({ parked: 0, motion: null })
      apply({ type: 'resize', weights: generateWeights(size, random), sample: random() })
    },
    beginAttempt() {
      if (currentRobot.current.motion) return
      const next = apply({ type: 'resetAttempt' })
      if (next) return { n: next.weights.length, target: next.order.requiredWeight }
    },
    assess(index: number) { return assessSearchResult(current.current, index) },
    weigh(index: number, onComplete?: (measurement: Measurement) => void) {
      if (currentRobot.current.motion || !apply({ type: 'weigh', index })) return false
      const motion = startMotion('weigh', index)
      function tick() {
        if (currentRobot.current.motion !== motion) return
        const next = apply({ type: 'tick' })
        if (!next) return
        if (next.pending) {
          timer.current = window.setTimeout(tick, weightSearchTickMs)
          return
        }
        // The second Tick commits the measurement. The return stroke occupies
        // the robot, and only its fixed deadline releases the Worker.
        const raising = { ...motion, retractAt: performance.now() }
        publishRobot({ parked: index, motion: raising })
        timer.current = window.setTimeout(() => {
          if (currentRobot.current.motion !== raising) return
          park(index)
          onComplete?.(next.log.at(-1)!)
        }, retractMs)
      }
      timer.current = window.setTimeout(tick, weightSearchTickMs)
      return true
    },
    cancelWeigh() {
      const { parked, motion } = currentRobot.current
      if (motion?.kind !== 'weigh') return
      apply({ type: 'cancelWeigh' })
      park(parked)
    },
    ship(index: number) {
      if (currentRobot.current.motion) return
      const view = getWeightSearchView(current.current)
      if (view.completion || view.confirmed !== index) return
      const motion = startMotion('ship', index)
      timer.current = window.setTimeout(() => {
        if (currentRobot.current.motion !== motion) return
        const next = apply({ type: 'ship', index })
        park(next ? dockIndex : motion.from)
      }, shipmentMs)
    },
    nextOrder() {
      if (getWeightSearchView(current.current).completion) apply({ type: 'nextOrder', sample: random() })
    },
  }
}

export type WeightSearchGame = ReturnType<typeof useWeightSearch>
