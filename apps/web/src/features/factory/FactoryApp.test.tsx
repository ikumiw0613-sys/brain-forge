// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initialPythonCode } from '../../factory/warehouse/initialPythonCode'
import type { SortingCommand, SortingEvent } from '../sorting/sortingProtocol'
import { FactoryApp } from './FactoryApp'

class SortingWorker {
  static instances: SortingWorker[] = []
  onmessage: ((event: MessageEvent<SortingEvent>) => void) | null = null
  postMessage = vi.fn<(command: SortingCommand) => void>()
  terminate = vi.fn()
  constructor() { SortingWorker.instances.push(this) }
  emit(data: SortingEvent) { this.onmessage?.(new MessageEvent('message', { data })) }
}

let container: HTMLDivElement
let root: Root
const warehouseKey = 'brain-forge:python-draft:warehouse'
const sortingKey = 'brain-forge:python-draft:sorting'

beforeEach(() => {
  SortingWorker.instances = []
  vi.stubGlobal('Worker', SortingWorker)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.history.replaceState(null, '', '/map/')
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const click = (selector: string) => act(async () => {
  container.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
})
const editor = (id: string) => EditorView.findFromDOM(container.querySelector(`#workspace-${id} .cm-editor`)!)!
const edit = (view: EditorView, code: string) => act(async () => {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
})

async function remount() {
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<FactoryApp />))
}

it('coalesces edits, saves each facility separately and restores both drafts on restart', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  await act(async () => root.render(<FactoryApp />))
  await click('[data-facility="sorting"] a')
  expect(writes).not.toHaveBeenCalled()

  const sortingCode = 'def sort_parts(a):\n    return sorted(a)\n'
  await edit(editor('sorting'), sortingCode)
  await edit(editor('python'), '# first warehouse edit')
  await act(async () => vi.advanceTimersByTime(349))
  expect(writes).not.toHaveBeenCalled()

  const warehouseCode = '# last warehouse edit\nresult = 0'
  await edit(editor('python'), warehouseCode)
  await act(async () => vi.advanceTimersByTime(1))
  expect(writes).toHaveBeenCalledTimes(1)
  expect(window.localStorage.getItem(warehouseKey)).toBeNull()
  expect(JSON.parse(window.localStorage.getItem(sortingKey)!)).toEqual({
    version: 1, facilityId: 'sorting', code: sortingCode,
  })

  window.dispatchEvent(new Event('pagehide'))
  expect(JSON.parse(window.localStorage.getItem(warehouseKey)!)).toEqual({
    version: 1, facilityId: 'warehouse', code: warehouseCode,
  })
  await remount()
  await act(async () => vi.advanceTimersByTime(350))
  expect(writes).toHaveBeenCalledTimes(2)
  expect(editor('python').state.doc.toString()).toBe(warehouseCode)
  expect(editor('sorting').state.doc.toString()).toBe(sortingCode)
  expect(SortingWorker.instances).toHaveLength(0)
  await click('.sorting .manufacturing-primary')
  expect(SortingWorker.instances[0].postMessage.mock.calls[0][0].code).toBe(sortingCode)
})

it('restores the warehouse draft independently of the active and queued factory code', async () => {
  const postMessage = vi.fn()
  vi.stubGlobal('Worker', class {
    postMessage = postMessage
    terminate() {}
  })
  const code = '# saved warehouse draft\nresult = 0'
  window.localStorage.setItem(warehouseKey, JSON.stringify({ version: 1, facilityId: 'warehouse', code }))
  await act(async () => root.render(<FactoryApp />))
  const reservation = () => container.querySelector('.map-editor-queued')?.textContent
  const apply = () => container.querySelector<HTMLButtonElement>('.map-editor-apply')!
  expect(editor('python').state.doc.toString()).toBe(code)
  expect(reservation()).toBe('')
  await click('.map-run-control')
  expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'run', code: initialPythonCode }))
  await click('.map-editor-apply')
  expect(reservation()).toBe('予約中')
  expect(postMessage).toHaveBeenCalledTimes(1)

  await remount()
  expect(editor('python').state.doc.toString()).toBe(code)
  expect(reservation()).toBe('')
  expect(apply().disabled).toBe(false)
  await click('[data-facility="warehouse"] a')
  expect(container.querySelector('.manufacturing-code-entry [role="status"]')?.textContent).toBe('未適用の編集あり')
  await click('.factory-warehouse a[href="/map/"]')
  await click('.map-editor-apply')
  expect(apply().disabled).toBe(true)
  await click('.map-run-control')
  expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'run', code }))
})

it.each([
  '{',
  '{"version":2,"facilityId":"warehouse","code":"from a later version"}',
  '{"version":1,"facilityId":"sorting","code":"for a different facility"}',
  '{"version":1,"facilityId":"warehouse","code":123}',
])('keeps a valid empty draft when the other facility has invalid storage: %s', async invalid => {
  window.localStorage.setItem(warehouseKey, invalid)
  window.localStorage.setItem(sortingKey, JSON.stringify({ version: 1, facilityId: 'sorting', code: '' }))
  window.history.replaceState(null, '', '/map/?view=sorting')
  await act(async () => root.render(<FactoryApp />))
  expect(editor('python').state.doc.toString()).toBe(initialPythonCode)
  expect(editor('sorting').state.doc.toString()).toBe('')
  expect(window.localStorage.getItem(warehouseKey)).toBe(invalid)
})

it('allows both editors to be used when localStorage access throws', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Storage unavailable') })
  await act(async () => root.render(<FactoryApp />))
  await click('[data-facility="sorting"] a')
  await edit(editor('python'), '# warehouse without storage')
  await edit(editor('sorting'), '# sorting without storage')
  window.dispatchEvent(new Event('pagehide'))
  expect(editor('python').state.doc.toString()).toBe('# warehouse without storage')
  expect(editor('sorting').state.doc.toString()).toBe('# sorting without storage')
})

it('shares the warehouse draft and runs the sorting draft independently of window actions and the factory', async () => {
  await act(async () => root.render(<FactoryApp />))
  const originalTick = container.querySelector('.map-header-status')?.textContent
  const warehouseCode = '# warehouse draft\nresult = 0'
  await edit(editor('python'), warehouseCode)
  await click('[data-facility="sorting"] a')
  expect(container.querySelector('h1')?.textContent).toBe('仕分け施設')
  expect(container.querySelectorAll('.workspace-window:not([hidden])')).toHaveLength(2)
  expect(editor('python').state.doc.toString()).toBe(warehouseCode)
  expect(document.title).toBe('Brain Forge | 仕分け施設')

  const code = 'def sort_parts(a):\n    return sorted(a)\n'
  const nextDraft = '# next trial\n' + code
  await edit(editor('sorting'), code)
  await click('.sorting .manufacturing-primary')
  const firstWorker = SortingWorker.instances[0]
  await act(async () => firstWorker.emit({ type: 'ready' }))
  expect(container.querySelector('[role="status"]')?.textContent).toContain('実行中')
  await click('[aria-label="sorting.pyを閉じる"]')
  await click('[data-window-button="sorting"]')
  await click('[aria-label="sorting.pyを最大化"]')
  await click('[aria-label="sorting.pyを復元"]')
  expect(SortingWorker.instances).toHaveLength(1)
  expect(firstWorker.terminate).not.toHaveBeenCalled()
  expect(editor('sorting').state.doc.toString()).toBe(code)
  await edit(editor('sorting'), nextDraft)

  for (let i = 0; i < 4; i++) {
    const worker = SortingWorker.instances[i]
    const [{ code: submitted, input }] = worker.postMessage.mock.calls[0]
    expect(submitted).toBe(code)
    const output = [...input].sort((a, b) => a - b)
    await act(async () => {
      if (i !== 0) worker.emit({ type: 'ready' })
      worker.emit({ type: 'finished', samples: [1, 2, .05].map(ms => ({ ms, output })) })
    })
  }
  expect(container.querySelectorAll('.sorting-table tbody tr')).toHaveLength(4)
  expect(container.querySelector('.sorting-table tbody')?.textContent).toContain('60,000,000 件/分')
  expect(container.querySelector('#sorting-results-title + p')?.textContent).toBe('正答率 100%（4/4 ケース）')
  expect(container.querySelector('#sorting-goal-title ~ p:last-child')?.textContent).toBe('目標の判定 達成')

  await click('.sorting .manufacturing-primary')
  expect(SortingWorker.instances[4].postMessage.mock.calls[0][0].code).toBe(nextDraft)
  await click('.sorting .manufacturing-buttons button:last-child')
  expect(SortingWorker.instances[4].terminate).toHaveBeenCalledOnce()
  expect(container.querySelector('[role="status"]')?.textContent).toBe('中断')

  await click('.manufacturing-map-link')
  expect(container.querySelector('.map-header-status')?.textContent).toBe(originalTick)
  expect(editor('python').state.doc.toString()).toBe(warehouseCode)
  await click('[data-facility="sorting"] a')
  expect(editor('sorting').state.doc.toString()).toBe(nextDraft)
  expect(SortingWorker.instances).toHaveLength(5)
})

it('switches the mobile editor tabs while preserving both drafts', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query !== '(min-width: 961px)', addEventListener() {}, removeEventListener() {},
  }))
  await act(async () => root.render(<FactoryApp />))
  await click('[data-facility="sorting"] a')
  const visible = () => Array.from(container.querySelectorAll('.workspace-window:not([hidden])'), node => node.id)
  expect(visible()).toEqual(['workspace-sorting'])
  await edit(editor('sorting'), '# sorting mobile draft')
  await click('[data-window-button="python"]')
  expect(visible()).toEqual(['workspace-python'])
  await edit(editor('python'), '# warehouse mobile draft')
  await click('[data-window-button="sorting"]')
  expect(visible()).toEqual(['workspace-sorting'])
  expect(editor('sorting').state.doc.toString()).toBe('# sorting mobile draft')
  await click('[aria-label="sorting.pyを閉じる"]')
  expect(visible()).toEqual([])
  await click('.manufacturing-map-link')
  expect(editor('python').state.doc.toString()).toBe('# warehouse mobile draft')
})
