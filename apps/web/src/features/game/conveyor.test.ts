import { describe, expect, it } from 'vitest'
import { conveyorLength, createConveyorState, getConveyorTickMs, setConveyorRunning, setConveyorSpeed, tickConveyor } from './conveyor'
import type { ConveyorState } from './conveyor'

const positions = (state: ConveyorState) => state.items.map(item => item.position)
const start = () => setConveyorRunning(createConveyorState(), true)

describe('conveyor engine', () => {
  it('places three unique containers on the eight-cell line', () => {
    const initial = createConveyorState()
    expect(initial).toMatchObject({ running: false, speed: 1, tick: 0 })
    expect(initial.items).toHaveLength(3)
    expect(new Set(initial.items.map(item => item.id)).size).toBe(3)
    expect(positions(initial)).toEqual([0, 2, 4])
    expect(conveyorLength).toBe(8)
  })

  it('advances at most one cell per tick without mutating the previous state', () => {
    const state = start()
    const next = tickConveyor(state)
    expect(positions(next)).toEqual([1, 3, 5])
    expect(next.tick).toBe(1)
    expect(positions(state)).toEqual([0, 2, 4])
    expect(state.tick).toBe(0)
  })

  it('lets a container enter a cell vacated earlier in the same tick', () => {
    const state = start()
    const adjacent = { ...state, items: state.items.map((item, index) => ({ ...item, position: index })).reverse() }
    const next = tickConveyor(adjacent)
    expect(positions(next)).toEqual([1, 2, 3])
    expect(new Set(positions(next)).size).toBe(next.items.length)
  })

  it('blocks movement into occupied cells and keeps the container order', () => {
    let state = start()
    const ids = state.items.map(item => item.id)
    for (let tick = 0; tick < 8; tick++) {
      state = tickConveyor(state)
      expect(new Set(positions(state)).size).toBe(state.items.length)
      expect(state.items.map(item => item.id)).toEqual(ids)
    }
    expect(positions(state)).toEqual([5, 6, 7])
  })

  it('holds the rightmost container at the end while the rest can advance', () => {
    let state = start()
    for (let tick = 0; tick < 3; tick++) state = tickConveyor(state)
    expect(positions(state)).toEqual([3, 5, 7])
    expect(positions(tickConveyor(state))).toEqual([4, 6, 7])
  })

  it('leaves the stopped state and tick unchanged', () => {
    const paused = setConveyorRunning(tickConveyor(start()), false)
    expect(tickConveyor(paused)).toBe(paused)
    expect(paused.tick).toBe(1)
  })

  it('continues from the current positions after resuming', () => {
    const paused = setConveyorRunning(tickConveyor(start()), false)
    const resumed = tickConveyor(setConveyorRunning(paused, true))
    expect(positions(resumed)).toEqual([2, 4, 6])
    expect(resumed.tick).toBe(2)
  })

  it('uses speed to change the tick interval while keeping cell movement identical', () => {
    const state = tickConveyor(start())
    for (const [speed, ms] of [[0.5, 1000], [1, 500], [2, 250]] as const) {
      const updated = setConveyorSpeed(state, speed)
      expect(updated.speed).toBe(speed)
      expect(updated.items).toBe(state.items)
      expect(updated.tick).toBe(state.tick)
      expect(getConveyorTickMs(updated.speed)).toBe(ms)
      expect(positions(tickConveyor(updated))).toEqual([2, 4, 6])
    }
  })

  it('creates a fresh initial state for reset', () => {
    const initial = createConveyorState()
    const changed = tickConveyor(setConveyorSpeed(setConveyorRunning(initial, true), 2))
    const reset = createConveyorState()
    expect(reset).toEqual(initial)
    expect(reset.items).not.toBe(changed.items)
    expect(reset.items).not.toBe(initial.items)
  })

  it('counts every tick during a long run and holds the final positions', () => {
    let state = start()
    for (let tick = 0; tick < 20_000; tick++) state = tickConveyor(state)
    expect(state.tick).toBe(20_000)
    expect(positions(state)).toEqual([5, 6, 7])
  })
})
