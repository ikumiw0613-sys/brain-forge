import type { WindowId, WindowLayout, WindowState } from './windowLayout'

const storageKey = 'brain-forge:workspace-layout'
const version = 2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readWindow(value: unknown): WindowState | null {
  if (!isRecord(value)) return null
  const { rect, zIndex, isOpen, isMaximized } = value
  if (typeof zIndex !== 'number' || !Number.isSafeInteger(zIndex) || zIndex < 1 ||
    typeof isOpen !== 'boolean' || typeof isMaximized !== 'boolean') return null

  if (rect === null && !isMaximized) return { rect, zIndex, isOpen, isMaximized }
  if (!isRecord(rect)) return null
  const { x, y, width, height } = rect
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height) ||
    width <= 0 || height <= 0) return null
  return { rect: { x, y, width, height }, zIndex, isOpen, isMaximized }
}

export function loadWindowLayout(defaults: WindowLayout): WindowLayout | null {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === null) return null
    const data: unknown = JSON.parse(saved)
    if (!isRecord(data) || (data.version !== 1 && data.version !== version) || !isRecord(data.windows)) return null

    const windows = { ...defaults }
    for (const id of Object.keys(defaults) as WindowId[]) {
      if (id === 'sorting' && !(id in data.windows)) continue
      const state = readWindow(data.windows[id])
      if (!state) return null
      windows[id] = state
    }
    return windows
  } catch {
    return null
  }
}

export function saveWindowLayout(windows: WindowLayout) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ version, windows }))
  } catch {
    // Storage may be blocked or full. The in-memory layout still works.
  }
}

export function clearWindowLayout() {
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Resetting the in-memory layout is independent of storage access.
  }
}
