// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Workspace } from './Workspace'
import { useWindowLayout, windowIds } from './windowLayout'
import { loadWindowLayout } from './windowLayoutStorage'

const storageKey = 'brain-forge:workspace-layout'

function TestWorkspace() {
  const layout = useWindowLayout()
  return <Workspace layout={layout} panels={{ python: null, events: null, performance: null }} />
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('saves geometry once after a drag and restores it, stacking, closed and maximized windows', async () => {
  const container = document.createElement('div')
  let root = createRoot(container)
  const click = (selector: string) => act(async () => container.querySelector<HTMLButtonElement>(selector)!.click())
  const frame = (id: string) => container.querySelector<HTMLElement>(`#workspace-${id}`)!
  try {
    await act(async () => root.render(<TestWorkspace />))
    expect(frame('python').style.left).toBe('16px')
    expect(window.localStorage.getItem(storageKey)).toBeNull()

    const move = frame('python').querySelector<HTMLButtonElement>('.workspace-move')!
    move.setPointerCapture = vi.fn()
    const pointer = (type: string, clientX: number) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY: 580 })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      move.dispatchEvent(event)
    })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    await pointer('pointerdown', 32)
    await pointer('pointermove', 80)
    await pointer('pointermove', 132)
    expect(frame('python').style.left).toBe('116px')
    expect(write).not.toHaveBeenCalled()
    await pointer('pointerup', 132)
    await pointer('lostpointercapture', 132)
    expect(write).toHaveBeenCalledTimes(1)

    await click('#workspace-events [aria-label$="を閉じる"]')
    await click('#workspace-performance [aria-label$="を最大化"]')
    const top = frame('performance').style.zIndex
    await act(async () => root.unmount())
    root = createRoot(container)
    const writes = write.mock.calls.length
    await act(async () => root.render(<TestWorkspace />))
    expect(write).toHaveBeenCalledTimes(writes)
    expect(frame('python').style.left).toBe('116px')
    expect(frame('events').hidden).toBe(true)
    expect(frame('performance').dataset.maximized).toBe('true')
    expect(frame('performance').style.zIndex).toBe(top)

    await click('.workspace-toolbar button:last-child')
    expect(window.localStorage.getItem(storageKey)).toBeNull()
    expect(frame('python').style.left).toBe('16px')
    expect(frame('events').hidden).toBe(false)
    expect(frame('performance').dataset.maximized).toBe('false')
  } finally {
    await act(async () => root.unmount())
  }
})

it.each(['{', '{"version":0,"windows":{}}', '{"version":1,"windows":{}}'])(
  'uses the defaults and leaves storage alone on mount for %s', async saved => {
    window.localStorage.setItem(storageKey, saved)
    expect(loadWindowLayout(windowIds)).toBeNull()
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(<TestWorkspace />))
      expect(container.querySelector<HTMLElement>('#workspace-python')?.style.left).toBe('16px')
      expect(window.localStorage.getItem(storageKey)).toBe(saved)
    } finally {
      await act(async () => root.unmount())
    }
  },
)

it('opens and resets windows when access to localStorage throws', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Storage unavailable') })
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<TestWorkspace />))
    const editor = container.querySelector<HTMLElement>('#workspace-python')!
    expect(editor.hidden).toBe(false)
    await act(async () => editor.querySelector<HTMLButtonElement>('[aria-label$="を閉じる"]')!.click())
    expect(editor.hidden).toBe(true)
    await act(async () => container.querySelector<HTMLButtonElement>('.workspace-toolbar button:last-child')!.click())
    expect(editor.hidden).toBe(false)
  } finally {
    await act(async () => root.unmount())
  }
})
