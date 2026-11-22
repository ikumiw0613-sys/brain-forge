// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { EditorView } from '@codemirror/view'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ManufacturingPrototype } from './ManufacturingPrototype'
import type { PythonCommand, PythonEvent } from '../weight-search/pythonProtocol'
import { createPythonSupply, defaultSupplySeed } from './pythonSupply'
import { initialPythonCode } from '../weight-search/PythonEditor'

let container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); container = document.createElement('div'); document.body.append(container) })
afterEach(() => { container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('starts, pauses, resumes and resets the automatic line', async () => {
  const root = createRoot(container)
  await act(async () => { root.render(<StrictMode><ManufacturingPrototype /></StrictMode>) })
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent === label)!
  const stats = () => container.querySelector('.manufacturing-stats')!.textContent
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="部品供給時間"]')!
  await act(async () => { select.value = '4'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => { button('開始').click(); vi.advanceTimersByTime(1000) })
  // The timer is established after React commits the running state.
  await act(async () => { vi.advanceTimersByTime(12_000) })
  expect(stats()).toContain('製造完了数1 個')
  expect(stats()).toContain('累計部品待ち4 Tick')
  expect(stats()).toContain('累計製造時間20 Tick')
  expect(stats()).toContain('機械稼働率83.3 %')
  expect(stats()).toContain('売上100 クレジット')
  await act(async () => { button('一時停止').click() })
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(stats()).toContain('経過時間24 Tick')
  await act(async () => { button('再開').click() })
  await act(async () => { vi.advanceTimersByTime(500) })
  expect(stats()).toContain('経過時間25 Tick')
  await act(async () => { button('リセット').click() })
  expect(stats()).toContain('経過時間0 Tick')
  expect(select.value).toBe('4')
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
  const root = createRoot(container)
  await act(async () => root.render(<StrictMode><ManufacturingPrototype /></StrictMode>))
  const select = (label: string, value: string) => act(async () => {
    const input = Array.from(container.querySelectorAll('select')).find(input => input.closest('label')?.textContent?.startsWith(label))!
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const click = (label: string) => act(async () => Array.from(container.querySelectorAll('button')).find(item => item.textContent === label)!.click())
  await select('供給モード', 'python')
  await select('計量速度', 'instant')
  await click('開始')
  return { root, click }
}

const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms))
function metric(label: string) {
  return Array.from(container.querySelectorAll('dt')).find(item => item.textContent === label)?.nextElementSibling?.textContent
}

async function runSearch(worker: TestWorker, binary: boolean) {
  const { runId, n, target } = worker.run
  let count = 0
  const weigh = async (index: number) => {
    const requestId = ++count
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
      expect(metric('累計部品待ち')).toBe(`${count * 2} Tick`)
      expect(metric('累計電力消費')).toBe(`${count * 10} pt`)
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
  await click('一時停止')
  await advance(20_000)
  expect(metric('経過時間')).toBe('1 Tick')
  expect(metric('累計電力消費')).toBe('0 pt')
  await click('再開')
  await advance(1)
  expect(metric('経過時間')).toBe('2 Tick')
  expect(metric('累計電力消費')).toBe('10 pt')
  expect(worker.commands.filter(command => command.type === 'weighed')).toHaveLength(1)
  const weights = createPythonSupply(16, defaultSupplySeed).search.weights
  const correct = weights.findIndex(weight => weight >= target)
  await worker.emit({ type: 'finished', runId, index: correct })
  expect(container.textContent).toContain('計量による確認が不足')
  await advance(5000)
  expect(metric('製造完了数')).toBe('0 個')
  await click('再開')
  const retry = TestWorker.instances[1]
  expect(retry.run.target).toBe(target)
  await retry.emit({ type: 'ready', runId: retry.run.runId })
  await retry.emit({ type: 'finished', runId: retry.run.runId, index: 63 })
  expect(container.textContent).toContain('不正解')
  await click('再開')
  const resetting = TestWorker.instances[2]
  const stale = resetting.onmessage!
  await click('リセット')
  await act(async () => stale(new MessageEvent('message', { data: { type: 'weigh', runId: resetting.run.runId, requestId: 1, index: 0 } })))
  expect(resetting.terminate).toHaveBeenCalledOnce()
  expect(metric('経過時間')).toBe('0 Tick')
  expect(metric('累計電力消費')).toBe('0 pt')
  await act(async () => root.unmount())
})

it('keeps the editor and its draft across panel changes and applies only the queued snapshot to the next order', async () => {
  const { root, click } = await openPython()
  const panel = container.querySelector<HTMLElement>('#manufacturing-code-panel')!
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
  await click('一時停止')
  await advance(500)
  await click('再開')
  expect(TestWorker.instances).toHaveLength(1)
  expect(first.terminate).not.toHaveBeenCalled()
  await runSearch(first, true)
  expect(panel.textContent).toContain('適用待ち')
  await advance(10_000)
  expect(metric('製造完了数')).toBe('1 個')
  expect(TestWorker.instances).toHaveLength(1)
  await advance(500)
  expect(TestWorker.instances[1].run.code).toBe(queued)
  expect(panel.textContent).toContain('適用済み / 未適用の編集あり')
  expect(editor.state.doc.toString()).toBe(draft)
  await act(async () => root.unmount())
}, 20_000)
