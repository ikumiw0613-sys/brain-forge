export const sortingSizes = [100, 1000, 10000] as const
export const sortingKinds = { random: 'ランダム', reverse: '逆順', sorted: '整列済み', duplicates: '重複多数' } as const
export type SortingKind = keyof typeof sortingKinds
export type SortingCase = { size: number; kind: SortingKind; seed: number }
export const repetitions = 3
export const timingFloorMs = 0.1

export function sortingInput({ size, kind, seed }: SortingCase) {
  let state = seed >>> 0
  const range = kind === 'duplicates' ? 8 : size * 16
  const values = Array.from({ length: size }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 2 ** 32 * range)
  })
  if (kind === 'sorted') values.sort((a, b) => a - b)
  if (kind === 'reverse') values.sort((a, b) => b - a)
  return values
}

export function judgeSorting(input: readonly number[], output: unknown) {
  if (!Array.isArray(output) || !Array.from(output).every(Number.isSafeInteger)) return 'invalid-result'
  if (input.length !== output.length) return 'wrong'
  const expected = [...input].sort((a, b) => a - b)
  return expected.every((value, index) => value === output[index]) ? 'passed' : 'wrong'
}

export function medianTime(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function partsPerMinute(size: number, ms: number) {
  return ms >= timingFloorMs ? size * 60_000 / ms : null
}
