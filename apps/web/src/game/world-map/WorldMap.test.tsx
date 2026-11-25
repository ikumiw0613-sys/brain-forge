// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WorldMap } from './WorldMap'
import { MapEventLog } from './MapOperations'
import { narrowSite, wideSite } from './siteLayout'
import type { ComponentProps } from 'react'

it('renders the production and support facilities and exposes only available ones as keyboard-focusable links', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<WorldMap started machineStatus="WAITING" completed={7}
      revenue={700} revenueRate={140} windowTicks={500} order={{ id: 'ORD-008', requiredWeight: 92 }} />))
    expect(container.querySelector('h1')?.textContent).toBe('工場拠点マップ')
    const nav = Array.from(container.querySelectorAll('.map-nav a'))
    expect(nav.map(link => link.getAttribute('href'))).toEqual([
      '/map/', '/map/?view=warehouse', '/prototypes/manufacturing/', '/map/?view=benchmark', '/map/?view=sorting',
    ])
    expect(nav[0].getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('.map-live-status')?.textContent).toBe('一時停止中')
    expect(Array.from(container.querySelectorAll('.map-revenue dd'), item => item.textContent)).toEqual([
      '140 Cr/100 Tick', '700 Cr', '直近500 Tick',
    ])
    expect(container.querySelector('.map-completed dd')?.textContent).toBe('7 個')
    expect(container.querySelector('[aria-labelledby="map-process-title"]')?.textContent).toContain('ORD-008')
    const scene = container.querySelector('.map-site')!
    const facilities = Array.from(scene.querySelectorAll('[data-facility]'))
    expect(facilities.map(item => item.querySelector('.map-facility-name')?.textContent?.replace(' ↗', ''))).toEqual([
      '部品倉庫', '製造工場', '出荷センター', '分析室', '仕分け施設', '物流センター',
    ])
    expect(facilities.map(item => item.querySelector('.map-facility-status')?.textContent?.slice(2))).toEqual([
      '利用可能', '利用可能', '準備中', '利用可能', '利用可能', '未解放',
    ])
    expect(facilities.every(item => item.querySelector('.map-building'))).toBe(true)
    expect(container.querySelectorAll('svg.map-site')).toHaveLength(1)
    const links = Array.from(scene.querySelectorAll<SVGAElement>('a'))
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/map/?view=warehouse', '/prototypes/manufacturing/', '/map/?view=benchmark', '/map/?view=sorting',
    ])
    for (const link of links) {
      link.focus()
      expect(document.activeElement).toBe(link)
    }
    expect(facilities.filter(item => item.getAttribute('data-status') !== 'available')
      .every(item => !item.querySelector('a, button, [tabindex]'))).toBe(true)
    const routes = Array.from(scene.querySelectorAll('.map-main-route'))
    expect(routes.map(route => [route.getAttribute('data-from'), route.getAttribute('data-to')])).toEqual([
      ['warehouse', 'factory'], ['factory', 'shipping'],
    ])
    expect(routes.every(route => route.querySelector('.map-direction') && route.querySelectorAll('.map-dock').length === 2)).toBe(true)
    expect(scene.querySelectorAll('.map-future-route')).toHaveLength(1)
    expect(scene.querySelector('.map-sorting-route[data-from="sorting"][data-to="warehouse"] .map-direction')).not.toBeNull()
    expect(scene.querySelector('.map-analysis-route')?.getAttribute('data-to')).toBe('analysis')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('retains the directed production flow, startup sorting and logistics branch on narrow screens', () => {
  const topology = (layout: typeof wideSite) => layout.connections.map(({ from, to, kind }) => [from[0], to[0], kind])
  expect(topology(narrowSite).filter(([, , kind]) => kind !== 'future')).toEqual(topology(wideSite).filter(([, , kind]) => kind !== 'future'))
  expect(topology(narrowSite).filter(([, , kind]) => kind === 'future').map(([, to]) => to)).toEqual(['logistics'])
})

it('limits the event window and displays confirmed measurements, receipts and Python failures', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const measurements = Array.from({ length: 24 }, (_, index) => ({ index, weight: 10 + index, qualifies: false }))
  try {
    await act(async () => root.render(<MapEventLog orderId="ORD-001" started measurements={measurements}
      delivery={{ orderId: 'ORD-001', index: 0, weight: 10 }} status="COMPLETED" completed={1}
      report={{ status: 'idle' }} />))
    const rows = () => Array.from(container.querySelectorAll('li'), item => item.textContent)
    expect(rows()).toHaveLength(20)
    expect(rows().slice(0, 3)).toEqual([
      '製造完了ORD-001 · 累計 1 個', '部品発送・受取ORD-001 · 棚 0 · 10 kg', '計量完了棚 23 · 33 kg · 必要重量未満',
    ])
    expect(rows().at(-1)).toBe('計量完了棚 6 · 16 kg · 必要重量未満')

    await act(async () => root.render(<MapEventLog orderId="ORD-002" started measurements={[]}
      delivery={null} status="WAITING" completed={0}
      report={{ status: 'failed', message: 'SyntaxError' }} />))
    expect(rows()).toEqual(['Python実行エラーSyntaxError', '注文受信ORD-002'])
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('uses live activity and mounts cargo once per new dispatch without replaying dispatches from before entry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const previous = { orderId: 'ORD-001', index: 4, weight: 20 }
  const next = { orderId: 'ORD-002', index: 0, weight: 10 }
  const render = (activity: ComponentProps<typeof WorldMap>) => act(async () => root.render(<WorldMap {...activity} />))
  const cargo = () => container.querySelector('.map-cargo')
  try {
    await render({ delivery: previous, machineStatus: 'WAITING', measurementIndex: 0, running: true })
    expect(container.querySelector('[data-activity="weighing"]')).not.toBeNull()
    expect(container.querySelector('[data-weighing] a')?.getAttribute('aria-label')).toContain('棚 0 · 計量中')
    expect(container.querySelector('[data-activity="producing"]')).toBeNull()
    expect(cargo()).toBeNull()
    await render({ delivery: next, machineStatus: 'RECEIVED', running: true })
    expect(container.querySelector('[data-activity]')).toBeNull()
    expect(container.querySelector('[data-weighing]')).toBeNull()
    expect(container.querySelector('[data-facility="warehouse"] a')?.getAttribute('aria-label')).not.toContain('棚 0')
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
    await render({ delivery: { orderId: 'ORD-003', index: 7, weight: 34 }, machineStatus: 'RECEIVED', running: true })
    expect(cargo()?.getAttribute('data-delivery')).toBe('ORD-003')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
