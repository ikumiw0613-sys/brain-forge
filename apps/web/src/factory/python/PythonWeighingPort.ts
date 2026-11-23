import type { assessSearchResult, Measurement } from '../warehouse/engine'

export interface PythonWeighingPort {
  beginAttempt(): { n: number; target: number } | undefined
  assess(index: number): ReturnType<typeof assessSearchResult>
  weigh(index: number, onComplete?: (measurement: Measurement) => void): boolean
  cancelWeigh(): void
  flushMeasurements(): void
}
