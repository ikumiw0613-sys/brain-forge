// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { EditorView } from '@codemirror/view'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FactoryApp } from '../factory/FactoryApp'
import type { PythonCommand, PythonEvent, PythonPrepareCommand } from '../../factory/python/pythonProtocol'
import { createPythonSupply, defaultSupplySeed } from './pythonSupply'
import { initialPythonCode } from '../../factory/warehouse/initialPythonCode'

let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('scrollTo', vi.fn())
  vi.useFakeTimers()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/prototypes/manufacturing/')
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(() => { container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

const navigate = (selector: string) => act(async () => {
  const link = container.querySelector(selector)!
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  expect(link.dispatchEvent(event)).toBe(false)
})

const toWarehouse = () => navigate('.manufacturing-controls a')
const toFactory = () => navigate('.factory-warehouse a[href="/prototypes/manufacturing/"]')

it.each([[1, 500], [2, 250]])('updates map revenue at %i× and retains it across pause and navigation', async (rate, tickMs) => {
  const { root, click } = await openPython()
  const dashboard = () => Array.from(container.querySelectorAll('.manufacturing-dashboard dd'), value => value.textContent)
  await toFactory()
  expect(dashboard()).toEqual(['0 Cr', '0.00 個/100 Tick', '0.0 %', '0.0 %'])
  expect(container.querySelector('#manufacturing-code-panel')).toBeNull()
  expect(container.querySelector('select')?.getAttribute('aria-label')).toBe('再生速度')
  const setSpeed = (rate: number) => act(async () => {
    const speed = container.querySelector<HTMLSelectElement>('select[aria-label="再生速度"]')!
    speed.value = String(rate)
    speed.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await setSpeed(rate)
  await advance(12_000)
  expect(metric('製造完了数')).toBe('0 個')
  expect(metric('累計製造時間')).toBe('0 Tick')
  await toWarehouse()
  const worker = TestWorker.instances[0]
  expect(container.querySelector('#manufacturing-warehouse + span')?.textContent).toBe('ORD-001')
  const intervals = vi.spyOn(window, 'setInterval')
  const productionIntervals = () => intervals.mock.calls.filter(([, delay]) => delay === tickMs).length
  const count = await runSearch(worker, true, () => navigate('.factory-warehouse a[href="/map/"]'))
  expect(container.querySelector('.map-cargo')?.getAttribute('data-delivery')).toBe('ORD-001')
  expect(productionIntervals()).toBe(1)
  await navigate('[data-facility="warehouse"] a')
  const waiting = count * 2
  const weights = createPythonSupply(16, defaultSupplySeed).search.weights
  const index = weights.findIndex(weight => weight >= worker.run.target)
  const shipment = `ORD-001 · 棚 ${index} · ${weights[index]} kg`
  expect(container.textContent).toContain(`直近の発送：${shipment}`)
  await toFactory()
  expect(container.textContent).toContain(`直近の受取：${shipment}`)
  expect(productionIntervals()).toBe(1)
  await navigate('.manufacturing-map-link')
  expect(location.pathname).toBe('/map/')
  expect(container.querySelector('.manufacturing-stats')).toBeNull()
  expect(container.querySelector('.map-cargo')).toBeNull()
  expect(productionIntervals()).toBe(1)
  intervals.mockRestore()
  const mapMetrics = () => Array.from(container.querySelectorAll('.map-revenue dd'), value => value.textContent)
  expect(mapMetrics()).toEqual(['0 Cr/100 Tick', '0 Cr', `経過${waiting} Tick`])
  await advance(tickMs)
  expect(container.querySelector('[data-activity="producing"]')).not.toBeNull()
  expect(container.querySelector('.map-progress')?.getAttribute('data-progress')).toBe('1')
  expect(mapMetrics()).toEqual(['0 Cr/100 Tick', '0 Cr', `経過${waiting + 1} Tick`])
  await advance(tickMs * 19)
  expect(container.querySelector('[data-activity="producing"]')).toBeNull()
  const revenueRate = (10_000 / (waiting + 20)).toLocaleString('ja-JP', { maximumFractionDigits: 2 })
  const mapBeforePause = [`${revenueRate} Cr/100 Tick`, '100 Cr', `経過${waiting + 20} Tick`]
  expect(mapMetrics()).toEqual(mapBeforePause)
  await navigate('[data-facility="factory"] a')
  expect(location.pathname).toBe('/prototypes/manufacturing/')
  expect(metric('製造完了数')).toBe('1 個')
  expect(metric('累計部品待ち')).toBe(`${waiting} Tick`)
  expect(metric('累計製造時間')).toBe('20 Tick')
  expect(metric('売上')).toBe('100 クレジット')
  const displayed = dashboard()
  expect(displayed[0]).toBe('100 Cr')
  await click('一時停止')
  await setSpeed(2)
  await navigate('.manufacturing-map-link')
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(mapMetrics()).toEqual(mapBeforePause)
  await navigate('[data-facility="factory"] a')
  expect(metric('経過時間')).toBe(`${waiting + 20} Tick`)
  expect(dashboard()).toEqual(displayed)
  await click('再開')
  await act(async () => { vi.advanceTimersByTime(250) })
  expect(TestWorker.instances).toHaveLength(2)
  await click('リセット')
  expect(metric('経過時間')).toBe('0 Tick')
  expect(dashboard()).toEqual(['0 Cr', '0.00 個/100 Tick', '0.0 %', '0.0 %'])
  await navigate('.manufacturing-map-link')
  expect(mapMetrics()).toEqual(['0 Cr/100 Tick', '0 Cr', '経過0 Tick'])
  await act(async () => { root.unmount() })
  expect(vi.getTimerCount()).toBe(0)
})

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<PythonEvent>) => void) | null = null
  commands: (PythonCommand | PythonPrepareCommand)[] = []
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  postMessage(command: PythonCommand | PythonPrepareCommand) { this.commands.push(command) }
  get run() { return this.commands.find(command => command.type === 'run')! }
  emit(event: PythonEvent) { return act(async () => this.onmessage?.(new MessageEvent('message', { data: event }))) }
}

async function openPython() {
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
  window.history.replaceState(null, '', '/prototypes/manufacturing/')
  const root = createRoot(container)
  await act(async () => root.render(<StrictMode><FactoryApp /></StrictMode>))
  const select = (label: string, value: string) => act(async () => {
    const input = Array.from(container.querySelectorAll('select')).find(input => input.closest('label')?.textContent?.startsWith(label))!
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const click = (label: string) => act(async () => Array.from(container.querySelectorAll('button')).find(item => item.textContent === label)!.click())
  await toWarehouse()
  await select('計量速度', 'instant')
  await toFactory()
  await click('開始')
  await toWarehouse()
  return { root, click }
}

const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms))
function metric(label: string) {
  return Array.from(container.querySelectorAll('dt')).find(item => item.textContent === label)?.nextElementSibling?.textContent
}

it('starts from the map and holds late measurements, delivery and production across pause and navigation', async () => {
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
  window.history.replaceState(null, '', '/map/')
  const root = createRoot(container)
  const control = () => container.querySelector<HTMLButtonElement>('.map-run-control')!
  const toggle = () => act(async () => control().click())
  const tick = () => container.querySelector('.map-header-status > span')?.textContent
  const progress = () => container.querySelector('.map-progress')?.getAttribute('data-progress')
  try {
    await act(async () => root.render(<StrictMode><FactoryApp /></StrictMode>))
    expect(control().textContent).toBe('起動')
    expect(tick()).toBe('0 Tick')
    expect(TestWorker.instances).toHaveLength(0)
    await navigate('[data-facility="warehouse"] a')
    await act(async () => {
      const speed = Array.from(container.querySelectorAll('select')).find(select => select.closest('label')?.textContent?.startsWith('計量速度'))!
      speed.value = 'instant'
      speed.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await navigate('.factory-warehouse a[href="/map/"]')
    await toggle()
    expect(control().textContent).toBe('一時停止')
    const worker = TestWorker.instances[0]
    const { runId } = worker.run
    await toggle()
    expect(control().textContent).toBe('再開')
    await worker.emit({ type: 'ready', runId })
    const request = { type: 'weigh', runId, requestId: 1, index: 0 } as const
    await worker.emit(request)
    await worker.emit(request)
    await advance(20_000)
    expect(tick()).toBe('0 Tick')
    expect(container.querySelector('[data-weighing]')).toBeNull()
    expect(worker.commands).toHaveLength(1)
    expect(worker.terminate).not.toHaveBeenCalled()

    const editor = EditorView.findFromDOM(container.querySelector('#workspace-python .cm-editor')!)!
    const draft = `# 休止中に編集\n${initialPythonCode}`
    await act(async () => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: draft } }))
    await act(async () => container.querySelector<HTMLButtonElement>('.map-editor-apply')!.click())
    expect(container.querySelector('.map-editor-queued')?.textContent).toBe('予約中')
    expect(worker.run.code).toBe(initialPythonCode)

    await toggle()
    await advance(1)
    expect(tick()).toBe('1 Tick')
    await toggle()
    await advance(20_000)
    expect(tick()).toBe('1 Tick')
    expect(worker.commands).toHaveLength(1)
    await act(async () => { control().click(); control().click(); control().click() })
    await advance(1)
    expect(tick()).toBe('2 Tick')
    expect(worker.commands.filter(command => command.type === 'weighed')).toHaveLength(1)
    expect(TestWorker.instances).toHaveLength(1)

    const count = await runSearch(worker, true, toggle)
    expect(container.querySelector('.map-cargo')).toBeNull()
    const waiting = (count + 1) * 2
    expect(tick()).toBe(`${waiting} Tick`)
    await advance(5000)
    expect(progress()).toBe('0')
    await toggle()
    const cargo = container.querySelector('.map-cargo')
    expect(cargo?.getAttribute('data-delivery')).toBe('ORD-001')
    await advance(3500)
    expect(progress()).toBe('7')
    await toggle()
    expect(container.querySelector('.map-cargo')).toBe(cargo)
    expect(container.querySelector('.world-map')?.getAttribute('data-running')).toBe('false')
    await navigate('[data-facility="factory"] a')
    await advance(5000)
    expect(metric('経過時間')).toBe(`${waiting + 7} Tick`)
    expect(metric('売上')).toBe('0 クレジット')
    await navigate('.manufacturing-map-link')
    expect(control().textContent).toBe('再開')
    expect(progress()).toBe('7')
    await toggle()
    await advance(6500)
    expect(progress()).toBe('20')
    expect(container.querySelectorAll('.map-revenue dd')[1]?.textContent).toBe('100 Cr')
    await advance(500)
    expect(TestWorker.instances).toHaveLength(2)
    expect(TestWorker.instances[1].run.code).toBe(draft)
    expect(container.querySelectorAll('.map-revenue dd')[1]?.textContent).toBe('100 Cr')
  } finally {
    await act(async () => root.unmount())
  }
}, 20_000)

async function runSearch(worker: TestWorker, binary: boolean, beforeDelivery?: () => Promise<void>) {
  const { runId, n, target } = worker.run
  const requestOffset = worker.commands.filter(command => command.type === 'weighed').length
  let count = 0
  const weigh = async (index: number) => {
    const requestId = requestOffset + ++count
    const repliesBefore = worker.commands.length
    await worker.emit({ type: 'weigh', runId, requestId, index })
    const map = container.querySelector('.world-map')
    if (map) expect(map.querySelector('[data-weighing] .map-facility-activity')?.textContent).toBe(`棚 ${index} · 計量中`)
    else expect(metric('計量中の index')).toBe(String(index))
    await advance(1)
    expect(worker.commands).toHaveLength(repliesBefore)
    await advance(1)
    const response = worker.commands.at(-1)
    if (response?.type !== 'weighed' || response.requestId !== requestId) throw new Error('Missing measurement reply')
    return response.weight
  }
  await worker.emit({ type: 'ready', runId })
  let index = 0
  if (binary) {
    let right = n
    while (index < right) {
      const mid = Math.floor((index + right) / 2)
      if (await weigh(mid) < target) index = mid + 1
      else right = mid
    }
  } else {
    while (index < n && await weigh(index) < target) index++
  }
  await beforeDelivery?.()
  await worker.emit({ type: 'finished', runId, index })
  return count
}

it('processes the same consecutive orders with both strategies and preserves fixed costs in instant mode', async () => {
  async function produce(binary: boolean) {
    const { root } = await openPython()
    const targets = []
    let count = 0
    for (let order = 0; order < 2; order++) {
      const worker = TestWorker.instances[order]
      expect(worker.run.n).toBe(64)
      targets.push(worker.run.target)
      const measured = await runSearch(worker, binary)
      count += measured
      expect(metric('今回の部品待ち')).toBe(`${measured * 2} Tick`)
      expect(metric('累計電力消費')).toBe(`${count * 10} pt`)
      await toFactory()
      expect(metric('累計部品待ち')).toBe(`${count * 2} Tick`)
      await advance(9999)
      const progress = container.querySelector('progress')
      expect(progress?.max).toBe(20)
      expect(progress?.value).toBe(19)
      expect(metric('製造完了数')).toBe(`${order} 個`)
      await advance(1)
      expect(metric('製造完了数')).toBe(`${order + 1} 個`)
      expect(metric('累計製造時間')).toBe(`${(order + 1) * 20} Tick`)
      expect(metric('売上')).toBe(`${(order + 1) * 100} クレジット`)
      await advance(500)
      await toWarehouse()
    }
    expect(TestWorker.instances).toHaveLength(3)
    await act(async () => root.unmount())
    return { targets, count }
  }
  const linear = await produce(false)
  const binary = await produce(true)
  expect(binary.targets).toEqual(linear.targets)
  expect(binary.targets[0]).not.toBe(binary.targets[1])
  expect(binary.count).toBeLessThan(linear.count)
}, 20_000)

it('snapshots benchmark code and isolates trial failure and cancellation from the running factory', async () => {
  const { root, click } = await openPython()
  const factory = TestWorker.instances[0]
  await click('コードを編集')
  const factoryEditor = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!
  const queued = `${initialPythonCode}\n# factory queue`
  await act(async () => factoryEditor.dispatch({ changes: { from: 0, to: factoryEditor.state.doc.length, insert: queued } }))
  await click('適用')
  await navigate('a[href="/map/?view=benchmark"]')
  expect(container.querySelector('textarea')?.value).toBe(queued)
  await click('試験開始')
  const first = TestWorker.instances[1]
  expect(first.run).toMatchObject({ code: queued, n: 256 })
  const edit = 'raise RuntimeError("new draft")'
  await act(async () => {
    const textarea = container.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, edit)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.querySelector('.benchmark details pre')?.textContent).toBe(queued)
  await first.emit({ type: 'ready', runId: first.run.runId })
  let lower = 0
  let upper = first.run.n
  let requestId = 0
  while (lower < upper) {
    const index = (lower + upper) >>> 1
    await first.emit({ type: 'weigh', runId: first.run.runId, requestId: ++requestId, index })
    const reply = first.commands.at(-1)
    if (reply?.type !== 'weighed') throw new Error('Expected a benchmark measurement')
    if (reply.weight < first.run.target) lower = index + 1
    else upper = index
  }
  await first.emit({ type: 'finished', runId: first.run.runId, index: lower })
  expect(first.terminate).toHaveBeenCalledOnce()
  expect(metric('確定売上')).toBe('100 Cr')
  expect(metric('計測Tick')).toBe(`${requestId * 2 + 20} Tick`)
  const second = TestWorker.instances.find(worker => worker !== first && worker.run?.code === queued)!
  expect(second.run.code).toBe(queued)
  const stale = second.onmessage!
  await click('中断')
  expect(second.terminate).toHaveBeenCalledOnce()
  await click('試験開始')
  const retry = TestWorker.instances.find(worker => worker.run?.code === edit)!
  expect(retry.run.code).toBe(edit)
  await act(async () => stale(new MessageEvent('message', { data: { type: 'failed', runId: second.run.runId, message: 'stale' } })))
  expect(container.querySelector('.benchmark [role="alert"]')).toBeNull()
  await retry.emit({ type: 'failed', runId: retry.run.runId, message: 'new draft' })
  expect(retry.terminate).toHaveBeenCalledOnce()
  expect(container.querySelector('.benchmark [role="status"]')?.textContent).toBe('失敗')
  expect(metric('確定売上')).toBe('0 Cr')
  await navigate('.benchmark a[href="/map/"]')
  expect(container.querySelectorAll('.map-revenue dd')[1]?.textContent).toBe('0 Cr')
  await navigate('[data-facility="warehouse"] a')
  expect(container.textContent).toContain('適用待ち')
  expect(factory.run.code).toBe(initialPythonCode)
  expect(factory.terminate).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  expect(factory.terminate).toHaveBeenCalledOnce()
}, 20_000)

it('pauses a pending measurement, refuses an unsupported result and ignores messages after reset', async () => {
  const { root, click } = await openPython()
  const worker = TestWorker.instances[0]
  const { runId, target } = worker.run
  await worker.emit({ type: 'ready', runId })
  await worker.emit({ type: 'weigh', runId, requestId: 1, index: 0 })
  await worker.emit({ type: 'weigh', runId, requestId: 1, index: 0 })
  await advance(1)
  await toFactory()
  await click('一時停止')
  await advance(20_000)
  expect(metric('経過時間')).toBe('1 Tick')
  await click('再開')
  await advance(1)
  expect(metric('経過時間')).toBe('2 Tick')
  await toWarehouse()
  expect(metric('累計電力消費')).toBe('10 pt')
  expect(worker.commands.filter(command => command.type === 'weighed')).toHaveLength(1)
  const weights = createPythonSupply(16, defaultSupplySeed).search.weights
  const correct = weights.findIndex(weight => weight >= target)
  await worker.emit({ type: 'finished', runId, index: correct })
  expect(container.textContent).toContain('計量による確認が不足')
  expect(container.textContent).toContain('まだ発送していません')
  await toFactory()
  await advance(5000)
  expect(metric('製造完了数')).toBe('0 個')
  await click('再開')
  const retry = TestWorker.instances[1]
  expect(retry.run.target).toBe(target)
  await retry.emit({ type: 'ready', runId: retry.run.runId })
  await retry.emit({ type: 'finished', runId: retry.run.runId, index: 63 })
  await toWarehouse()
  expect(container.textContent).toContain('不正解')
  await toFactory()
  await click('再開')
  const resetting = TestWorker.instances[2]
  const stale = resetting.onmessage!
  await click('リセット')
  await act(async () => stale(new MessageEvent('message', { data: { type: 'weigh', runId: resetting.run.runId, requestId: 1, index: 0 } })))
  expect(resetting.terminate).toHaveBeenCalledOnce()
  expect(metric('経過時間')).toBe('0 Tick')
  await toWarehouse()
  expect(metric('累計電力消費')).toBe('0 pt')
  await act(async () => root.unmount())
})

it('keeps the editor and its draft across panel changes and applies only the queued snapshot to the next order', async () => {
  const { root, click } = await openPython()
  const getPanel = () => container.querySelector<HTMLElement>('#manufacturing-code-panel')!
  const panel = getPanel()
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent === label)!
  const first = TestWorker.instances[0]
  expect(first.run.code).toBe(initialPythonCode)
  expect(panel.hidden).toBe(true)
  await click('コードを編集')
  expect(button('コードを編集').getAttribute('aria-expanded')).toBe('true')
  expect(panel.style.width).toBe('40vw')
  const handle = panel.querySelector<HTMLElement>('[role="separator"]')!
  handle.setPointerCapture = vi.fn()
  const pointer = (type: string, clientX: number) => act(async () => {
    const event = new MouseEvent(type, { bubbles: true, clientX, button: 0 })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    handle.dispatchEvent(event)
  })
  await pointer('pointerdown', 600)
  await pointer('pointermove', 600 - window.innerWidth * .1)
  expect(panel.style.width).toBe('50vw')
  await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  expect(panel.style.width).toBe('48vw')

  const editor = EditorView.findFromDOM(panel.querySelector('.cm-editor')!)!
  const write = (doc: string) => act(async () => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: doc } }))
  const queued = `# 次回\n${initialPythonCode}`
  expect(editor.state.readOnly).toBe(false)
  await write(queued)
  expect(panel.textContent).toContain('未適用の編集あり')
  await click('適用')
  expect(panel.textContent).toContain('適用待ち')
  const draft = `# まだ適用しない\n${queued}`
  await write(draft)
  await click('閉じる')
  expect(panel.hidden).toBe(true)
  expect(document.activeElement).toBe(button('コードを編集'))
  await click('コードを編集')
  expect(editor.state.doc.toString()).toBe(draft)
  expect(panel.style.width).toBe('48vw')
  expect(TestWorker.instances).toHaveLength(1)
  expect(first.terminate).not.toHaveBeenCalled()
  const { runId } = first.run
  await first.emit({ type: 'ready', runId })
  await first.emit({ type: 'weigh', runId, requestId: 1, index: 0 })
  await advance(1)
  await navigate('.factory-warehouse a[href="/map/"]')
  expect(container.querySelector('[data-activity="weighing"]')).not.toBeNull()
  const orderDetails = () => container.querySelector('.map-process')?.textContent
  expect(orderDetails()).toContain('棚 0 · 計量中')
  expect(orderDetails()).toContain('今回の計量0 回')
  expect(orderDetails()).not.toContain('直近の計量結果')
  await advance(1)
  expect(container.querySelector('[data-activity="weighing"]')).toBeNull()
  expect(orderDetails()).not.toContain('計量中')
  expect(orderDetails()).toContain('今回の計量1 回')
  expect(orderDetails()).toContain('直近の計量結果棚 0')
  expect(first.commands.at(-1)).toMatchObject({ type: 'weighed', requestId: 1 })
  expect(first.terminate).not.toHaveBeenCalled()
  const mapPanel = container.querySelector<HTMLElement>('#workspace-python')!
  const mapEditor = EditorView.findFromDOM(mapPanel.querySelector('.cm-editor')!)!
  const mapApply = mapPanel.querySelector<HTMLButtonElement>('.workspace-titlebar .map-editor-apply')!
  const reservation = () => mapPanel.querySelector('.map-editor-queued')?.textContent
  expect(mapPanel.querySelector('h2')?.textContent).toBe('warehouse.py')
  expect(mapPanel.querySelector('.workspace-content')?.textContent).not.toMatch(/main\.py|Pythonエディタ|実行待機|n =|target =|計量の index/)
  expect(mapPanel.querySelector('.cm-content')?.hasAttribute('aria-describedby')).toBe(false)
  expect(mapEditor.state.doc.toString()).toBe(draft)
  expect(container.querySelector('.map-events')?.textContent).toContain('棚 0')
  await click('閉じる')
  expect(mapPanel.hidden).toBe(true)
  const launcher = container.querySelector<HTMLButtonElement>('[data-window-button="python"]')!
  expect(launcher.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(launcher)
  await act(async () => launcher.click())
  expect(mapPanel.hidden).toBe(false)
  expect(EditorView.findFromDOM(mapPanel.querySelector('.cm-editor')!)).toBe(mapEditor)
  expect(mapEditor.state.doc.toString()).toBe(draft)
  const maximize = () => mapPanel.querySelector<HTMLButtonElement>('[aria-label="warehouse.pyを最大化"]')!
  await act(async () => maximize().click())
  expect(mapPanel.dataset.maximized).toBe('true')
  await act(async () => mapPanel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(mapPanel.dataset.maximized).toBe('false')
  const mapQueued = `# マップから予約\n${queued}`
  const writeMapCode = (doc: string) => act(async () => mapEditor.dispatch({
    changes: { from: 0, to: mapEditor.state.doc.length, insert: doc },
  }))
  await writeMapCode(queued)
  expect(mapApply.disabled).toBe(true)
  expect(reservation()).toBe('予約中')
  await writeMapCode(initialPythonCode)
  expect(mapApply.disabled).toBe(false)
  await click('適用')
  expect(mapApply.disabled).toBe(true)
  expect(reservation()).toBe('')
  await writeMapCode(mapQueued)
  expect(mapApply.disabled).toBe(false)
  await click('適用')
  expect(mapApply.disabled).toBe(true)
  expect(reservation()).toBe('予約中')
  await writeMapCode(draft)
  expect(mapApply.disabled).toBe(false)
  expect(reservation()).toBe('予約中')
  expect(first.run.code).toBe(initialPythonCode)
  await navigate('[data-facility="factory"] a')
  expect(TestWorker.instances).toHaveLength(1)
  expect(metric('経過時間')).toBe('2 Tick')
  await toWarehouse()
  expect(metric('累計電力消費')).toBe('10 pt')
  expect(container.querySelector('#manufacturing-warehouse + span')?.textContent).toBe('ORD-001')
  await click('コードを編集')
  const returnedEditor = EditorView.findFromDOM(getPanel().querySelector('.cm-editor')!)!
  expect(returnedEditor.state.doc.toString()).toBe(draft)
  expect(getPanel().querySelector('.warehouse-code-file')?.textContent).toContain('main.py')
  expect(getPanel().querySelector('.warehouse-code-log')?.textContent).toContain('ORD-001')
  expect(getPanel().querySelector('.warehouse-code-log li')?.textContent).toContain('棚 0')
  expect(getPanel().querySelector('.warehouse-code-actions a')?.getAttribute('href')).toBe('/map/?view=benchmark')
  await runSearch(first, true)
  expect(getPanel().textContent).toContain('適用待ち')
  await toFactory()
  await advance(10_000)
  expect(metric('製造完了数')).toBe('1 個')
  expect(TestWorker.instances).toHaveLength(1)
  await advance(500)
  expect(TestWorker.instances[1].run.code).toBe(mapQueued)
  await navigate('.manufacturing-map-link')
  expect(orderDetails()).toContain('ORD-002')
  expect(orderDetails()).toContain('今回の計量0 回')
  expect(orderDetails()).not.toContain('直近の計量結果')
  expect(container.querySelector('.map-editor-queued')?.textContent).toBe('')
  const second = TestWorker.instances[1]
  await second.emit({ type: 'failed', runId: second.run.runId, message: 'NameError: weigh' })
  expect(container.querySelector('.map-events')?.textContent).toContain('Python実行エラーNameError: weigh')
  await navigate('[data-facility="warehouse"] a')
  await click('コードを編集')
  expect(getPanel().querySelector('.warehouse-code-states')?.textContent).toContain('未適用の編集あり')
  expect(getPanel().querySelector('.warehouse-code-states')?.textContent).toContain('予約なし')
  expect(getPanel().querySelector('.warehouse-code-inspect pre')?.textContent).toBe(mapQueued)
  expect(EditorView.findFromDOM(getPanel().querySelector('.cm-editor')!)?.state.doc.toString()).toBe(draft)
  await act(async () => root.unmount())
}, 20_000)
