import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { getConveyorTickMs } from '../game/conveyor'
import type { ConveyorSpeed } from '../game/conveyor'
import { assessSearchResult, weightSearchReducer } from '../weight-search/engine'
import type { Measurement } from '../weight-search/engine'
import { usePythonSearch } from '../weight-search/usePythonSearch'
import { createPythonSupply, deliverPythonPart, tickPythonSupply } from './pythonSupply'
import type { PythonSupply } from './pythonSupply'

function clockPhase({ line, search }: PythonSupply) {
  if (!line.running) return 'idle'
  if (line.status === 'COMPLETED') return 'request'
  if (line.status !== 'WAITING') return 'production'
  return search.pending ? 'weigh' : 'idle'
}

export function useManufacturingLine(speed: ConveyorSpeed, instant: boolean, seed: number, initialCode: string) {
  const [model, setModel] = useState(() => createPythonSupply(16, seed))
  const current = useRef(model)
  const reply = useRef<((measurement: Measurement) => void) | undefined>(undefined)
  const startedOrder = useRef<number | null>(null)
  const [started, setStarted] = useState(false)
  const [program, setProgram] = useState({ active: initialCode, queued: null as string | null })
  const { line, search } = model

  function applyQueuedCode() {
    setProgram(current => current.queued === null ? current : { active: current.queued, queued: null })
  }

  function commit(next: PythonSupply) {
    current.current = next
    setModel(next)
  }

  const python = usePythonSearch({
    beginAttempt() {
      const { line, search } = current.current
      if (!line.running || line.status !== 'WAITING' || search.pending) return
      return { n: search.weights.length, target: search.order.requiredWeight }
    },
    assess: index => assessSearchResult(current.current.search, index),
    weigh(index, onComplete) {
      const state = current.current
      if (state.line.status !== 'WAITING') return false
      const next = weightSearchReducer(state.search, { type: 'weigh', index })
      if (next === state.search) return false
      reply.current = onComplete
      commit({ ...state, search: next })
      return true
    },
    cancelWeigh() {
      // An accepted measurement owns both ticks. If the Worker fails, finish it
      // on resume before retrying the same order, without sending a stale reply.
      reply.current = undefined
    },
    flushMeasurements() {},
  })

  const advance = useEffectEvent((phase: ReturnType<typeof clockPhase>) => {
    const state = current.current
    if (clockPhase(state) !== phase) return
    const next = tickPythonSupply(state)
    if (next === state) return
    if (next.search.order.number !== state.search.order.number) applyQueuedCode()
    commit(next)
    if (state.search.pending && !next.search.pending) {
      const complete = reply.current
      reply.current = undefined
      complete?.(next.search.log.at(-1)!)
    }
  })

  const phase = clockPhase(model)
  const delay = phase === 'weigh' && instant ? 1 : getConveyorTickMs(speed)
  useEffect(() => {
    if (phase === 'idle') return
    const timer = window.setInterval(() => advance(phase), delay)
    return () => window.clearInterval(timer)
  }, [phase, delay])

  const syncOrder = useEffectEvent(() => {
    const state = current.current
    if (!state.line.running || state.line.status !== 'WAITING') return
    if (startedOrder.current !== state.search.order.number) {
      if (state.search.pending) return
      startedOrder.current = state.search.order.number
      python.start(program.active)
    } else if (python.report.status === 'finished' || python.report.status === 'failed') {
      const next = python.report.status === 'finished' ? deliverPythonPart(state, python.report.index) : state
      commit(next === state ? { ...state, line: { ...state.line, running: false } } : next)
    }
  })

  useEffect(() => {
    syncOrder()
  }, [line.running, line.status, search.order.number, search.pending, python.report])

  return {
    line, search, started, report: python.report, program, lastDelivery: model.lastDelivery,
    applyCode(code: string) {
      if (!code.trim()) return
      setProgram(current => started
        ? { ...current, queued: code === current.active ? null : code }
        : { active: code, queued: null })
    },
    toggle() {
      const state = current.current
      const running = !state.line.running
      if (running && !python.busy &&
        (python.report.status === 'failed' || (python.report.status === 'finished' && !python.report.verified))) {
        startedOrder.current = null
        python.clearReport()
      }
      python.setMeasurementPaused(!running)
      setStarted(true)
      commit({ ...state, line: { ...state.line, running } })
    },
    reset() {
      python.stop()
      python.clearReport()
      applyQueuedCode()
      reply.current = undefined
      startedOrder.current = null
      commit(createPythonSupply(current.current.line.supplyTicks, seed))
      setStarted(false)
    },
  }
}
