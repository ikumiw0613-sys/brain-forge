// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { EditorView } from '@codemirror/view'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FactoryApp } from '../factory/FactoryApp'
import type { PythonCommand, PythonEvent } from '../weight-search/pythonProtocol'
import { createPythonSupply, defaultSupplySeed } from './pythonSupply'
import { initialPythonCode } from '../weight-search/PythonEditor'

let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('scrollTo', vi.fn())
  vi.useFakeTimers()
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

it('needs a warehouse delivery, produces while the map is open, and retains pause, resume and reset', async () => {
  const { root, click } = await openPython()
  const dashboard = () => Array.from(container.querySelectorAll('.manufacturing-dashboard dd'), value => value.textContent)
  await toFactory()
  expect(dashboard()).toEqual(['0 Cr', '0.00 個/100 Tick', '0.0 %', '0.0 %'])
  expect(container.querySelector('#manufacturing-code-panel')).toBeNull()
  expect(container.querySelector('select')?.getAttribute('aria-label')).toBe('再生速度')
  await advance(12_000)
  expect(metric('製造完了数')).toBe('0 個')
  expect(metric('累計製造時間')).toBe('0 Tick')
  await toWarehouse()
  const worker = TestWorker.instances[0]
  expect(container.querySelector('#manufacturing-warehouse + span')?.textContent).toBe('ORD-001')
  const count = await runSearch(worker, true, () => navigate('.factory-warehouse a[href="/map/"]'))
  expect(container.querySelector('.map-cargo')?.getAttribute('data-delivery')).toBe('ORD-001')
  expect(vi.getTimerCount()).toBe(1)
  await navigate('[data-facility="warehouse"] a')
  const waiting = count * 2
  const weights = createPythonSupply(16, defaultSupplySeed).search.weights
  const index = weights.findIndex(weight => weight >= worker.run.target)
  const shipment = `ORD-001 · 棚 ${index} · ${weights[index]} kg`
  expect(container.textContent).toContain(`直近の発送：${shipment}`)
  await toFactory()
  expect(container.textContent).toContain(`直近の受取：${shipment}`)
  expect(vi.getTimerCount()).toBe(1)
  await navigate('.manufacturing-map-link')
  expect(location.pathname).toBe('/map/')
  expect(container.querySelector('.manufacturing-stats')).toBeNull()
  expect(container.querySelector('.map-cargo')).toBeNull()
  expect(vi.getTimerCount()).toBe(1)
  await advance(500)
  expect(container.querySelector('[data-activity="producing"]')).not.toBeNull()
  expect(container.querySelector('.map-progress')?.getAttribute('data-progress')).toBe('1')
  await advance(9500)
  expect(container.querySelector('[data-activity="producing"]')).toBeNull()
  await navigate('[data-facility="factory"] a')
  expect(location.pathname).toBe('/prototypes/manufacturing/')
  expect(metric('製造完了数')).toBe('1 個')
  expect(metric('累計部品待ち')).toBe(`${waiting} Tick`)
  expect(metric('累計製造時間')).toBe('20 Tick')
  expect(metric('売上')).toBe('100 クレジット')
  const displayed = dashboard()
  expect(displayed[0]).toBe('100 Cr')
  await click('一時停止')
  const speed = container.querySelector<HTMLSelectElement>('select[aria-label="再生速度"]')!
  await act(async () => { speed.value = '2'; speed.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(metric('経過時間')).toBe(`${waiting + 20} Tick`)
  expect(dashboard()).toEqual(displayed)
  await click('再開')
  await act(async () => { vi.advanceTimersByTime(250) })
  expect(TestWorker.instances).toHaveLength(2)
  await click('リセット')
  expect(metric('経過時間')).toBe('0 Tick')
  expect(dashboard()).toEqual(['0 Cr', '0.00 個/100 Tick', '0.0 %', '0.0 %'])
  await act(async () => { root.unmount() })
  expect(vi.getTimerCount()).toBe(0)
})

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<PythonEvent>) => void) | null = null
  commands: PythonCommand[] = []
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  postMessage(command: PythonCommand) { this.commands.push(command) }
  get run() { return this.commands[0] as Extract<PythonCommand, { type: 'run' }> }
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

async function runSearch(worker: TestWorker, binary: boolean, beforeDelivery?: () => Promise<void>) {
  const { runId, n, target } = worker.run
  const requestOffset = worker.commands.filter(command => command.type === 'weighed').length
  let count = 0
  const weigh = async (index: number) => {
    const requestId = requestOffset + ++count
    const repliesBefore = worker.commands.length
    await worker.emit({ type: 'weigh', runId, requestId, index })
    expect(metric('計量中の index')).toBe(String(index))
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
  await advance(1)
  expect(container.querySelector('[data-activity="weighing"]')).toBeNull()
  expect(first.commands.at(-1)).toMatchObject({ type: 'weighed', requestId: 1 })
  expect(first.terminate).not.toHaveBeenCalled()
  await navigate('[data-facility="factory"] a')
  expect(TestWorker.instances).toHaveLength(1)
  expect(metric('経過時間')).toBe('2 Tick')
  await toWarehouse()
  expect(metric('累計電力消費')).toBe('10 pt')
  expect(container.querySelector('#manufacturing-warehouse + span')?.textContent).toBe('ORD-001')
  await click('コードを編集')
  const returnedEditor = EditorView.findFromDOM(getPanel().querySelector('.cm-editor')!)!
  expect(returnedEditor.state.doc.toString()).toBe(draft)
  await runSearch(first, true)
  expect(getPanel().textContent).toContain('適用待ち')
  await toFactory()
  await advance(10_000)
  expect(metric('製造完了数')).toBe('1 個')
  expect(TestWorker.instances).toHaveLength(1)
  await advance(500)
  expect(TestWorker.instances[1].run.code).toBe(queued)
  await toWarehouse()
  await click('コードを編集')
  expect(getPanel().textContent).toContain('適用済み / 未適用の編集あり')
  expect(EditorView.findFromDOM(getPanel().querySelector('.cm-editor')!)?.state.doc.toString()).toBe(draft)
  await act(async () => root.unmount())
}, 20_000)
