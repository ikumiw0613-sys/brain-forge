// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WorldMap } from './WorldMap'

it('renders five distinct facilities and exposes only available ones as keyboard-focusable links', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<WorldMap />))
    expect(container.querySelector('h1')?.textContent).toBe('工場拠点マップ')
    const facilities = Array.from(container.querySelectorAll('.map-site > li'))
    expect(facilities.map(item => item.querySelector('h2')?.textContent)).toEqual([
      '部品倉庫', '製造工場', '出荷センター', '仕分け施設', '物流センター',
    ])
    expect(facilities.map(item => item.querySelector('.map-facility-label p')?.textContent?.slice(1))).toEqual([
      '利用可能', '利用可能', '準備中', '未解放', '未解放',
    ])
    expect(facilities.every(item => item.querySelector('svg'))).toBe(true)
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/prototypes/weight-search/', '/prototypes/manufacturing/',
    ])
    for (const link of links) {
      link.focus()
      expect(document.activeElement).toBe(link)
    }
    expect(facilities.slice(2).every(item => !item.querySelector('a, button, [tabindex]'))).toBe(true)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
