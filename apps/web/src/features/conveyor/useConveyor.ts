import { useEffect, useRef, useState } from 'react'
import { getConveyorTickMs } from '../game/conveyor'
import type { ConveyorSpeed } from '../game/conveyor'
import { createFactoryState, tickFactory } from '../game/factory'
import type { FactoryState } from '../game/factory'

type Playback = {
  state: FactoryState
  hasStarted: boolean
  progress: number
  resumedAt: number | null
}

function createPlayback(): Playback {
  return { state: createFactoryState(), hasStarted: false, progress: 0, resumedAt: null }
}

function getProgress(playback: Playback, now: number): number {
  if (playback.resumedAt === null) return playback.progress
  const elapsed = Math.max(0, now - playback.resumedAt)
  return Math.min(1, playback.progress + elapsed / getConveyorTickMs(playback.state.speed))
}

export function useConveyor() {
  const [playback, setPlayback] = useState(createPlayback)
  const current = useRef(playback)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function publish(next: Playback) {
    current.current = next
    setPlayback(next)
  }

  function scheduleTick() {
    window.clearTimeout(timer.current)
    const frame = current.current
    if (frame.resumedAt === null) return

    const tickMs = getConveyorTickMs(frame.state.speed)
    const deadline = frame.resumedAt + (1 - frame.progress) * tickMs
    timer.current = window.setTimeout(() => {
      const now = performance.now()
      if (now >= deadline) {
        publish({
          ...frame,
          state: tickFactory(frame.state),
          progress: 0,
          // Keep the normal cadence and avoid bursts after a stalled tab.
          resumedAt: now - deadline >= tickMs ? now : deadline,
        })
      }
      scheduleTick()
    }, Math.max(0, Math.ceil(deadline - performance.now())))
  }

  function updateState(state: FactoryState) {
    const frame = current.current
    const now = performance.now()
    publish({
      ...frame,
      state,
      hasStarted: frame.hasStarted || state.running,
      progress: getProgress(frame, now),
      resumedAt: state.running ? now : null,
    })
    scheduleTick()
  }

  return {
    state: playback.state,
    // Preview the next positions for drawing. The timer commits them at the tick boundary.
    nextItems: tickFactory({ ...playback.state, running: true }).items,
    hasStarted: playback.hasStarted,
    progressAt: (now: number) => getProgress(playback, now),
    toggleRunning() {
      const { state } = current.current
      updateState({ ...state, running: !state.running })
    },
    setSpeed(speed: ConveyorSpeed) {
      const { state } = current.current
      if (state.speed !== speed) updateState({ ...state, speed })
    },
    reset() {
      publish(createPlayback())
      scheduleTick()
    },
  }
}
