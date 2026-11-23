import { expect, it } from 'vitest'
import { fitWindow, resizeWindow, windowRect } from './windowLayout'

it.each([1440, 961])('places the default windows side by side at the bottom of a %ipx viewport', width => {
  const bounds = { width, height: 680 }
  const state = { rect: null, zIndex: 1, isOpen: true, isMaximized: false }
  const python = windowRect('python', state, bounds)
  const events = windowRect('events', state, bounds)
  const performance = windowRect('performance', state, bounds)
  expect(python.y).toBeGreaterThan(bounds.height / 2)
  expect(python.x).toBe(16)
  expect(python.y + python.height).toBe(bounds.height - 24)
  expect(python.x + python.width).toBeLessThan(events.x)
  expect(events.x + events.width).toBeLessThan(performance.x)
  expect(performance.x + performance.width).toBeLessThan(bounds.width)
})

it('fits saved windows as the viewport shrinks and clamps resize to the remaining space', () => {
  const bounds = { width: 800, height: 500 }
  const saved = { x: 1000, y: 480, width: 400, height: 200 }
  expect(fitWindow(saved, bounds)).toEqual({ x: 400, y: 300, width: 400, height: 200 })
  expect(resizeWindow({ x: 400, y: 300, width: 300, height: 180 }, 'se', 500, 500, bounds))
    .toEqual({ x: 400, y: 300, width: 400, height: 200 })
  const state = { rect: saved, zIndex: 1, isOpen: true, isMaximized: true }
  expect(windowRect('python', state, bounds)).toEqual({ x: 0, y: 0, ...bounds })
  expect(windowRect('python', { ...state, isMaximized: false }, { width: 1440, height: 900 })).toEqual(saved)
})

it('allows dragging and resizing up to every viewport edge', () => {
  const bounds = { width: 1440, height: 900 }
  const rect = { x: 580, y: 360, width: 400, height: 200 }
  const topLeft = fitWindow({ ...rect, x: -500, y: -500 }, bounds)
  expect(topLeft).toEqual({ ...rect, x: 0, y: 0 })
  const bottomRight = fitWindow({ ...rect, x: 1500, y: 1000 }, bounds)
  expect(bottomRight).toEqual({ ...rect, x: 1040, y: 700 })
  const expanded = resizeWindow(rect, 'nw', -2000, -2000, bounds)
  expect(expanded).toEqual({ x: 0, y: 0, width: 980, height: 560 })
  expect(resizeWindow(expanded, 'se', 2000, 2000, bounds)).toEqual({ x: 0, y: 0, ...bounds })
})

it.each([
  ['n', { x: 300, y: 180, width: 400, height: 280 }],
  ['ne', { x: 300, y: 180, width: 430, height: 280 }],
  ['e', { x: 300, y: 200, width: 430, height: 260 }],
  ['se', { x: 300, y: 200, width: 430, height: 240 }],
  ['s', { x: 300, y: 200, width: 400, height: 240 }],
  ['sw', { x: 330, y: 200, width: 370, height: 240 }],
  ['w', { x: 330, y: 200, width: 370, height: 260 }],
  ['nw', { x: 330, y: 180, width: 370, height: 280 }],
] as const)('anchors the opposite edge when resizing %s', (direction, expected) => {
  const rect = { x: 300, y: 200, width: 400, height: 260 }
  expect(resizeWindow(rect, direction, 30, -20, { width: 1440, height: 900 })).toEqual(expected)
})

it('preserves the minimum size and the far edge when shrinking from the upper left', () => {
  const rect = { x: 300, y: 200, width: 400, height: 260 }
  expect(resizeWindow(rect, 'nw', 1000, 1000, { width: 1440, height: 900 }))
    .toEqual({ x: 482, y: 305, width: 218, height: 155 })
  expect(resizeWindow(rect, 'se', -1000, -1000, { width: 1440, height: 900 }))
    .toEqual({ x: 300, y: 200, width: 218, height: 155 })
})
