import { describe, expect, it } from 'vitest'
import { assessSearchResult, createWarehouse, createWeightSearch, defaultWeights, generateOrder, getWeightSearchView, lowerBound, weightSearchReducer } from './engine'
import type { WeightSearchAction } from './engine'

const create = (sample = 0.5) => createWeightSearch(defaultWeights, sample)
const play = (state: ReturnType<typeof create>, ...actions: WeightSearchAction[]) =>
  actions.reduce(weightSearchReducer, state)
const weigh = (state: ReturnType<typeof create>, ...indices: number[]) =>
  indices.reduce((current, index) => play(current, { type: 'weigh', index }, { type: 'tick' }, { type: 'tick' }), state)

describe('weight search engine', () => {
  it('sorts a copy of 16 unique positive integers and accepts a custom data set', () => {
    const weights = Array.from({ length: 16 }, (_, index) => 3 * (16 - index))
    const state = createWeightSearch(weights, 0)
    expect(state.weights).toEqual([...weights].reverse())
    expect(weights[0]).toBe(48)
    expect(getWeightSearchView(weigh(state, 0)).confirmed).toBe(0)
    expect(() => createWarehouse(weights.slice(1))).toThrow(RangeError)
    for (const invalid of [0, -1, 2.5, 6, NaN]) {
      expect(() => createWarehouse([...weights.slice(0, -1), invalid])).toThrow(RangeError)
    }
  })

  it('samples inclusive limits reproducibly and always excludes the previous threshold', () => {
    expect(generateOrder(12, 128, 0)).toEqual({ id: 'ORD-001', number: 1, requiredWeight: 12 })
    const upper = generateOrder(12, 128, 0.999)
    expect(upper.requiredWeight).toBe(128)
    expect(generateOrder(12, 128, 0.999, upper)).toEqual({ id: 'ORD-002', number: 2, requiredWeight: 127 })
    const previous = generateOrder(12, 128, 0.5)
    expect(generateOrder(12, 128, 0.5, previous).requiredWeight).toBe(71)
    expect(generateOrder(12, 128, 0, generateOrder(12, 128, 0)).requiredWeight).toBe(13)
    expect(() => generateOrder(12, 128, 1)).toThrow(RangeError)
  })

  it('keeps weights private until two ticks complete a measurement and charges repeats', () => {
    const initial = create()
    const initialView = getWeightSearchView(initial)
    expect(initialView).not.toHaveProperty('weights')
    expect(initialView.slots).toEqual(Array.from({ length: 16 }, (_, index) => ({ index, candidate: true, measurement: undefined })))
    for (const index of [-1, 16, 0.5, NaN]) expect(play(initial, { type: 'weigh', index })).toBe(initial)

    const started = play(initial, { type: 'weigh', index: 9 })
    expect(play(started, { type: 'weigh', index: 10 })).toBe(started)
    const firstTick = play(started, { type: 'tick' })
    expect(getWeightSearchView(firstTick)).toMatchObject({
      pending: { index: 9, elapsedTicks: 1 }, log: [], cost: { count: 0, power: 0, ticks: 0 }, totalPower: 0,
    })
    const measured = play(firstTick, { type: 'tick' })
    expect(getWeightSearchView(measured)).toMatchObject({
      log: [{ index: 9, weight: 69, qualifies: false }], candidates: { first: 10, last: 15 },
      cost: { count: 1, power: 10, ticks: 2 }, totalPower: 10, credits: 0, pending: null,
    })
    expect(getWeightSearchView(measured).slots[9].measurement?.weight).toBe(69)
    expect(getWeightSearchView(measured).slots[10].measurement).toBeUndefined()
    expect(play(measured, { type: 'tick' })).toBe(measured)
    expect(getWeightSearchView(weigh(measured, 9))).toMatchObject({
      cost: { count: 2, power: 20, ticks: 4 }, totalPower: 20, candidates: { first: 10, last: 15 },
    })
  })

  it('requires the adjacent boundary, ships the lower bound and rewards only once', () => {
    const initial = create()
    expect(play(initial, { type: 'nextOrder', sample: 0 })).toBe(initial)
    const found = weigh(initial, 10, 7, 14)
    expect(getWeightSearchView(found)).toMatchObject({ candidates: { first: 8, last: 10 }, confirmed: null })
    expect(play(found, { type: 'ship', index: 10 })).toBe(found)
    const solved = weigh(found, 9)
    expect(getWeightSearchView(solved)).toMatchObject({ candidates: { first: 10, last: 10 }, confirmed: 10 })
    expect(play(solved, { type: 'ship', index: 14 })).toBe(solved)
    const busy = play(solved, { type: 'weigh', index: 10 })
    expect(play(busy, { type: 'ship', index: 10 })).toBe(busy)
    const completed = play(solved, { type: 'ship', index: 10 })
    expect(getWeightSearchView(completed)).toMatchObject({
      credits: 100, totalPower: 40,
      completion: {
        shipped: { index: 10, weight: 76 },
        actual: { count: 4, power: 40, ticks: 8 }, linear: { count: 11, power: 110, ticks: 22 }, savedPower: 70,
      },
    })
    expect(getWeightSearchView(completed).history).toHaveLength(1)
    expect(play(completed, { type: 'ship', index: 10 })).toBe(completed)
    expect(play(completed, { type: 'weigh', index: 10 })).toBe(completed)
  })

  it('checks the lightest and heaviest boundaries without treating an unmeasured candidate as a pass', () => {
    expect(lowerBound(defaultWeights, 12)).toBe(0)
    expect(lowerBound(defaultWeights, 128)).toBe(15)
    expect(lowerBound(defaultWeights, 129)).toBe(16)
    expect(getWeightSearchView(weigh(create(0), 0)).confirmed).toBe(0)
    const lastCandidate = weigh(create(0.999), 14)
    expect(getWeightSearchView(lastCandidate)).toMatchObject({ candidates: { first: 15, last: 15 }, confirmed: null })
    expect(play(lastCandidate, { type: 'ship', index: 15 })).toBe(lastCandidate)
    expect(getWeightSearchView(weigh(lastCandidate, 15)).confirmed).toBe(15)
  })

  it('distinguishes the correct index, verified boundary, and no matching ore', () => {
    const state = create()
    expect(assessSearchResult(state, 10)).toMatchObject({ correct: true, verified: false })
    const measured = weigh(state, 9, 10)
    expect(assessSearchResult(measured, 10)).toEqual({ correct: true, verified: true, cost: { count: 2, power: 20, ticks: 4 } })
    expect(assessSearchResult(measured, 11)).toMatchObject({ correct: false, verified: false })
    const noMatch = { ...state, order: { ...state.order, requiredWeight: 129 } }
    expect(assessSearchResult(noMatch, 16)).toMatchObject({ correct: true, verified: false })
    expect(assessSearchResult(weigh(noMatch, 15), 16)).toMatchObject({ correct: true, verified: true })
  })

  it('cancels an unfinished weigh and resets attempts without changing the order or cumulative cost', () => {
    const initial = create()
    const measured = weigh(initial, 9)
    const pending = play(measured, { type: 'weigh', index: 10 }, { type: 'tick' })
    expect(play(pending, { type: 'resetAttempt' })).toBe(pending)
    const cancelled = play(pending, { type: 'cancelWeigh' }, { type: 'tick' })
    expect(cancelled.log).toBe(measured.log)
    const reset = play(cancelled, { type: 'resetAttempt' })
    expect(reset.order).toBe(initial.order)
    expect(reset.weights).toBe(initial.weights)
    expect(getWeightSearchView(reset)).toMatchObject({
      credits: 0, totalPower: 10, log: [], pending: null, candidates: { first: 0, last: 15 },
    })
  })

  it('resets order scope and retains totals and history including a negative comparison', () => {
    const first = play(weigh(create(), 10, 9), { type: 'ship', index: 10 })
    const second = play(first, { type: 'nextOrder', sample: 0 })
    const view = getWeightSearchView(second)
    expect(second.weights).toBe(first.weights)
    expect(second.history[0].log).toHaveLength(2)
    expect(view.history[0]).not.toHaveProperty('log')
    expect(view.completion).toBeUndefined()
    expect(view.slots.every(slot => slot.candidate && !slot.measurement)).toBe(true)
    expect(view).toMatchObject({
      order: { id: 'ORD-002', requiredWeight: 12 }, cost: { count: 0, power: 0, ticks: 0 },
      log: [], totalPower: 20, credits: 100,
    })
    const secondComplete = play(weigh(second, 0, ...Array<number>(18).fill(0)), { type: 'ship', index: 0 })
    expect(getWeightSearchView(secondComplete)).toMatchObject({
      totalPower: 210, credits: 200, completion: { savedPower: -180, actual: { count: 19 }, linear: { count: 1 } },
    })
    expect(getWeightSearchView(secondComplete).history).toHaveLength(2)
    expect(getWeightSearchView(play(secondComplete, { type: 'nextOrder', sample: 0 })).order)
      .toEqual({ id: 'ORD-003', number: 3, requiredWeight: 13 })
  })
})
