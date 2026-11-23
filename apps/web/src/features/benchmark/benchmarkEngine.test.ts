import { expect, it } from 'vitest'
import { assessSearchResult, lowerBound } from '../../factory/warehouse/engine'
import { benchmarkConditions, benchmarkId, createBenchmark, getBenchmarkResult, measureBenchmark, produceBenchmarkPart } from './benchmarkEngine'
import { correctness, emptyTally, summarize } from './benchmarkStats'

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

it.each([16, 64, 256, 1024])('keeps the same targets for different measurement counts with %i parts', size => {
  const reproduce = (extraWeigh: boolean) => {
    let state = createBenchmark(123, size)
    const targets = []
    for (let order = 0; order < 3; order++) {
      targets.push(state.search.order.requiredWeight)
      if (extraWeigh) state = measureBenchmark(state, 0, 5000)
      let left = 0
      let right = size
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
  expect(shorter.weights).toEqual(longer.weights)
  expect(shorter.targets).toEqual(longer.targets)
  expect(longer.result.ticks - shorter.result.ticks).toBe(6)
  expect(longer.result.power - shorter.result.power).toBe(30)
  expect(longer.result.revenue).toBe(300)
})

it('reports per-seed statistics and includes failure outcomes in the accuracy denominator', () => {
  expect(summarize([null, 10, 15, 35])).toEqual({ average: 20, min: 10, max: 35 })
  expect(summarize([null])).toBeNull()
  expect(correctness({ ...emptyTally, correct: 3, wrong: 1, 'invalid-result': 1, exception: 1, timeout: 2 })).toBe(37.5)
  expect(correctness(emptyTally)).toBeNull()
})
