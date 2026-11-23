// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WorldMap } from './WorldMap'
import { narrowSite, wideSite } from './siteLayout'
import type { ComponentProps } from 'react'

it('renders five distinct facilities and exposes only available ones as keyboard-focusable links', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<WorldMap />))
    expect(container.querySelector('h1')?.textContent).toBe('工場拠点マップ')
    const scene = container.querySelector('.map-site')!
    const facilities = Array.from(scene.querySelectorAll('[data-facility]'))
    expect(facilities.map(item => item.querySelector('.map-facility-name')?.textContent?.replace(' ↗', ''))).toEqual([
      '部品倉庫', '製造工場', '出荷センター', '仕分け施設', '物流センター',
    ])
    expect(facilities.map(item => item.querySelector('.map-facility-status')?.textContent?.slice(2))).toEqual([
      '利用可能', '利用可能', '準備中', '未解放', '未解放',
    ])
    expect(facilities.every(item => item.querySelector('.map-building'))).toBe(true)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    const links = Array.from(scene.querySelectorAll<SVGAElement>('a'))
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/map/?view=warehouse', '/prototypes/manufacturing/',
    ])
    for (const link of links) {
      link.focus()
      expect(document.activeElement).toBe(link)
    }
    expect(facilities.slice(2).every(item => !item.querySelector('a, button, [tabindex]'))).toBe(true)
    const routes = Array.from(scene.querySelectorAll('.map-main-route'))
    expect(routes.map(route => [route.getAttribute('data-from'), route.getAttribute('data-to')])).toEqual([
      ['warehouse', 'factory'], ['factory', 'shipping'],
    ])
    expect(routes.every(route => route.querySelector('.map-direction') && route.querySelectorAll('.map-dock').length === 2)).toBe(true)
    expect(scene.querySelectorAll('.map-future-route')).toHaveLength(2)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('retains the directed production flow and both expansion branches on narrow screens', () => {
  const topology = (layout: typeof wideSite) => layout.connections.map(({ from, to, future }) => [from[0], to[0], Boolean(future)])
  expect(topology(narrowSite).filter(([, , future]) => !future)).toEqual(topology(wideSite).filter(([, , future]) => !future))
  expect(topology(narrowSite).filter(([, , future]) => future).map(([, to]) => to)).toEqual(['sorting', 'logistics'])
})

it('uses live activity and mounts cargo once per new dispatch without replaying dispatches from before entry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const previous = { orderId: 'ORD-001' }
  const next = { orderId: 'ORD-002' }
  const render = (activity: ComponentProps<typeof WorldMap>) => act(async () => root.render(<WorldMap {...activity} />))
  const cargo = () => container.querySelector('.map-cargo')
  try {
    await render({ delivery: previous, machineStatus: 'WAITING', measuring: true, running: true })
    expect(container.querySelector('[data-activity="weighing"]')).not.toBeNull()
    expect(container.querySelector('[data-activity="producing"]')).toBeNull()
    expect(cargo()).toBeNull()
    await render({ delivery: next, machineStatus: 'RECEIVED', running: true })
    expect(container.querySelector('[data-activity]')).toBeNull()
    const first = cargo()
    expect(first?.getAttribute('data-delivery')).toBe('ORD-002')
    expect(first?.parentElement?.getAttribute('data-to')).toBe('factory')
    await render({ delivery: next, machineStatus: 'PROCESSING', progress: 6, running: true })
    expect(container.querySelector('[data-activity="producing"]')).not.toBeNull()
    expect(container.querySelector('.map-progress')?.getAttribute('data-progress')).toBe('6')
    expect(container.querySelector('[data-facility="factory"] a')?.getAttribute('aria-label')).toContain('製造中 · 6/20')
    expect(cargo()).toBe(first)
    await render({ delivery: next, machineStatus: 'PROCESSING', progress: 6, running: false })
    expect(container.querySelector('[data-activity]')).toBeNull()
    expect(cargo()).toBe(first)
    await render({ delivery: next, machineStatus: 'COMPLETED', progress: 20, running: true })
    expect(container.querySelector('[data-activity]')).toBeNull()
    await act(async () => root.render(null))
    await render({ delivery: next, machineStatus: 'WAITING', running: true })
    expect(cargo()).toBeNull()
    await render({ delivery: { orderId: 'ORD-003' }, machineStatus: 'RECEIVED', running: true })
    expect(cargo()?.getAttribute('data-delivery')).toBe('ORD-003')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
