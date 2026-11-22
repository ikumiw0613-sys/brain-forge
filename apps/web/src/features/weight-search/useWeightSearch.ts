import { useCallback, useEffect, useRef, useState } from 'react'
import { getConveyorTickMs } from '../game/conveyor'
import { assessSearchResult, createWeightSearch, defaultWeights, generateWeights, getWeightSearchView, weightSearchReducer } from './engine'
import type { Measurement, WeightSearchAction } from './engine'
import { dockIndex, retractMs, shipmentMs } from './robotMotion'
import type { RobotMotion, WeighSpeed } from './robotMotion'

export const weightSearchTickMs = getConveyorTickMs(1)

type RobotState = Readonly<{ parked: number; motion: RobotMotion | null }>

export function useWeightSearch(initialSample: number, random: () => number) {
  const [state, setState] = useState(() => createWeightSearch(defaultWeights, initialSample))
  const [robot, setRobot] = useState<RobotState>({ parked: 0, motion: null })
  const current = useRef(state)
  const currentRobot = useRef(robot)
  const timer = useRef<number | undefined>(undefined)
  const uiTimer = useRef<number | undefined>(undefined)
  const [speed, setSelectedSpeed] = useState<WeighSpeed>(1)
  const currentSpeed = useRef<WeighSpeed>(1)

  const clearClock = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])
  useEffect(() => clearClock, [clearClock])
  useEffect(() => () => window.clearTimeout(uiTimer.current), [])

  function flushMeasurements() {
    if (uiTimer.current === undefined) return
    window.clearTimeout(uiTimer.current)
    uiTimer.current = undefined
    setState(current.current)
    setRobot(currentRobot.current)
  }

  // Apply each action once so Worker messages and clicks see the committed game
  // state even when React batches the resulting renders.
  function apply(action: WeightSearchAction, render = true) {
    const next = weightSearchReducer(current.current, action)
    if (next === current.current) return undefined
    current.current = next
    if (render) setState(next)
    return next
  }

  function publishRobot(next: RobotState) {
    currentRobot.current = next
    setRobot(next)
  }

  function startMotion(kind: RobotMotion['kind'], index: number, speed: RobotMotion['speed'] = 1): RobotMotion {
    const { parked } = currentRobot.current
    const motion = { kind, from: parked, index, startedAt: performance.now(), speed }
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
    speed,
    setSpeed(next: WeighSpeed) {
      flushMeasurements()
      currentSpeed.current = next
      setSelectedSpeed(next)
    },
    flushMeasurements,
    resize(size: number) {
      flushMeasurements()
      clearClock()
      publishRobot({ parked: 0, motion: null })
      apply({ type: 'resize', weights: generateWeights(size, random), sample: random() })
    },
    beginAttempt() {
      if (currentRobot.current.motion) return
      flushMeasurements()
      const next = apply({ type: 'resetAttempt' })
      if (next) return { n: next.weights.length, target: next.order.requiredWeight }
    },
    assess(index: number) { return assessSearchResult(current.current, index) },
    weigh(index: number, onComplete?: (measurement: Measurement) => void) {
      const selected = currentSpeed.current
      if (currentRobot.current.motion || !apply({ type: 'weigh', index }, selected !== 'instant')) return false
      if (selected === 'instant') {
        apply({ type: 'tick' }, false)
        const next = apply({ type: 'tick' }, false)!
        currentRobot.current = { parked: index, motion: null }
        // Worker requests arrive as separate browser tasks. Publish their accumulated
        // results together without delaying the reply or dropping any measurements.
        uiTimer.current ??= window.setTimeout(flushMeasurements, 32)
        onComplete?.(next.log.at(-1)!)
        return true
      }
      const motion = startMotion('weigh', index, selected)
      const tickDelay = weightSearchTickMs / selected
      const retractDelay = retractMs / selected
      function tick() {
        if (currentRobot.current.motion !== motion) return
        const next = apply({ type: 'tick' })
        if (!next) return
        if (next.pending) {
          timer.current = window.setTimeout(tick, tickDelay)
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
        }, retractDelay)
      }
      timer.current = window.setTimeout(tick, tickDelay)
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
      flushMeasurements()
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
