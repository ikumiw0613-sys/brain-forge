import { productRevenue } from '../../factory/manufacturing/engine'
import { createPythonSupply, deliverPythonPart, tickPythonSupply } from '../manufacturing/pythonSupply'
import type { PythonSupply } from '../manufacturing/pythonSupply'
import { powerPerWeigh, weightSearchReducer } from '../../factory/warehouse/engine'
import { defaultBenchmarkDistribution, generateBenchmarkWeights } from './benchmarkDistributions'
import type { BenchmarkDistribution } from './benchmarkDistributions'

export const benchmarkConditions = { id: 'BF-256-2000-v1', seed: 42, warehouseSize: 256, ticks: 2000 } as const
export const benchmarkTicks = [1000, 2000, 5000] as const
export const benchmarkSeeds = [42, 123, 456, 789, 2026] as const
export type BenchmarkConditions = { seed: number; warehouseSize: number; ticks: number; distribution?: BenchmarkDistribution }

export function benchmarkId({ seed, warehouseSize, ticks, distribution = defaultBenchmarkDistribution }: BenchmarkConditions) {
  const base = `BF-${warehouseSize}-${ticks}`
  const seedSuffix = seed === benchmarkConditions.seed ? '' : `-seed${seed}`
  const distributionSuffix = distribution === 'legacy' ? '' : `-${distribution}`
  return `${base}${seedSuffix}${distributionSuffix}-v1`
}

export function createBenchmark(
  seed: number = benchmarkConditions.seed,
  warehouseSize: number = benchmarkConditions.warehouseSize,
  distribution: BenchmarkDistribution = defaultBenchmarkDistribution,
): PythonSupply {
  const weights = generateBenchmarkWeights(seed, warehouseSize, distribution)
  const state = createPythonSupply(16, seed, weights)
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
