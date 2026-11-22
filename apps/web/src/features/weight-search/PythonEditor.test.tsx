// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PythonCommand, PythonEvent } from './pythonProtocol'
import { retractMs, shipmentMs } from './robotMotion'
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
  await act(async () => { root?.render(<StrictMode><WeightSearchPrototype initialSample={0.5} random={() => 0.5} /></StrictMode>) })
})

afterEach(async () => {
  await unmount()
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const button = (label: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === label)!
const runButton = () => button('実行')
const ore = (index: number) => container.querySelector<HTMLButtonElement>(`.weight-slots button[data-index="${index}"]`)!
const read = (selector: string) => container.querySelector(selector)?.textContent
const gantry = () => container.querySelector<SVGSVGElement>('.weight-gantry')!
const click = (node: HTMLButtonElement) => act(async () => { node.click() })
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })
const measureTime = 2 * weightSearchTickMs + retractMs
async function selectOption(selector: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(selector)!
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const selectSpeed = (value: string) => selectOption('.weight-speed select', value)

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
  it('preserves edited code across mode changes and sends it to the Worker', async () => {
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!
    const code = 'result = await weigh(0)'
    await act(async () => { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }) })
    await click(button('手動'))
    await click(button('Python'))
    expect(EditorView.findFromDOM(container.querySelector('.cm-editor')!)?.state.doc.toString()).toBe(code)
    const worker = await start(false)
    expect(worker.messages[0]).toMatchObject({ type: 'run', code })
    expect(container.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false')
    await click(button('停止'))
    expect(container.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('true')
  })
  it.each([1, 4, 16, 'instant'] as const)('returns the same result and cost at %s speed', async speed => {
    expect(container.querySelector<HTMLSelectElement>('.weight-speed select')?.value).toBe('1')
    await selectSpeed(String(speed))
    const worker = await start()
    for (const [requestId, index, weight] of [[1, 9, 69], [2, 10, 76]]) {
      await request(worker, requestId, index)
      if (speed === 'instant') {
        expect(gantry().dataset.phase).toBe('idle')
        expect(gantry().dataset.targetIndex).toBeUndefined()
      } else {
        expect(worker.messages.at(-1)).not.toMatchObject({ type: 'weighed', requestId })
        await advance(Math.ceil(measureTime / speed))
      }
      expect(worker.messages.at(-1)).toMatchObject({ type: 'weighed', requestId, weight })
    }
    await done(worker, 10)
    expect(read('.weight-python-result')).toContain('正解。')
    expect(read('.weight-python-result')).toContain('2 回 · 20 pt · 4 Tick')
    expect(read('.weight-range')).toBe('index 10（1位置）')
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(2)
  })

  it('changes speed only for the next request and ignores old messages after stopping', async () => {
    const worker = await start()
    const oldHandler = worker.onmessage!
    await request(worker, 1, 9)
    await selectSpeed('instant')
    await advance(measureTime - 1)
    expect(worker.messages).toHaveLength(1)
    await advance(1)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighed', requestId: 1, weight: 69 })
    await request(worker, 2, 10)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighed', requestId: 2, weight: 76 })
    await click(button('停止'))
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(2)
    const next = await start()
    await act(async () => {
      oldHandler(new MessageEvent('message', { data: { type: 'weigh', runId: worker.runId, requestId: 3, index: 0 } }))
      oldHandler(new MessageEvent('message', { data: { type: 'finished', runId: worker.runId, index: 10 } }))
    })
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(0)
    expect(read('.weight-python-result')).toBeUndefined()
    expect(next.messages).toHaveLength(1)
  })

  it('keeps instant results isolated across shipment, next order and resize', async () => {
    await selectSpeed('instant')
    const worker = await start()
    const oldHandler = worker.onmessage!
    await request(worker, 1, 9)
    await request(worker, 2, 10)
    await done(worker, 10)
    await click(button('鉱石 10 を出荷する→'))
    await advance(shipmentMs)
    expect(read('.weight-totals')).toContain('100 クレジット')
    await click(button('次の注文を受ける →'))
    const next = await start()
    const nextHandler = next.onmessage!
    await request(next, 1, 0)
    await selectOption('select[aria-label="鉱石数"]', '64')
    expect(next.terminate).toHaveBeenCalledOnce()
    await act(async () => {
      for (const [handler, runId] of [[oldHandler, worker.runId], [nextHandler, next.runId]] as const) {
        handler(new MessageEvent('message', { data: { type: 'weigh', runId, requestId: 99, index: 0 } }))
      }
    })
    await advance(32)
    expect(read('.weight-range')).toBe('index 0〜64（65位置）')
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(0)
    expect(read('.weight-totals')).toContain('累計消費電力30 pt')
  })

  it('stops the current run and passes the new warehouse size to the next worker', async () => {
    const worker = await start()
    await request(worker, 1, 0)
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="鉱石数"]')!
    await act(async () => { select.value = '1024'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(read('.weight-range')).toBe('index 0〜1024（1025位置）')
    expect(container.querySelectorAll('.weight-shelf')).toHaveLength(0)
    const next = await start()
    expect(next.messages[0]).toMatchObject({ type: 'run', n: 1024 })
    await request(next, 1, 1023)
    await advance(measureTime)
    expect(next.messages.at(-1)).toMatchObject({ type: 'weighed', requestId: 1 })
    await request(next, 2, 1024)
    expect(next.messages.at(-1)).toMatchObject({ type: 'weighError' })
  })
  it.each([[16, 1, 16], [64, 2, 32], [256, 4, 64], [1024, 4, 256]])(
    'shows the correct floor layout for %i ore positions', async (size, floors, slotsPerFloor) => {
      if (size !== 16) await selectOption('select[aria-label="鉱石数"]', String(size))
      expect(gantry().dataset.floorCount).toBe(String(floors))
      expect(read('.weight-unit-cost')).toBe(`${floors}階層 × ${slotsPerFloor}棚`)
      expect(container.querySelectorAll('.weight-slots button')).toHaveLength(9)
      expect(gantry().querySelectorAll('use').length).toBeLessThanOrEqual(32)
    },
  )

  it('crosses a floor boundary, updates the map on commit and preserves the instant final position', async () => {
    await selectOption('select[aria-label="鉱石数"]', '1024')
    const worker = await start()
    await request(worker, 1, 255)
    await advance(measureTime)
    expect(gantry().dataset.robotFloor).toBe('1')
    await request(worker, 2, 256)
    expect(gantry().querySelector('[data-floor="2"]')?.getAttribute('data-active')).toBe('true')
    expect(read('.weight-sort')).toContain('2F · 棚 0（index 256）')
    expect(ore(256).textContent).toContain('未計量')
    expect(read('.weight-map-legend')).toContain('計量中 index 256')
    await advance(450)
    expect(gantry().dataset.robotFloor).toBe('2')
    await advance(measureTime - 450)
    expect(ore(256).textContent).toContain('kg')
    expect(read('.weight-map-legend')).toContain('直近 index 256')
    await selectSpeed('instant')
    await request(worker, 3, 768)
    await advance(32)
    expect(gantry().dataset.robotFloor).toBe('4')
    expect(read('.weight-sort')).toContain('4F · 棚 0（index 768）')
    expect(gantry().dataset.phase).toBe('idle')
    expect(read('.weight-map-legend')).toContain('直近 index 768')
    const candidate = container.querySelector<HTMLElement>('.weight-map-candidate')!
    expect(candidate.style.width).not.toBe('100%')
  })

  it('marks floors and every overlapping group from measured bounds, including boundary and sentinel', async () => {
    await selectOption('select[aria-label="鉱石数"]', '1024')
    await selectSpeed('instant')
    const worker = await start()
    await request(worker, 1, 255)
    await request(worker, 2, 512)
    await advance(32)
    const floor = (number: number) => gantry().querySelector(`[data-floor="${number}"]`)!
    expect(floor(1).getAttribute('data-candidate')).toBe('false')
    expect(floor(1).textContent).toContain('除外済')
    expect(floor(2).getAttribute('data-candidate')).toBe('true')
    expect(floor(3).getAttribute('data-candidate')).toBe('true')
    expect(floor(4).getAttribute('data-candidate')).toBe('false')
    const group = floor(3).querySelector('[data-start="512"]')!
    expect(group.getAttribute('data-end')).toBe('543')
    expect(group.getAttribute('data-candidate')).toBe('true')
    expect(group.getAttribute('data-partial')).toBe('true')
    expect(floor(3).querySelector('[data-start="544"]')?.getAttribute('data-candidate')).toBe('false')
    expect(ore(512).textContent).toContain('kg')
    expect(ore(511).textContent).toContain('未計量')
    await selectSpeed('1')
    await request(worker, 3, 1023)
    expect(floor(4).getAttribute('data-candidate')).toBe('false')
    expect(floor(4).getAttribute('data-measuring')).toBe('true')
    expect(floor(4).textContent).toContain('計量中 index 1023')
    const indices = Array.from(container.querySelectorAll('.weight-nearby button'), node => node.getAttribute('data-index'))
    expect(indices[0]).toBe('1015')
    expect(indices.at(-1)).toBe('1023')
    expect(ore(1023).textContent).toContain('未計量')
    await click(button('停止'))
    expect(floor(4).getAttribute('data-measuring')).toBe('false')
  })
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
    expect(read('.weight-stations div:first-child')).toContain('鉱石 0 を計量中')
    expect(gantry().dataset.targetIndex).toBe('0')
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    await request(worker, 1, 0)
    await request(worker, 2, 3)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighError', requestId: 2, message: expect.stringContaining('動作中') })
    await advance(weightSearchTickMs)
    expect(worker.messages).toHaveLength(2)
    await advance(weightSearchTickMs)
    expect(read('.weight-stations div:first-child')).toContain('12 kg')
    expect(read('.weight-metrics')).toContain('10 pt')
    expect(read('.weight-range')).toBe('index 1〜16（16位置）')
    expect(worker.messages).toHaveLength(2)
    await advance(retractMs - 1)
    expect(worker.messages).toHaveLength(2)
    await advance(1)
    expect(worker.messages.at(-1)).toEqual({ type: 'weighed', runId: 1, requestId: 1, weight: 12 })
    await request(worker, 2, 3)
    expect(worker.messages).toHaveLength(3)
    await request(worker, 3, 9)
    await advance(measureTime)
    await request(worker, 4, 10)
    await advance(measureTime)
    expect(worker.messages.filter(message => message.type === 'weighed').map(message => message.weight)).toEqual([12, 69, 76])
    expect(button('鉱石 10 を出荷する→').disabled).toBe(true)
    await done(worker, 10)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(read('.weight-python-result')).toContain('result = 10')
    expect(read('.weight-python-result')).toContain('正解。')
    expect(read('.weight-python-result')).toContain('3 回 · 30 pt · 6 Tick')
    expect(read('.weight-totals')).toContain('0 クレジット')
    const ship = button('鉱石 10 を出荷する→')
    await act(async () => { ship.click(); ship.click() })
    await advance(shipmentMs)
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
    expect(gantry().querySelector('[data-index="9"] .weight-shelf-mass')).toBeNull()
    expect(read('.weight-range')).toBe('index 1〜16（16位置）')
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(1)

    const second = await start()
    expect(second.runId).toBeGreaterThan(first.runId)
    expect(second.messages[0]).toMatchObject({ n: 16, target: 70 })
    expect(ore(0).getAttribute('aria-label')).toContain('未計量')
    expect(read('.weight-order')).toContain('ORD-001')
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(0)
    await act(async () => {
      stale(new MessageEvent('message', { data: { type: 'weigh', runId: first.runId, requestId: 3, index: 10 } }))
      second.emit({ type: 'weigh', runId: first.runId, requestId: 4, index: 10 })
    })
    await advance(measureTime)
    expect(gantry().querySelector('[data-index="10"] .weight-shelf-mass')).toBeNull()
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    await request(second, 1, 0)
    await advance(measureTime)
    expect(second.messages.at(-1)).toMatchObject({ type: 'weighed', weight: 12 })
    await request(second, 2, 10)
    await click(button('手動'))
    expect(second.terminate).toHaveBeenCalledOnce()
    await advance(measureTime)
    expect(gantry().querySelector('[data-index="10"] .weight-shelf-mass')).toBeNull()
    const input = container.querySelector<HTMLInputElement>('.weight-manual-index input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '9')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('計量'))
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

    const afterMeasurement = await start()
    await request(afterMeasurement, 1, 9)
    await advance(measureTime + pythonLimits.idleMs)
    expect(afterMeasurement.terminate).toHaveBeenCalledOnce()
    expect(read('.weight-range')).toBe('index 10〜16（7位置）')
    expect(read('.weight-log li')).toContain('10位置を除外')
    expect(read('.weight-totals')).toContain('累計消費電力10 pt')
  })

  it('parks a stopped robot during retraction without undoing a committed measurement or replying', async () => {
    const worker = await start()
    await request(worker, 1, 15)
    await advance(2 * weightSearchTickMs)
    expect(gantry().dataset.phase).toBe('raise')
    await click(button('停止'))
    expect(gantry().dataset.phase).toBe('idle')
    expect(gantry().dataset.parkedIndex).toBe('15')
    expect(gantry().querySelector('.weight-claw')?.getAttribute('transform')).toBe('translate(0 0)')
    await advance(retractMs)
    expect(worker.messages).toHaveLength(1)
    expect(read('.weight-totals')).toContain('累計消費電力10 pt')
    expect(ore(15).getAttribute('aria-label')).toContain('128 kg')
    expect(read('.weight-range')).toBe('index 0〜15（16位置）')
    expect(read('.weight-range-change')).toContain('「該当なし」 を除外')
    const next = await start()
    expect(gantry().querySelector('[data-index="15"] .weight-shelf-mass')).toBeNull()
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    await request(next, 1, 7)
    expect(gantry().dataset.targetIndex).toBe('7')
    expect(gantry().dataset.parkedIndex).toBe('15')
  })

  it('enforces the per-run measurement limit and cleans up on unmount', async () => {
    await selectOption('select[aria-label="鉱石数"]', '1024')
    await selectSpeed('instant')
    const worker = await start()
    await act(async () => {
      for (let id = 1; id <= pythonLimits.measurements; id++) {
        worker.emit({ type: 'weigh', runId: worker.runId, requestId: id, index: id - 1 })
      }
    })
    expect(worker.messages.filter(message => message.type === 'weighed')).toHaveLength(1024)
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(0)
    await request(worker, pythonLimits.measurements + 1, 0)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'weighError', message: expect.stringContaining('1024 回') })
    await advance(32)
    expect(container.querySelectorAll('.weight-log li')).toHaveLength(1024)
    expect(Array.from(container.querySelectorAll('.weight-metrics dd:not(.weight-metric-delta)'), value => value.textContent))
      .toEqual(['1024 回', '10240 pt', '2048 Tick'])
    await unmount()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  }, 30000)
})
