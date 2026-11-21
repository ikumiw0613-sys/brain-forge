import { describe, expect, it } from 'vitest'
import { conveyorLength, conveyorSpeeds } from './conveyor'
import type { ConveyorSpeed } from './conveyor'
import { createFactoryState, inspectionDuration, scannerPosition, shippingWindow, tickFactory, trySupplyOre } from './factory'
import type { FactoryItem, FactoryState } from './factory'

const start = (): FactoryState => ({ ...createFactoryState(), running: true })

function advance(state: FactoryState, count: number): FactoryState {
  for (let index = 0; index < count; index++) state = tickFactory(state)
  return state
}

describe('continuous factory engine', () => {
  it('starts stopped with no containers or production history', () => {
    expect(createFactoryState()).toEqual({
      tick: 0, running: false, speed: 1, items: [], producedCount: 0, shippedCount: 0, inspectedCount: 0,
      nextItemId: 1, minerStatus: 'waiting', recentShipments: [],
    })
  })

  it('supplies ore on ticks 2, 4 and 6, starting each new container in the first cell', () => {
    let state = start()
    for (let tick = 1; tick <= 6; tick++) {
      const previous = state
      state = tickFactory(state)
      expect(state.tick).toBe(tick)
      expect(state.producedCount).toBe(Math.floor(tick / 2))
      if (tick % 2 === 0) {
        expect(state.minerStatus).toBe('supplied')
        expect(state.items[0]).toEqual({ id: `C-0${tick / 2}`, position: 0, inspectionStatus: 'pending', inspectionTicks: 0 })
        expect(previous.items.some(item => item.id === state.items[0].id)).toBe(false)
      } else {
        expect(state.minerStatus).toBe('waiting')
        expect(state.nextItemId).toBe(previous.nextItemId)
      }
    }
    expect(state.items.map(item => item.position)).toEqual([0, 2, 3])
  })

  it('refuses to make a container when the supply cell is occupied', () => {
    const items = Object.freeze([Object.freeze({ id: 'C-01', position: 0 })])
    expect(trySupplyOre(items, 2)).toBeUndefined()
    expect(items).toHaveLength(1)
    expect(trySupplyOre([], 2)).toEqual({ id: 'C-02', position: 0, inspectionStatus: 'pending', inspectionTicks: 0 })
  })

  it('starts at 0/2 on arrival and holds the load until the tick after completion', () => {
    expect(scannerPosition).toBe(3)
    expect(inspectionDuration).toBe(2)
    const arrived = advance(start(), 5)
    const halfway = tickFactory(arrived)
    const complete = tickFactory(halfway)
    const released = tickFactory(complete)
    const first = (state: FactoryState) => state.items.find(item => item.id === 'C-01')

    expect(first(arrived)).toMatchObject({ position: scannerPosition, inspectionStatus: 'inspecting', inspectionTicks: 0 })
    expect(first(halfway)).toMatchObject({ position: scannerPosition, inspectionStatus: 'inspecting', inspectionTicks: 1 })
    expect(first(complete)).toMatchObject({ position: scannerPosition, inspectionStatus: 'passed', inspectionTicks: 2 })
    expect(first(released)).toMatchObject({ position: scannerPosition + 1, inspectionStatus: 'passed', inspectionTicks: 2 })
    expect([arrived, halfway, complete, released].map(state => state.inspectedCount)).toEqual([0, 0, 1, 1])
    expect(halfway.items.find(item => item.id === 'C-02')).toMatchObject({ position: 2, inspectionStatus: 'pending' })
    expect(complete.items.find(item => item.id === 'C-02')).toMatchObject({ position: 2, inspectionStatus: 'pending' })
    expect(released.items.find(item => item.id === 'C-02')).toMatchObject({ position: 3, inspectionStatus: 'inspecting', inspectionTicks: 0 })
  })

  it('ships on the tick after reaching the exit and removes the shipped container', () => {
    const arrived = advance(start(), 11)
    const exitItem = { id: 'C-01', position: 7, inspectionStatus: 'passed', inspectionTicks: 2 }
    expect(arrived.items).toContainEqual(exitItem)
    expect(arrived.shippedCount).toBe(0)

    const shipped = tickFactory(arrived)
    expect(shipped.shippedCount).toBe(1)
    expect(shipped.items.some(item => item.id === 'C-01')).toBe(false)
    expect(shipped.recentShipments).toEqual([{ id: 'C-01', tick: 12 }])
    expect(arrived.items).toContainEqual(exitItem)
  })

  it('rejects an uninspected item at the gate even if seeded directly in the exit cell', () => {
    const item: FactoryItem = { id: 'C-01', position: 7, inspectionStatus: 'pending', inspectionTicks: 0 }
    const next = tickFactory({ ...start(), items: [item], producedCount: 1, nextItemId: 2 })
    expect(next.items).toEqual([item])
    expect(next.shippedCount).toBe(0)
    expect(next.recentShipments).toEqual([])
  })

  it('ships first, moves right to left, then supplies into the freed entrance on a full line', () => {
    const items = Array.from({ length: conveyorLength }, (_, position): FactoryItem => ({
      id: `C-0${conveyorLength - position}`,
      position,
      inspectionStatus: position >= scannerPosition ? 'passed' : 'pending',
      inspectionTicks: position >= scannerPosition ? inspectionDuration : 0,
    }))
    const full: FactoryState = { ...start(), tick: 1, producedCount: 8, inspectedCount: 5, nextItemId: 9, items }
    const next = tickFactory(full)

    expect(next.items).toEqual([
      { id: 'C-09', position: 0, inspectionStatus: 'pending', inspectionTicks: 0 },
      ...items.slice(0, -1).map(item => ({
        ...item,
        position: item.position + 1,
        inspectionStatus: item.position + 1 === scannerPosition ? 'inspecting' : item.inspectionStatus,
      })),
    ])
    expect(next).toMatchObject({ tick: 2, producedCount: 9, shippedCount: 1, nextItemId: 10, minerStatus: 'supplied' })
    expect(next.recentShipments).toEqual([{ id: 'C-01', tick: 2 }])
    expect(full.items[0].position).toBe(0)
  })

  it('keeps the latest 20 completed ticks of shipment IDs', () => {
    const state = advance(start(), 32)
    expect(state.shippedCount).toBe(7)
    expect(state.recentShipments.every(shipment => shipment.tick > state.tick - shippingWindow)).toBe(true)
    expect(state.recentShipments[0]).toEqual({ id: 'C-02', tick: 15 })
    expect(state.recentShipments.at(-1)).toEqual({ id: 'C-07', tick: 30 })
  })

  it('holds the whole state when stopped and resumes the same tick sequence', () => {
    const active = advance(start(), 6)
    const paused: FactoryState = { ...active, running: false }
    expect(advance(paused, 5)).toBe(paused)
    expect(tickFactory({ ...paused, running: true })).toEqual(tickFactory(active))
  })

  it('gives identical results for the same tick sequence at all playback speeds', () => {
    const baseline = advance(start(), 50)
    let state = start()
    for (let tick = 0; tick < baseline.tick; tick++) {
      const speed: ConveyorSpeed = conveyorSpeeds[tick % conveyorSpeeds.length]
      state = tickFactory({ ...state, speed })
      expect(state.speed).toBe(speed)
    }
    expect({ ...state, speed: 1 }).toEqual(baseline)
  })

  it('creates a fresh reset state after production and shipping', () => {
    const used = advance(start(), 12)
    expect(used.shippedCount).toBeGreaterThan(0)
    const reset = createFactoryState()
    expect(reset).toEqual(createFactoryState())
    expect(reset).toMatchObject({ items: [], tick: 0, nextItemId: 1, shippedCount: 0, producedCount: 0 })
    expect(reset.inspectedCount).toBe(0)
    expect(reset.recentShipments).not.toBe(used.recentShipments)
  })

  it('conserves containers and preserves FIFO through 20,000 ticks', () => {
    let state = start()
    const producedIds = new Set<string>()
    const inspectedIds = new Set<string>()
    const shippedIds = new Set<string>()
    for (let tick = 1; tick <= 20_000; tick++) {
      const previousInspected = state.inspectedCount
      state = tickFactory(state)
      expect(state.producedCount).toBe(state.shippedCount + state.items.length)
      expect(state.items.every((item, index) => item.position >= 0 && item.position < conveyorLength &&
        (index === 0 || item.position > state.items[index - 1].position))).toBe(true)
      expect(state.items.every(item => item.position <= scannerPosition || item.inspectionStatus === 'passed')).toBe(true)
      expect(state.items.filter(item => item.inspectionStatus === 'inspecting').length).toBeLessThanOrEqual(1)

      if (state.minerStatus === 'supplied') producedIds.add(state.items[0].id)
      if (state.inspectedCount > previousInspected) {
        inspectedIds.add(state.items.find(item => item.position === scannerPosition && item.inspectionStatus === 'passed')!.id)
      }
      const lastShipment = state.recentShipments.at(-1)
      if (lastShipment?.tick === tick) {
        shippedIds.add(lastShipment.id)
        expect(lastShipment.id).toBe(`C-${String(state.shippedCount).padStart(2, '0')}`)
        expect(producedIds.has(lastShipment.id)).toBe(true)
        expect(inspectedIds.has(lastShipment.id)).toBe(true)
      }
    }
    expect(state).toMatchObject({ tick: 20_000, producedCount: 6_669, shippedCount: 6_663, inspectedCount: 6_665, nextItemId: 6_670 })
    expect(producedIds.size).toBe(state.producedCount)
    expect(inspectedIds.size).toBe(state.inspectedCount)
    expect(shippedIds.size).toBe(state.shippedCount)
    expect(state.items.map(item => item.position)).toEqual([0, 1, 2, 3, 4, 7])
    expect(state.items.every(item => producedIds.has(item.id) && !shippedIds.has(item.id))).toBe(true)
  })
})
