import { expect, it } from 'vitest'
import { judgeSorting, medianTime, partsPerMinute, sortingInput, sortingSizes } from './sortingCases'

it.each(sortingSizes)('reproduces every input kind for %i elements', size => {
  const random = sortingInput({ size, kind: 'random', seed: 42 })
  const ascending = [...random].sort((a, b) => a - b)
  const duplicates = sortingInput({ size, kind: 'duplicates', seed: 42 })
  expect(random).toHaveLength(size)
  expect(sortingInput({ size, kind: 'random', seed: 42 })).toEqual(random)
  expect(sortingInput({ size, kind: 'random', seed: 43 })).not.toEqual(random)
  expect(sortingInput({ size, kind: 'sorted', seed: 42 })).toEqual(ascending)
  expect(sortingInput({ size, kind: 'reverse', seed: 42 })).toEqual([...ascending].reverse())
  expect(sortingInput({ size, kind: 'duplicates', seed: 42 })).toEqual(duplicates)
  expect(new Set(duplicates).size).toBe(8)
})

it('requires ascending order and the exact multiset, including empty and singleton lists', () => {
  expect(judgeSorting([], [])).toBe('passed')
  expect(judgeSorting([1], [1])).toBe('passed')
  expect(judgeSorting([3, 2, 2, 1], [1, 2, 2, 3])).toBe('passed')
  expect(judgeSorting([1, 2, 2, 3], [1, 2, 2, 3])).toBe('passed')
  expect(judgeSorting([3, 2, 2, 1], [3, 2, 2, 1])).toBe('wrong')
  expect(judgeSorting([3, 2, 2, 1], [1, 1, 2, 3])).toBe('wrong')
  expect(judgeSorting([1, 2], [1])).toBe('wrong')
  expect(judgeSorting([1], [1, 2])).toBe('wrong')
  for (const value of [null, '1', [true], [1.5], [NaN], Array(1)]) {
    expect(judgeSorting([1], value)).toBe('invalid-result')
  }
})

it('derives throughput from the median and suppresses sub-resolution timings', () => {
  expect(medianTime([30, 5, 20])).toBe(20)
  expect(partsPerMinute(1000, 20)).toBe(3_000_000)
  expect(partsPerMinute(1000, 0.099)).toBeNull()
  expect(partsPerMinute(1000, 0)).toBeNull()
})
