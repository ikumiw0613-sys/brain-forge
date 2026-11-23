import { productRevenue } from '../manufacturing/engine'
import { createPythonSupply, deliverPythonPart, tickPythonSupply } from '../manufacturing/pythonSupply'
import type { PythonSupply } from '../manufacturing/pythonSupply'
import { powerPerWeigh, weightSearchReducer } from '../weight-search/engine'

export const benchmarkConditions = { id: 'BF-256-2000-v1', seed: 42, warehouseSize: 256, ticks: 2000 } as const

export function createBenchmark(seed: number = benchmarkConditions.seed): PythonSupply {
  const state = createPythonSupply(16, seed, benchmarkConditions.warehouseSize)
  return { ...state, line: { ...state.line, running: true } }
}

export function measureBenchmark(state: PythonSupply, index: number): PythonSupply {
  if (!state.line.running || state.line.status !== 'WAITING' || state.line.tick >= benchmarkConditions.ticks) return state
  const search = weightSearchReducer(state.search, { type: 'weigh', index })
  if (search === state.search) return state
  let next = { ...state, search }
  while (next.search.pending && next.line.tick < benchmarkConditions.ticks) {
    next = tickPythonSupply(next)
  }
  return next
}

export function produceBenchmarkPart(state: PythonSupply, index: number): PythonSupply {
  if (state.line.tick >= benchmarkConditions.ticks) return state
  let next = deliverPythonPart(state, index)
  if (next === state) return state
  while (next.line.status !== 'COMPLETED' && next.line.tick < benchmarkConditions.ticks) {
    next = tickPythonSupply(next)
  }
  // The last Tick is inclusive. A partial product earns nothing and no next order starts.
  return next.line.tick === benchmarkConditions.ticks ? next : tickPythonSupply(next)
}

export function getBenchmarkResult(state: PythonSupply) {
  const { tick: ticks, completed } = state.line
  const power = state.search.totalPower
  const revenue = completed * productRevenue
  return { ticks, completed, revenue, power, measurements: power / powerPerWeigh,
    revenueRate: ticks === 0 ? 0 : revenue * 100 / ticks }
}
