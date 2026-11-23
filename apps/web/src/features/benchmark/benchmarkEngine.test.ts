import { expect, it } from 'vitest'
import { benchmarkConditions, createBenchmark, getBenchmarkResult, measureBenchmark, produceBenchmarkPart } from './benchmarkEngine'

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
