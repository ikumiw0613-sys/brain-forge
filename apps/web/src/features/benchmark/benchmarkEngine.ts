import { productRevenue } from '../../factory/manufacturing/engine'
import { createPythonSupply, deliverPythonPart, tickPythonSupply } from '../manufacturing/pythonSupply'
import type { PythonSupply } from '../manufacturing/pythonSupply'
import { powerPerWeigh, weightSearchReducer } from '../../factory/warehouse/engine'

export const benchmarkConditions = { id: 'BF-256-2000-v1', seed: 42, warehouseSize: 256, ticks: 2000 } as const
export const benchmarkTicks = [1000, 2000, 5000] as const
export const benchmarkSeeds = [42, 123, 456, 789, 2026] as const
export type BenchmarkConditions = { seed: number; warehouseSize: number; ticks: number }

export function benchmarkId({ seed, warehouseSize, ticks }: BenchmarkConditions) {
  const base = `BF-${warehouseSize}-${ticks}`
  return seed === benchmarkConditions.seed ? `${base}-v1` : `${base}-seed${seed}-v1`
}

export function createBenchmark(seed: number = benchmarkConditions.seed, warehouseSize: number = benchmarkConditions.warehouseSize): PythonSupply {
  // The supply engine indexes order samples by order number, independent of measurement calls.
  const state = createPythonSupply(16, seed, warehouseSize)
  return { ...state, line: { ...state.line, running: true } }
}

export function measureBenchmark(state: PythonSupply, index: number, ticks: number = benchmarkConditions.ticks): PythonSupply {
  if (!state.line.running || state.line.status !== 'WAITING' || state.line.tick >= ticks) return state
  const search = weightSearchReducer(state.search, { type: 'weigh', index })
  if (search === state.search) return state
  let next = { ...state, search }
  while (next.search.pending && next.line.tick < ticks) {
    next = tickPythonSupply(next)
  }
  return next
}

export function produceBenchmarkPart(state: PythonSupply, index: number, ticks: number = benchmarkConditions.ticks): PythonSupply {
  if (state.line.tick >= ticks) return state
  let next = deliverPythonPart(state, index)
  if (next === state) return state
  while (next.line.status !== 'COMPLETED' && next.line.tick < ticks) {
    next = tickPythonSupply(next)
  }
  // The last Tick is inclusive. A partial product earns nothing and no next order starts.
  return next.line.tick === ticks ? next : tickPythonSupply(next)
}

export function getBenchmarkResult(state: PythonSupply) {
  const { tick: ticks, completed } = state.line
  const power = state.search.totalPower
  const revenue = completed * productRevenue
  return { ticks, completed, revenue, power, measurements: power / powerPerWeigh,
    revenueRate: ticks === 0 ? 0 : revenue * 100 / ticks }
}
