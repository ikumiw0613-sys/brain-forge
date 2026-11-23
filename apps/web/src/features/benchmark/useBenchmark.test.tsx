// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { pythonLimits } from '../../factory/python/usePythonSearch'
import type { PythonCommand, PythonEvent } from '../../factory/python/pythonProtocol'
import { benchmarkConditions } from './benchmarkEngine'
import type { BenchmarkJob } from './benchmarkStats'
import { useBenchmark } from './useBenchmark'

it('records distinct failures, restarts each case, and terminates the active worker on cancellation', async () => {
  const workers: TestWorker[] = []
  class TestWorker {
    onmessage: ((event: MessageEvent<PythonEvent>) => void) | null = null
    command!: Extract<PythonCommand, { type: 'run' }>
    terminate = vi.fn()
    constructor() { workers.push(this) }
    postMessage(command: PythonCommand) { if (command.type === 'run') this.command = command }
    emit(event: Omit<Extract<PythonEvent, { type: 'finished' }>, 'runId'> |
      Omit<Extract<PythonEvent, { type: 'failed' }>, 'runId'> | { type: 'ready' }) {
      return act(async () => this.onmessage?.(new MessageEvent('message', { data: { ...event, runId: this.command.runId } })))
    }
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Worker', TestWorker)
  vi.useFakeTimers()
  const root = createRoot(document.createElement('div'))
  let benchmark!: ReturnType<typeof useBenchmark>
  function Trial() {
    benchmark = useBenchmark()
    return null
  }
  const jobs: BenchmarkJob[] = [42, 123, 456].flatMap(seed => [
    { variant: 'A', code: 'result = 0', conditions: { ...benchmarkConditions, seed } },
    { variant: 'B', code: 'result = n + 1', conditions: { ...benchmarkConditions, seed } },
  ])
  try {
    await act(async () => root.render(<Trial />))
    await act(async () => benchmark.start(jobs))
    await workers[0].emit({ type: 'ready' })
    await workers[0].emit({ type: 'finished', index: 0 })
    expect(workers[1].command).toMatchObject({ target: workers[0].command.target, n: 256, code: 'result = n + 1' })
    await workers[1].emit({ type: 'ready' })
    await workers[1].emit({ type: 'finished', index: 257 })
    await workers[2].emit({ type: 'failed', reason: 'invalid-result', message: 'non-integer result' })
    await workers[3].emit({ type: 'failed', message: 'SyntaxError' })
    await workers[4].emit({ type: 'ready' })
    await act(async () => vi.advanceTimersByTime(pythonLimits.idleMs + 1))
    expect(benchmark.results.map(entry => entry.issue?.kind)).toEqual([
      'wrong', 'invalid-result', 'invalid-result', 'exception', 'timeout',
    ])
    expect(benchmark.results.every(entry => entry.result.revenue === 0 && entry.result.ticks === 0)).toBe(true)
    expect(benchmark.caseNumber).toBe(6)
    expect(benchmark.status).toBe('running')
    const stale = workers[5].onmessage
    await act(async () => benchmark.stop())
    await act(async () => stale?.(new MessageEvent('message', { data: { type: 'ready', runId: workers[5].command.runId } })))
    expect(benchmark.status).toBe('stopped')
    expect(benchmark.results.at(-1)?.status).toBe('stopped')
    expect(workers).toHaveLength(6)
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
