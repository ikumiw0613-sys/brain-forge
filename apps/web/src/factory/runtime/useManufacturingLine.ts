import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { getConveyorTickMs } from '../../features/game/conveyor'
import type { ConveyorSpeed } from '../../features/game/conveyor'
import { assessSearchResult, warehouseSizes, weightSearchReducer } from '../warehouse/engine'
import type { Measurement } from '../warehouse/engine'
import { usePythonSearch } from '../python/usePythonSearch'
import { createPythonSupply, deliverPythonPart, generateUnsortedSupplyWeights, supplyWarehouseSize, tickPythonSupply } from '../../features/manufacturing/pythonSupply'
import type { PythonSupply } from '../../features/manufacturing/pythonSupply'
import { runSortingInput } from '../../features/sorting/runSortingCase'
import { createManufacturingState } from '../manufacturing/engine'

export type WarehousePreparation = { status: 'idle' | 'preparing' | 'ready' } | { status: 'error'; detail: string }
const stoppedLine = createManufacturingState()

function clockPhase(state: PythonSupply | null) {
  if (!state?.line.running) return 'idle'
  const { line, search } = state
  if (line.status === 'COMPLETED') return 'request'
  if (line.status !== 'WAITING') return 'production'
  return search.pending ? 'weigh' : 'idle'
}

export function useManufacturingLine(speed: ConveyorSpeed, instant: boolean, seed: number, initialCode: string, sortingCode: string) {
  const [model, setModel] = useState<PythonSupply | null>(null)
  const current = useRef(model)
  const [warehouseSize, setWarehouseSize] = useState(supplyWarehouseSize)
  const [preparation, setPreparation] = useState<WarehousePreparation>({ status: 'idle' })
  const preparationRun = useRef<AbortController | null>(null)
  const reply = useRef<((measurement: Measurement) => void) | undefined>(undefined)
  const startedOrder = useRef<number | null>(null)
  const [program, setProgram] = useState({ active: initialCode, queued: null as string | null })
  const line = model?.line ?? stoppedLine
  const search = model?.search ?? null

  function applyQueuedCode() {
    setProgram(current => current.queued === null ? current : { active: current.queued, queued: null })
  }

  function commit(next: PythonSupply | null) {
    current.current = next
    setModel(next)
  }

  const python = usePythonSearch({
    beginAttempt() {
      const state = current.current
      if (!state?.line.running || state.line.status !== 'WAITING' || state.search.pending) return
      return { n: state.search.weights.length, target: state.search.order.requiredWeight }
    },
    assess: index => assessSearchResult(current.current!.search, index),
    weigh(index, onComplete) {
      const state = current.current
      if (!state?.line.running || state.line.status !== 'WAITING') return false
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
    if (!state || clockPhase(state) !== phase) return
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
    if (!state?.line.running || state.line.status !== 'WAITING') return
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
  }, [line.running, line.status, search?.order.number, search?.pending, python.report])

  useEffect(() => () => {
    const run = preparationRun.current
    preparationRun.current = null
    run?.abort()
  }, [])

  async function startPreparation() {
    if (preparationRun.current || current.current) return
    if (!sortingCode.trim()) {
      setPreparation({ status: 'error', detail: 'sorting.py に関数 sort_parts(a) を定義してください。' })
      return
    }
    const run = new AbortController()
    preparationRun.current = run
    setPreparation({ status: 'preparing' })
    const result = await runSortingInput(generateUnsortedSupplyWeights(seed, warehouseSize), sortingCode, run.signal)
    if (preparationRun.current !== run) return
    preparationRun.current = null
    if (result.status !== 'passed') {
      setPreparation({ status: 'error', detail: result.detail })
      return
    }
    const supply = createPythonSupply(stoppedLine.supplyTicks, seed, result.output)
    setPreparation({ status: 'ready' })
    commit({ ...supply, line: { ...supply.line, running: true } })
  }

  function cancelPreparation() {
    const run = preparationRun.current
    preparationRun.current = null
    run?.abort()
    setPreparation({ status: 'idle' })
  }

  function toggleRunning() {
    const state = current.current
    if (!state) return
    const running = !state.line.running
    if (running && !python.busy &&
      (python.report.status === 'failed' || (python.report.status === 'finished' && !python.report.verified))) {
      startedOrder.current = null
      python.clearReport()
    }
    commit({ ...state, line: { ...state.line, running } })
    python.setMeasurementPaused(!running)
  }

  return {
    line, search, warehouseSize, preparation, started: model !== null,
    report: python.report, program, lastDelivery: model?.lastDelivery ?? null,
    resizeWarehouse(size: number) {
      if (current.current || preparationRun.current || !warehouseSizes.some(option => option === size)) return
      setWarehouseSize(size)
    },
    applyCode(code: string) {
      if (!code.trim()) return
      const started = current.current !== null
      setProgram(current => started
        ? { ...current, queued: code === current.active ? null : code }
        : { active: code, queued: null })
    },
    toggle: model ? toggleRunning : preparation.status === 'preparing' ? cancelPreparation : startPreparation,
    reset() {
      cancelPreparation()
      python.stop()
      python.setMeasurementPaused(false)
      python.clearReport()
      applyQueuedCode()
      reply.current = undefined
      startedOrder.current = null
      commit(null)
    },
  }
}
