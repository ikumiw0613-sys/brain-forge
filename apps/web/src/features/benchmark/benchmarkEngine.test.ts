import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { assessSearchResult, createWarehouse, lowerBound, warehouseSizes } from '../../factory/warehouse/engine'
import { createPythonSupply } from '../manufacturing/pythonSupply'
import { benchmarkDistributions, generateBenchmarkWeights } from './benchmarkDistributions'
import { benchmarkConditions, benchmarkId, createBenchmark, getBenchmarkResult, measureBenchmark, produceBenchmarkPart } from './benchmarkEngine'
import { correctness, emptyTally, summarize, summarizeBenchmarkGroups } from './benchmarkStats'
import type { CaseResult } from './benchmarkStats'

function runBinary() {
  let state = createBenchmark()
  const targets: number[] = []
  while (state.line.tick < benchmarkConditions.ticks) {
    const startedAt = state.line.tick
    let left = 0
    let right = state.search.weights.length
    targets.push(state.search.order.requiredWeight)
    while (left < right && state.line.tick < benchmarkConditions.ticks) {
      const mid = Math.floor((left + right) / 2)
      state = measureBenchmark(state, mid)
      if (state.line.tick === benchmarkConditions.ticks) break
      const measurement = state.search.log.at(-1)!
      if (measurement.qualifies) right = mid
      else left = mid + 1
    }
    if (state.line.tick < benchmarkConditions.ticks) {
      const next = produceBenchmarkPart(state, left)
      expect(next.line.tick).toBeGreaterThan(state.line.tick)
      state = next
    }
    expect(state.line.tick).toBeGreaterThan(startedAt)
  }
  return { targets, result: getBenchmarkResult(state), state }
}

it('repeats the same 256-part warehouse, unbounded order sequence and full-window totals', () => {
  const first = runBinary()
  const second = runBinary()
  expect(first.state.search.weights).toHaveLength(256)
  expect(second.state.search.weights).toEqual(first.state.search.weights)
  expect(second.targets).toEqual(first.targets)
  expect(second.result).toEqual(first.result)
  const { completed, revenue, revenueRate, measurements, power } = first.result
  expect(first.result.ticks).toBe(2000)
  expect(completed).toBeGreaterThan(50)
  expect(revenue).toBe(completed * 100)
  expect(revenueRate).toBe(revenue / 20)
  expect(power).toBe(measurements * 10)
  expect(first.state.line.totalWaiting).toBe(measurements * 2)
  expect(first.state.line.totalProcessing - completed * 20).toBeLessThan(20)
})

it('preserves the pre-upgrade BF-256-2000-v1 weights, orders, and binary-search result', () => {
  const { targets, result, state } = runBinary()
  const hash = (values: readonly number[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex')
  expect(hash(state.search.weights)).toBe('8df0d8c99e5e92f2d3cf37bb526b66413aa27f6a5b134098f3cb31cfda4256f4')
  expect(hash(targets)).toBe('e30fd7bd1723eb7c5597f9da8a5beacc9d3ec4aea65c0ae76dadf2d64ad03992')
  expect(result).toEqual({ ticks: 2000, completed: 55, revenue: 5500, power: 4480, measurements: 448, revenueRate: 275 })
  expect(benchmarkId({ ...benchmarkConditions, distribution: 'legacy' })).toBe('BF-256-2000-v1')
  expect(benchmarkId({ ...benchmarkConditions, seed: 123, distribution: 'legacy' })).toBe('BF-256-2000-seed123-v1')
  expect(benchmarkDistributions.map(({ id }) => benchmarkId({ ...benchmarkConditions, seed: 123, distribution: id }))).toEqual([
    'BF-256-2000-seed123-v1', 'BF-256-2000-seed123-uniform-v1', 'BF-256-2000-seed123-skewed-v1', 'BF-256-2000-seed123-duplicates-v1',
  ])
})

it('distinguishes a verified first duplicate, a later duplicate, and a verified no-match result', () => {
  const initial = createBenchmark(42, 256, 'duplicates')
  const weights = initial.search.weights
  const index = weights.findIndex((weight, position) => position > 0 && weight > weights[position - 1] && weight === weights[position + 1])
  expect(index).toBeGreaterThan(0)
  const withTarget = (requiredWeight: number) => ({ ...initial, search: { ...initial.search, order: { ...initial.search.order, requiredWeight } } })
  const matching = withTarget(weights[index])
  expect(assessSearchResult(matching.search, index)).toMatchObject({ correct: true, verified: false })
  expect(produceBenchmarkPart(matching, index)).toBe(matching)
  const verified = measureBenchmark(measureBenchmark(matching, index - 1), index)
  expect(assessSearchResult(verified.search, index)).toEqual({ correct: true, verified: true, cost: { count: 2, ticks: 4, power: 20 } })
  expect(assessSearchResult(verified.search, index + 1)).toMatchObject({ correct: false, verified: false })
  expect(produceBenchmarkPart(verified, index + 1)).toBe(verified)
  expect(getBenchmarkResult(produceBenchmarkPart(verified, index))).toMatchObject({ ticks: 24, revenue: 100, power: 20 })

  const noMatch = measureBenchmark(withTarget(weights.at(-1)! + 1), weights.length - 1)
  expect(assessSearchResult(noMatch.search, weights.length)).toMatchObject({ correct: true, verified: true })
  expect(produceBenchmarkPart(noMatch, weights.length)).toBe(noMatch)
  expect(getBenchmarkResult(noMatch)).toMatchObject({ ticks: 2, revenue: 0, power: 10 })
})

it('counts the product that completes on tick 2000 and excludes an unfinished one', () => {
  const initial = createBenchmark()
  // Weighing index zero proves the result when the threshold is the minimum.
  const search = { ...initial.search, order: { ...initial.search.order, requiredWeight: initial.search.weights[0] } }
  const nearEnd = (tick: number) => ({ ...initial, search, line: { ...initial.line, tick } })
  expect(produceBenchmarkPart(nearEnd(1978), 0)).toEqual(nearEnd(1978))
  const justInTime = produceBenchmarkPart(measureBenchmark(nearEnd(1978), 0), 0)
  expect(getBenchmarkResult(justInTime)).toEqual({ ticks: 2000, completed: 1, revenue: 100, revenueRate: 5, measurements: 1, power: 10 })
  expect(justInTime.search.order.number).toBe(1)
  const unfinished = produceBenchmarkPart(measureBenchmark(nearEnd(1979), 0), 0)
  expect(unfinished.line.progress).toBe(19)
  expect(getBenchmarkResult(unfinished)).toMatchObject({ ticks: 2000, completed: 0, revenue: 0, measurements: 1 })
  expect(getBenchmarkResult(measureBenchmark(nearEnd(1999), 0))).toMatchObject({ ticks: 2000, measurements: 0, power: 0 })
})

it('uses the first matching index, supports no match, and assesses without accounting for a measurement', () => {
  expect(lowerBound([2, 4, 4, 4, 8], 4)).toBe(1)
  expect(lowerBound([2, 4, 4, 4, 8], 9)).toBe(5)
  const state = createBenchmark()
  const index = lowerBound(state.search.weights, state.search.order.requiredWeight)
  expect(index).not.toBe(0)
  expect(assessSearchResult(state.search, 0).correct).toBe(false)
  expect(assessSearchResult(state.search, index)).toEqual({ correct: true, verified: false, cost: { count: 0, ticks: 0, power: 0 } })
  expect(produceBenchmarkPart(state, 0)).toBe(state)
  expect(produceBenchmarkPart(state, index)).toBe(state)
  expect(getBenchmarkResult(state)).toMatchObject({ ticks: 0, power: 0, revenue: 0 })
  expect(benchmarkId(benchmarkConditions)).toBe('BF-256-2000-v1')
})

const distributionSizes = benchmarkDistributions.flatMap(({ id }) => warehouseSizes.map(size => ({ distribution: id, size })))

it.each(distributionSizes)('reproduces $distribution with $size parts regardless of measurement count', ({ distribution, size }) => {
  const reproduce = (extraWeigh: boolean) => {
    let state = createBenchmark(123, size, distribution)
    const targets = []
    for (let order = 0; order < 3; order++) {
      targets.push(state.search.order.requiredWeight)
      if (extraWeigh) state = measureBenchmark(state, 0, 5000)
      let left = 0
      let right: number = size
      while (left < right) {
        const middle = (left + right) >>> 1
        state = measureBenchmark(state, middle, 5000)
        if (state.search.log.at(-1)!.qualifies) right = middle
        else left = middle + 1
      }
      state = produceBenchmarkPart(state, left, 5000)
    }
    return { targets, weights: state.search.weights, result: getBenchmarkResult(state) }
  }
  const shorter = reproduce(false)
  const longer = reproduce(true)
  expect(shorter.weights).toHaveLength(size)
  expect(shorter.weights).toEqual(generateBenchmarkWeights(123, size, distribution))
  expect(shorter.weights).toEqual([...shorter.weights].sort((left, right) => left - right))
  expect(shorter.weights).toEqual(longer.weights)
  expect(shorter.targets).toEqual(longer.targets)
  expect(longer.result.ticks - shorter.result.ticks).toBe(6)
  expect(longer.result.power - shorter.result.power).toBe(30)
  expect(longer.result.revenue).toBe(300)
})

it('generates observably different distributions and keeps the production warehouse on the legacy generator', () => {
  const size = 1024
  const [legacy, uniform, skewed, duplicates] = benchmarkDistributions.map(({ id }) => generateBenchmarkWeights(42, size, id))
  const inLightestQuarter = (weights: readonly number[]) => weights.filter(weight => weight <= 10 * size / 4).length
  expect(inLightestQuarter(uniform)).toBe(size / 4)
  expect(inLightestQuarter(skewed)).toBeGreaterThan(size / 2)
  expect(new Set(skewed).size).toBe(size)
  expect(new Set(duplicates).size).toBe(8)
  expect(() => createWarehouse(duplicates)).toThrow(/distinct/)
  expect(createPythonSupply(16, 42, size).search).toEqual(createBenchmark(42, size).search)
  expect(legacy).toEqual(createPythonSupply(16, 42, size).search.weights)
  expect(uniform).not.toEqual(generateBenchmarkWeights(123, size, 'uniform'))
  expect(benchmarkDistributions.slice(1).map(({ id }) => createBenchmark(42, size, id).search.order.requiredWeight))
    .toEqual(Array(3).fill(createBenchmark(42, size, 'uniform').search.order.requiredWeight))
})

it('reports per-seed statistics and includes failure outcomes in the accuracy denominator', () => {
  expect(summarize([null, 10, 15, 35])).toEqual({ average: 20, min: 10, max: 35 })
  expect(summarize([null])).toBeNull()
  expect(correctness({ ...emptyTally, correct: 3, wrong: 1, 'invalid-result': 1, exception: 1, timeout: 2 })).toBe(37.5)
  expect(correctness(emptyTally)).toBeNull()
})

it('averages per-seed results within each distribution and code and excludes interrupted cases', () => {
  const makeCase = ({ seed, distribution, variant = 'A', status = 'completed', measurements, revenueRate, tally }: {
    seed: number; distribution: 'uniform' | 'skewed'; variant?: 'A' | 'B'; status?: CaseResult['status'];
    measurements: number; revenueRate: number; tally: CaseResult['tally']
  }): CaseResult => ({
    job: { code: '', variant, conditions: { ...benchmarkConditions, seed, distribution } }, status, tally,
    result: { ticks: 2000, completed: 0, revenue: 0, power: measurements * 10, measurements, revenueRate },
  })
  const correct = { ...emptyTally, correct: 1 }
  const groups = summarizeBenchmarkGroups([
    makeCase({ seed: 42, distribution: 'uniform', measurements: 100, revenueRate: 300, tally: correct }),
    makeCase({ seed: 123, distribution: 'uniform', measurements: 200, revenueRate: 250, tally: correct }),
    makeCase({ seed: 456, distribution: 'uniform', status: 'failed', measurements: 5, revenueRate: 0, tally: { ...correct, wrong: 1 } }),
    makeCase({ seed: 789, distribution: 'uniform', status: 'stopped', measurements: 2, revenueRate: 0, tally: { ...emptyTally, wrong: 1 } }),
    makeCase({ seed: 42, distribution: 'skewed', measurements: 400, revenueRate: 200, tally: correct }),
    makeCase({ seed: 42, distribution: 'uniform', variant: 'B', measurements: 300, revenueRate: 230, tally: correct }),
  ])
  expect(groups).toMatchObject([
    { label: '均等分布 · 256部品 · 2000 Tick · A', done: 2, total: 4, efficiency: 275, measurements: 150, accuracy: 250 / 3 },
    { label: '偏りのある分布 · 256部品 · 2000 Tick · A', efficiency: 200, measurements: 400, accuracy: 100 },
    { label: '均等分布 · 256部品 · 2000 Tick · B', efficiency: 230, measurements: 300, accuracy: 100 },
  ])
})
