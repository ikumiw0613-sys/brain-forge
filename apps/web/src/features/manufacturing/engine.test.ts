import { describe, expect, it } from 'vitest'
import { createManufacturingState, productRevenue, tickManufacturing } from './engine'
import type { ManufacturingState, SupplyTicks } from './engine'

function advance(state: ManufacturingState, ticks: number) {
  for (let i = 0; i < ticks; i++) state = tickManufacturing(state)
  return state
}

describe('manufacturing fixed tick simulation', () => {
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
