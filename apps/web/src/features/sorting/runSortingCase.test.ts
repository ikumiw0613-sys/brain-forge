// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runSortingCase } from './runSortingCase'
import type { SortingCommand, SortingEvent } from './sortingProtocol'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<SortingEvent>) => void) | null = null
  postMessage = vi.fn<(command: SortingCommand) => void>()
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  emit(data: SortingEvent) { this.onmessage?.(new MessageEvent('message', { data })) }
}

const testCase = { size: 100, kind: 'reverse', seed: 42 } as const
const start = (controller = new AbortController(), ready = vi.fn()) =>
  runSortingCase(testCase, 'def sort_parts(a): return a', controller.signal, ready)

beforeEach(() => {
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('uses Worker function timings, validates all trials and ends the Worker', async () => {
  const ready = vi.fn()
  const result = start(undefined, ready)
  const worker = TestWorker.instances[0]
  const { input } = worker.postMessage.mock.calls[0][0]
  await vi.advanceTimersByTimeAsync(12_000)
  worker.emit({ type: 'ready' })
  expect(ready).toHaveBeenCalledOnce()
  const output = [...input].reverse()
  worker.emit({ type: 'finished', samples: [15, 4, 6].map(ms => ({ ms, output })) })
  await expect(result).resolves.toMatchObject({ status: 'passed', ms: 6 })
  expect(worker.terminate).toHaveBeenCalledOnce()

  const wrong = start()
  const next = TestWorker.instances[1]
  next.emit({ type: 'ready' })
  next.emit({ type: 'finished', samples: [{ ms: 1, output }, { ms: 2, output: input }, { ms: 3, output }] })
  await expect(wrong).resolves.toMatchObject({ status: 'wrong' })
})

it.each(['exception', 'invalid-result'] as const)('distinguishes %s from wrong answers', async reason => {
  const result = start()
  TestWorker.instances[0].emit({ type: 'ready' })
  TestWorker.instances[0].emit({ type: 'failed', reason, detail: 'test failure' })
  await expect(result).resolves.toMatchObject({ status: reason, detail: 'test failure' })
})

it('terminates unresponsive workers and can cancel and restart using new workers', async () => {
  const loading = start()
  await vi.advanceTimersByTimeAsync(45_000)
  await expect(loading).resolves.toMatchObject({ status: 'timeout' })
  const execution = start()
  TestWorker.instances[1].emit({ type: 'ready' })
  await vi.advanceTimersByTimeAsync(10_000)
  await expect(execution).resolves.toMatchObject({ status: 'timeout' })
  const controller = new AbortController()
  const interrupted = start(controller)
  controller.abort()
  await expect(interrupted).resolves.toMatchObject({ status: 'stopped' })
  const retry = start()
  const worker = TestWorker.instances[3]
  worker.emit({ type: 'ready' })
  const output = [...worker.postMessage.mock.calls[0][0].input].reverse()
  worker.emit({ type: 'finished', samples: [1, 2, 3].map(ms => ({ ms, output })) })
  await expect(retry).resolves.toMatchObject({ status: 'passed' })
  expect(TestWorker.instances.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
