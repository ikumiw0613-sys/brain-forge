import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { clearWindowLayout, loadWindowLayout, saveWindowLayout } from './windowLayoutStorage'

export const workspaceWindows = {
  python: 'warehouse.py',
  events: 'イベントログ',
  performance: '生産指標',
}

export type WindowId = keyof typeof workspaceWindows
export type Bounds = { width: number; height: number }
export type WindowRect = Bounds & { x: number; y: number }
export type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type WindowState = {
  rect: WindowRect | null
  zIndex: number
  isOpen: boolean
  isMaximized: boolean
}
export type WindowLayout = Record<WindowId, WindowState>

export const windowIds = Object.keys(workspaceWindows) as WindowId[]

const initialLayout: WindowLayout = {
  python: { rect: null, zIndex: 3, isOpen: true, isMaximized: false },
  events: { rect: null, zIndex: 2, isOpen: true, isMaximized: false },
  performance: { rect: null, zIndex: 1, isOpen: true, isMaximized: false },
}

const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const minWidth = 218
const minHeight = 155

function defaultRect(id: WindowId, bounds: Bounds): WindowRect {
  const gap = 8
  const side = 16
  const available = Math.max(0, bounds.width - 2 * (side + gap))
  const performanceWidth = Math.max(minWidth, Math.round(available * .26))
  const editorWidth = Math.round((available - performanceWidth) * .55)
  const { x, width } = {
    python: { x: side, width: editorWidth },
    events: { x: side + gap + editorWidth, width: available - performanceWidth - editorWidth },
    performance: { x: side + 2 * gap + available - performanceWidth, width: performanceWidth },
  }[id]
  const height = Math.min(310, Math.round(bounds.height * .45))
  return { x, y: bounds.height - height - 24, width, height }
}

export function fitWindow(rect: WindowRect, bounds: Bounds): WindowRect {
  const width = limit(rect.width, Math.min(minWidth, bounds.width), bounds.width)
  const height = limit(rect.height, Math.min(minHeight, bounds.height), bounds.height)
  return { width, height, x: limit(rect.x, 0, bounds.width - width), y: limit(rect.y, 0, bounds.height - height) }
}

export function resizeWindow(rect: WindowRect, direction: ResizeDirection, dx: number, dy: number, bounds: Bounds): WindowRect {
  const start = fitWindow(rect, bounds)
  const right = start.x + start.width
  const bottom = start.y + start.height
  const width = Math.min(minWidth, bounds.width)
  const height = Math.min(minHeight, bounds.height)
  const x = direction.includes('w') ? limit(start.x + dx, 0, right - width) : start.x
  const y = direction.includes('n') ? limit(start.y + dy, 0, bottom - height) : start.y
  const nextRight = direction.includes('e') ? limit(right + dx, start.x + width, bounds.width) : right
  const nextBottom = direction.includes('s') ? limit(bottom + dy, start.y + height, bounds.height) : bottom
  return { x, y, width: nextRight - x, height: nextBottom - y }
}

export function windowRect(id: WindowId, state: WindowState, bounds: Bounds): WindowRect {
  if (state.isMaximized) return { x: 0, y: 0, ...bounds }
  return fitWindow(state.rect ?? defaultRect(id, bounds), bounds)
}

type WindowAction = { type: 'reset' } | ({ id: WindowId } & (
  { type: 'open' | 'close' | 'raise' }
  | { type: 'maximize'; restoreRect: WindowRect }
  | { type: 'rect'; rect: WindowRect }
))

function updateWindow(layout: WindowLayout, action: WindowAction): WindowLayout {
  if (action.type === 'reset') return initialLayout
  const { id } = action
  const current = layout[id]
  const top = Math.max(...windowIds.map(key => layout[key].zIndex))
  const zIndex = current.zIndex === top ? top : top + 1
  switch (action.type) {
    case 'open':
    case 'raise':
      return current.isOpen && current.zIndex === top ? layout : { ...layout, [id]: { ...current, isOpen: true, zIndex } }
    case 'close':
      return { ...layout, [id]: { ...current, isOpen: false } }
    case 'maximize':
      return { ...layout, [id]: { ...current, zIndex, isMaximized: !current.isMaximized, rect: current.rect ?? action.restoreRect } }
    case 'rect':
      return { ...layout, [id]: { ...current, rect: action.rect } }
  }
}

export function useWindowLayout() {
  const [windows, dispatch] = useReducer(updateWindow, initialLayout, fallback => loadWindowLayout(windowIds) ?? fallback)
  const [tab, setTab] = useState<WindowId | null>('python')
  const [resetVersion, setResetVersion] = useState(0)
  const previous = useRef(windows)
  useLayoutEffect(() => {
    if (previous.current !== windows && windows !== initialLayout) saveWindowLayout(windows)
    previous.current = windows
  }, [windows])

  function resetLayout() {
    clearWindowLayout()
    dispatch({ type: 'reset' })
    setTab('python')
    setResetVersion(version => version + 1)
  }

  return { windows, dispatch, tab, setTab, resetLayout, resetVersion }
}

export type WorkspaceLayout = ReturnType<typeof useWindowLayout>
