import type { SortingCase } from './sortingCases'

export type SortingCommand = { code: string; input: number[] }
export type SortingEvent =
  | { type: 'ready' }
  | { type: 'finished'; samples: { ms: number; output: unknown }[] }
  | { type: 'failed'; reason: 'exception' | 'invalid-result'; detail: string }

export type SortingResult = SortingCase & (
  | { status: 'passed'; ms: number }
  | { status: 'wrong' | 'invalid-result' | 'exception' | 'timeout' | 'stopped'; detail: string }
)
