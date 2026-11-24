// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { lowerBound } from '../../factory/warehouse/engine'
import { pythonLimits } from '../../factory/python/usePythonSearch'
import type { PythonCommand, PythonEvent, PythonPrepareCommand } from '../../factory/python/pythonProtocol'
import { benchmarkDistributions } from './benchmarkDistributions'
import { benchmarkConditions, createBenchmark } from './benchmarkEngine'
import type { BenchmarkJob } from './benchmarkStats'
import { useBenchmark } from './useBenchmark'

type WorkerEvent = {
  [Kind in PythonEvent['type']]: Omit<Extract<PythonEvent, { type: Kind }>, 'runId'>
}[PythonEvent['type']]

async function withBenchmark(check: (harness: {
  runs: TestWorker[]
  workers: TestWorker[]
  benchmark: () => ReturnType<typeof useBenchmark>
}) => Promise<void>) {
  const workers: TestWorker[] = []
  const runs: TestWorker[] = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Worker', class extends TestWorker {
    constructor() { super(runs); workers.push(this) }
  })
  const cores = vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(4)
  vi.useFakeTimers()
  const root = createRoot(document.createElement('div'))
  let latest!: ReturnType<typeof useBenchmark>
  function Trial() {
    latest = useBenchmark()
    return null
  }
  try {
    await act(async () => root.render(<Trial />))
    await check({ runs, workers, benchmark: () => latest })
  } finally {
    await act(async () => root.unmount())
    cores.mockRestore()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
}

class TestWorker {
  onmessage: ((event: MessageEvent<PythonEvent>) => void) | null = null
  onerror: (() => void) | null = null
  command!: Extract<PythonCommand, { type: 'run' }>
  messages: (PythonCommand | PythonPrepareCommand)[] = []
  terminate = vi.fn()
  constructor(private runs: TestWorker[]) {}
  postMessage(command: PythonCommand | PythonPrepareCommand) {
    this.messages.push(command)
    if (command.type === 'run') {
      this.command = command
      this.runs.push(this)
    }
  }
  emit(event: WorkerEvent) {
    return act(async () => this.onmessage?.(new MessageEvent('message', { data: { ...event, runId: this.command.runId } })))
  }
}

it('records case failures, uses fresh prepared workers, and releases active and spare workers on cancellation', async () => {
  await withBenchmark(async ({ runs, workers, benchmark: state }) => {
    const jobs: BenchmarkJob[] = benchmarkDistributions.flatMap(({ id: distribution }) => [
      { variant: 'A', code: 'result = 0', conditions: { ...benchmarkConditions, distribution } },
      { variant: 'B', code: 'result = n + 1', conditions: { ...benchmarkConditions, distribution } },
    ])
    await act(async () => state().start(jobs))
    expect(workers).toHaveLength(3)
    expect(workers.slice(1).map(worker => worker.messages)).toEqual([[{ type: 'prepare' }], [{ type: 'prepare' }]])
    await runs[0].emit({ type: 'ready' })
    await runs[0].emit({ type: 'finished', index: 0 })
    expect(runs[1]).toBe(workers[1])
    expect(runs[1].command).toEqual({ type: 'run', runId: 2, target: runs[0].command.target, n: 256, code: 'result = n + 1' })
    await runs[1].emit({ type: 'ready' })
    await runs[1].emit({ type: 'finished', index: 257 })
    await runs[2].emit({ type: 'failed', reason: 'invalid-result', message: 'non-integer result' })
    await runs[3].emit({ type: 'failed', message: 'SyntaxError' })
    await runs[4].emit({ type: 'ready' })
    await act(async () => vi.advanceTimersByTime(pythonLimits.idleMs + 1))
    const { weights, order } = createBenchmark(42, 256, 'skewed').search
    await runs[5].emit({ type: 'ready' })
    await runs[5].emit({ type: 'finished', index: lowerBound(weights, order.requiredWeight) })
    expect(runs[4].command.target).toBe(runs[5].command.target)
    const benchmark = state()
    expect(benchmark.results.map(entry => entry.issue?.kind)).toEqual([
      'wrong', 'invalid-result', 'invalid-result', 'exception', 'timeout', 'unverified',
    ])
    expect(benchmark.results[5].tally).toMatchObject({ correct: 1, unverified: 1, wrong: 0 })
    expect(benchmark.results.every(entry => entry.result.revenue === 0 && entry.result.ticks === 0)).toBe(true)
    expect(benchmark.caseNumber).toBe(7)
    expect(benchmark.status).toBe('running')
    const stale = runs[6].onmessage
    await act(async () => benchmark.stop())
    await act(async () => stale?.(new MessageEvent('message', { data: { type: 'ready', runId: runs[6].command.runId } })))
    expect(state().status).toBe('stopped')
    expect(state().results.at(-1)?.status).toBe('stopped')
    expect(state().results.at(-1)?.job.conditions.distribution).toBe('duplicates')
    expect(runs).toHaveLength(7)
    expect(new Set(runs).size).toBe(7)
    expect(workers).toHaveLength(9)
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
  })
})

it('progresses to the next order using a prepared worker and preserves costs across a stop and rerun', async () => {
  await withBenchmark(async ({ runs, workers, benchmark }) => {
    const job: BenchmarkJob = { variant: 'A', code: 'search', conditions: { ...benchmarkConditions, ticks: 26 } }
    const { weights, order } = createBenchmark().search
    const index = lowerBound(weights, order.requiredWeight)
    const submitFirstOrder = async (worker: TestWorker) => {
      await worker.emit({ type: 'ready' })
      await worker.emit({ type: 'weigh', index: index - 1, requestId: 1 })
      expect(worker.messages.at(-1)).toMatchObject({ type: 'weighed', weight: weights[index - 1] })
      await worker.emit({ type: 'weigh', index, requestId: 2 })
      expect(worker.messages.at(-1)).toMatchObject({ type: 'weighed', weight: weights[index] })
      await worker.emit({ type: 'finished', index })
    }
    await act(async () => benchmark().start([job]))
    await submitFirstOrder(runs[0])
    expect(runs[1]).toBe(workers[1])
    expect(runs[1].command.target).not.toBe(order.requiredWeight)
    await act(async () => benchmark().stop())
    expect(benchmark().results[0]).toMatchObject({
      status: 'stopped', result: { ticks: 24, completed: 1, measurements: 2, power: 20 },
    })
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
    await act(async () => benchmark().start([job]))
    expect(runs[2].command.target).toBe(order.requiredWeight)
    await submitFirstOrder(runs[2])
    await runs[3].emit({ type: 'ready' })
    await runs[3].emit({ type: 'weigh', index: 0, requestId: 1 })
    expect(benchmark().results[0]).toMatchObject({
      status: 'completed', result: { ticks: 26, completed: 1, measurements: 3, power: 30 },
    })
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
  })
})

it('discards a spare that fails to start and times out an unresponsive active worker', async () => {
  await withBenchmark(async ({ runs, workers, benchmark }) => {
    const job: BenchmarkJob = { variant: 'A', code: 'search', conditions: benchmarkConditions }
    await act(async () => benchmark().start([job, { ...job, variant: 'B' }]))
    await act(async () => workers[1].onerror?.())
    expect(workers[1].terminate).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTime(pythonLimits.loadingMs + 1))
    expect(benchmark().results[0].issue?.kind).toBe('timeout')
    expect(runs[0].terminate).toHaveBeenCalledOnce()
    expect(runs[1]).toBe(workers[2])
    await act(async () => benchmark().stop())
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
  })
})

it('releases the active worker and every prepared worker when leaving the screen', async () => {
  let spawned: TestWorker[] = []
  await withBenchmark(async ({ workers, benchmark }) => {
    spawned = workers
    await act(async () => benchmark().start([{ variant: 'A', code: 'search', conditions: benchmarkConditions }]))
  })
  expect(spawned).toHaveLength(3)
  expect(spawned.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
})
