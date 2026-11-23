import { describe, expect, it } from 'vitest'
import { createManufacturingState, getManufacturingDashboard, productRevenue, tickManufacturing } from './engine'
import type { ManufacturingState, SupplyTicks } from './engine'

function advance(state: ManufacturingState, ticks: number) {
  for (let i = 0; i < ticks; i++) state = tickManufacturing(state)
  return state
}

describe('manufacturing fixed tick simulation', () => {
  it('uses elapsed ticks until the dashboard window fills and excludes expired ticks thereafter', () => {
    const initial = createManufacturingState(4)
    expect(getManufacturingDashboard(initial)).toEqual({
      revenue: 0, revenueRate: 0, windowTicks: 0, productionRate: 0, utilization: 0, waitingRate: 0,
    })
    const firstProduct = advance({ ...initial, running: true }, 24)
    expect(getManufacturingDashboard(firstProduct)).toEqual({
      revenue: 100, revenueRate: 10_000 / 24, windowTicks: 24, productionRate: 100 / 24,
      utilization: 2000 / 24, waitingRate: 400 / 24,
    })
    const fullWindow = advance(firstProduct, 476)
    expect(getManufacturingDashboard(fullWindow)).toEqual({
      revenue: 2000, revenueRate: 400, windowTicks: 500, productionRate: 4, utilization: 83.2, waitingRate: 16.8,
    })
    const rolled = tickManufacturing(fullWindow)
    expect(getManufacturingDashboard(rolled)).toEqual({
      ...getManufacturingDashboard(fullWindow), utilization: 83.4, waitingRate: 16.6,
    })
    const beforeExpiry = advance(rolled, 22)
    expect(getManufacturingDashboard(beforeExpiry)).toMatchObject({ revenue: 2100, revenueRate: 420, windowTicks: 500 })
    const expiredCompletion = tickManufacturing(beforeExpiry)
    expect(getManufacturingDashboard(expiredCompletion)).toEqual({
      ...getManufacturingDashboard(fullWindow), revenue: 2100,
    })
    expect(expiredCompletion.previousTotals).toHaveLength(500)
    expect(getManufacturingDashboard(fullWindow).waitingRate).toBe(16.8)
  })

  it.each([[100, 5, 500], [200, 6, 300]])('normalizes confirmed sales over %i elapsed ticks', (tick, completed, revenueRate) => {
    const state = { ...createManufacturingState(), tick, completed }
    expect(getManufacturingDashboard(state)).toMatchObject({ revenue: completed * 100, revenueRate, windowTicks: tick })
  })

  it('starts paused and leaves paused state unchanged', () => {
    const initial = createManufacturingState()
    expect(initial).toMatchObject({ tick: 0, status: 'WAITING', waiting: 0, progress: 0, completed: 0 })
    expect(tickManufacturing(initial)).toBe(initial)
  })

  it('waits the configured ticks, then produces for exactly twenty ticks', () => {
    const start = { ...createManufacturingState(4), running: true }
    const waiting = advance(start, 3)
    expect(waiting).toMatchObject({ tick: 3, status: 'WAITING', waiting: 3, totalWaiting: 3 })
    const received = tickManufacturing(waiting)
    expect(received).toMatchObject({ tick: 4, status: 'RECEIVED', progress: 0, totalWaiting: 4 })
    const processing = advance(received, 19)
    expect(processing).toMatchObject({ tick: 23, status: 'PROCESSING', progress: 19, completed: 0 })
    expect(getManufacturingDashboard(processing)).toMatchObject({ revenue: 0, revenueRate: 0 })
    const complete = tickManufacturing(processing)
    expect(complete).toMatchObject({ tick: 24, status: 'COMPLETED', completed: 1, progress: 20, totalProcessing: 20 })
    expect(complete.completed * productRevenue).toBe(100)
    expect(tickManufacturing(complete)).toMatchObject({ tick: 25, status: 'WAITING', waiting: 1, progress: 0 })
  })

  it('produces fewer items with slower supply, and records all elapsed ticks', () => {
    const results = ([4, 16, 64] as SupplyTicks[]).map(supply =>
      advance({ ...createManufacturingState(supply), running: true }, 1000))
    expect(results.map(result => result.completed)).toEqual([41, 27, 11])
    for (const result of results) {
      expect(result.totalWaiting + result.totalProcessing).toBe(1000)
      expect(result.totalProcessing).toBeGreaterThanOrEqual(result.completed * 20)
    }
  })

  it('pauses, resumes, resets and permits a replacement supplier', () => {
    const running = advance({ ...createManufacturingState(16), running: true }, 5)
    const paused = { ...running, running: false }
    expect(advance(paused, 20)).toBe(paused)
    const resumed = tickManufacturing({ ...paused, running: true }, true)
    expect(resumed).toMatchObject({ tick: 6, status: 'RECEIVED', totalWaiting: 6 })
    expect(createManufacturingState(4)).toEqual({ ...createManufacturingState(), supplyTicks: 4 })
  })
})
