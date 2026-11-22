// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PythonCommand, PythonEvent } from './pythonProtocol'
import { pythonLimits } from './usePythonSearch'
import { weightSearchTickMs } from './useWeightSearch'
import { WeightSearchPrototype } from './WeightSearchPrototype'

class MockWorker {
  static instances: MockWorker[] = []
  messages: PythonCommand[] = []
  onmessage: ((event: MessageEvent<PythonEvent>) => void) | null = null
  onerror = null
  onmessageerror = null
  terminate = vi.fn()

  constructor() { MockWorker.instances.push(this) }

  postMessage(message: PythonCommand) { this.messages.push(message) }

  emit(event: PythonEvent) { this.onmessage?.(new MessageEvent('message', { data: event })) }

  get runId() { return this.messages[0].runId }
}

let container: HTMLDivElement
let root: Root | undefined

beforeEach(async () => {
  MockWorker.instances = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Worker', MockWorker)
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<StrictMode><WeightSearchPrototype initialSample={0.5} /></StrictMode>) })
})

afterEach(async () => {
  await unmount()
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const button = (label: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === label)!
const runButton = () => button('実行')
const ore = (index: number) => container.querySelectorAll<HTMLButtonElement>('.weight-slots button')[index]
const read = (selector: string) => container.querySelector(selector)?.textContent
const click = (node: HTMLButtonElement) => act(async () => { node.click() })
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })
const measureTime = 2 * weightSearchTickMs

async function unmount() {
  await act(async () => { root?.unmount() })
  root = undefined
}

async function start(ready = true) {
  await click(runButton())
  const worker = MockWorker.instances.at(-1)!
  if (ready) await act(async () => { worker.emit({ type: 'ready', runId: worker.runId }) })
  return worker
}

function request(worker: MockWorker, requestId: number, index: number) {
  return act(async () => { worker.emit({ type: 'weigh', runId: worker.runId, requestId, index }) })
}

function done(worker: MockWorker, index: number) {
  return act(async () => { worker.emit({ type: 'finished', runId: worker.runId, index }) })
}

describe('Python Worker integration with the weight search UI', () => {
  it('connects the starter code to real engine ticks and delivers ordered, once-only responses', async () => {
    const run = runButton()
    await act(async () => { run.click(); run.click() })
    expect(MockWorker.instances).toHaveLength(1)
    const worker = MockWorker.instances[0]
    expect(worker.messages[0]).toEqual({
      type: 'run', runId: 1, code: expect.stringContaining('for i in range(n):'), n: 16, target: 70,
    })
    expect(read('.weight-python-status')).toContain('読み込み中')
    expect(runButton().disabled).toBe(true)
    await act(async () => { worker.emit({ type: 'ready', runId: worker.runId }) })
    expect(read('.weight-python-status')).toContain('実行中')
    await request(worker, 1, 0)
    expect(read('.weight-stations div:first-child')).toContain('鉱石 01 を計量中')
    await request(worker, 1, 0)
    await request(worker, 2, 3)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighError', requestId: 2, message: expect.stringContaining('動作中') })
    await advance(weightSearchTickMs)
    expect(worker.messages).toHaveLength(2)
    await advance(weightSearchTickMs)
    expect(worker.messages.at(-1)).toEqual({ type: 'weighed', runId: 1, requestId: 1, weight: 12 })
    await request(worker, 2, 3)
    expect(worker.messages).toHaveLength(3)
    await request(worker, 3, 9)
    await advance(measureTime)
    await request(worker, 4, 10)
    await advance(measureTime)
    expect(worker.messages.filter(message => message.type === 'weighed').map(message => message.weight)).toEqual([12, 69, 76])
    expect(button('鉱石 11 を出荷する→').disabled).toBe(true)
    await done(worker, 10)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(read('.weight-python-result')).toContain('result = 10')
    expect(read('.weight-python-result')).toContain('正解。')
    expect(read('.weight-python-result')).toContain('3 回 · 30 pt · 6 Tick')
    expect(read('.weight-totals')).toContain('0 クレジット')
    const ship = button('鉱石 11 を出荷する→')
    await act(async () => { ship.click(); ship.click() })
    expect(read('.weight-totals')).toContain('100 クレジット')
    expect(read('.weight-totals')).toContain('30 pt')
  })

  it('rejects an invalid index and shows a syntax error and an unverified correct result', async () => {
    const invalid = await start()
    await request(invalid, 1, 16)
    expect(invalid.messages.at(-1)).toMatchObject({ type: 'weighError', requestId: 1, message: expect.stringContaining('0〜15') })
    await act(async () => { invalid.emit({ type: 'failed', runId: invalid.runId, message: 'SyntaxError: invalid syntax' }) })
    expect(read('[role="alert"]')).toContain('SyntaxError')
    expect(runButton().disabled).toBe(false)
    expect(read('.weight-totals')).toContain('累計消費電力0 pt')
    const guess = await start()
    await done(guess, 10)
    expect(read('.weight-python-result')).toContain('計量による確認が不足')
    expect(button('出荷する→').disabled).toBe(true)
    const noMatch = await start()
    await done(noMatch, 16)
    expect(read('.weight-python-result')).toContain('該当する鉱石なし')
    expect(read('.weight-python-result')).toContain('不正解')
  })

  it('cancels pending work, rejects messages from old runs and compares reruns on the same order', async () => {
    const first = await start()
    await request(first, 1, 0)
    await advance(measureTime)
    await request(first, 2, 9)
    const stale = first.onmessage!
    await click(button('停止'))
    expect(first.terminate).toHaveBeenCalledOnce()
    expect(read('.weight-python-status')).toContain('停止')
    await advance(measureTime)
    expect(read('.weight-totals')).toContain('累計消費電力10 pt')
    expect(ore(9).getAttribute('aria-label')).toContain('未計量')

    const second = await start()
    expect(second.runId).toBeGreaterThan(first.runId)
    expect(second.messages[0]).toMatchObject({ n: 16, target: 70 })
    expect(ore(0).getAttribute('aria-label')).toContain('未計量')
    expect(read('.weight-order')).toContain('ORD-001')
    await act(async () => {
      stale(new MessageEvent('message', { data: { type: 'weigh', runId: first.runId, requestId: 3, index: 10 } }))
      second.emit({ type: 'weigh', runId: first.runId, requestId: 4, index: 10 })
    })
    await advance(measureTime)
    expect(ore(10).getAttribute('aria-label')).toContain('未計量')
    await request(second, 1, 0)
    await advance(measureTime)
    expect(second.messages.at(-1)).toMatchObject({ type: 'weighed', weight: 12 })
    await request(second, 2, 10)
    await click(button('手動'))
    expect(second.terminate).toHaveBeenCalledOnce()
    await advance(measureTime)
    expect(ore(10).getAttribute('aria-label')).toContain('未計量')
    await click(ore(9))
    await advance(measureTime)
    expect(ore(9).getAttribute('aria-label')).toContain('69 kg')
    expect(read('.weight-totals')).toContain('累計消費電力30 pt')
    expect(read('.weight-totals')).toContain('0 クレジット')
  })

  it('terminates both a stalled load and an execution that stops progressing', async () => {
    const loading = await start(false)
    await advance(pythonLimits.loadingMs)
    expect(read('[role="alert"]')).toContain('読み込みがタイムアウト')
    expect(loading.terminate).toHaveBeenCalledOnce()
    const active = await start()
    await advance(pythonLimits.idleMs)
    expect(read('[role="alert"]')).toContain('実行がタイムアウト')
    expect(active.terminate).toHaveBeenCalledOnce()
    expect(runButton().disabled).toBe(false)
    expect(read('.weight-totals')).toContain('累計消費電力0 pt')
  })

  it('enforces the per-run measurement limit and cleans up on unmount', async () => {
    const worker = await start()
    await act(async () => {
      for (let id = 1; id <= pythonLimits.measurements; id++) {
        worker.emit({ type: 'weigh', runId: worker.runId, requestId: id, index: 0 })
        vi.advanceTimersByTime(measureTime)
      }
    })
    await request(worker, pythonLimits.measurements + 1, 0)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighError', message: expect.stringContaining('100 回') })
    expect(read('.weight-metrics')).toBe('計量回数100 回今回の消費電力1000 pt今回の処理時間200 Tick')
    await unmount()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
