// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeightSearchPrototype } from './WeightSearchPrototype'
import { weightSearchTickMs } from './useWeightSearch'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => { root.render(<StrictMode><WeightSearchPrototype initialSample={0.5} random={() => 0} /></StrictMode>) })
  await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '手動')!)
}
const slot = (index: number) => container.querySelectorAll<HTMLButtonElement>('.weight-slots button')[index]
const primary = () => container.querySelector<HTMLButtonElement>('.weight-primary')!
const read = (selector: string) => container.querySelector(selector)?.textContent
const click = (button: HTMLButtonElement) => act(async () => { button.click() })
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })

async function measure(index: number) {
  await click(slot(index))
  await advance(2 * weightSearchTickMs)
}

describe('weight search prototype', () => {
  it('renders the manual flow and comparison, then clears revealed slots on the next order', async () => {
    await render()
    expect(read('h1')).toContain('70 kg')
    expect(container.querySelectorAll('.weight-slots button')).toHaveLength(16)
    expect(Array.from(container.querySelectorAll('.weight-slot-reading'), reading => reading.textContent)).toEqual(Array(16).fill('—'))
    expect(slot(10).getAttribute('aria-label')).toContain('未計量')
    expect(container.textContent).not.toContain('76 kg')
    expect(primary().disabled).toBe(true)

    await click(slot(10))
    expect(container.querySelector('.weight-line-loading')).not.toBeNull()
    expect(read('.weight-stations [role="status"]')).toContain('0/2 Tick')
    await advance(weightSearchTickMs)
    expect(read('.weight-stations [role="status"]')).toContain('1/2 Tick')
    expect(container.textContent).not.toContain('76 kg')
    await advance(weightSearchTickMs)
    expect(slot(10).textContent).toContain('76 kg')
    expect(read('.weight-stations [role="status"]')).toContain('条件を満たす')
    expect(read('.weight-range')).toContain('01–11')
    expect(primary().disabled).toBe(true)

    await measure(9)
    expect(slot(9).getAttribute('aria-label')).toContain('必要重量未満')
    expect(read('.weight-range')).toBe('鉱石 11')
    expect(primary().disabled).toBe(false)
    await click(primary())
    expect(read('.weight-stations > div + div')).toContain('鉱石 11 · 76 kg を出荷完了')
    expect(read('.weight-comparison')).toContain('2 回11 回')
    expect(read('.weight-comparison')).toContain('20 pt110 pt')
    expect(read('.weight-comparison')).toContain('4 Tick22 Tick')
    expect(read('.weight-delta strong')).toBe('+90 pt')
    expect(read('.weight-totals')).toContain('100 クレジット')

    await click(primary())
    expect(read('.weight-order')).toContain('ORD-002')
    expect(read('h1')).toContain('12 kg')
    expect(read('.weight-log')).toContain('0 件')
    expect(slot(10).getAttribute('aria-label')).toContain('未計量')
    expect(container.textContent).not.toContain('76 kg')
    expect(read('.weight-totals')).toContain('20 pt')
    expect(read('.weight-history')).toContain('ORD-001')

    await measure(0)
    await measure(0)
    await click(primary())
    expect(read('.weight-delta strong')).toBe('-10 pt')
    expect(read('.weight-totals')).toContain('200 クレジット')
  })

  it.each([0, 60])('produces identical costs and rewards with %i animation frames', async (frameCount) => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback))
    await render()
    await measure(9)
    await measure(10)
    await click(primary())
    const start = performance.now()
    for (let index = 0; index < frameCount; index++) frames.shift()?.(start + index * 20)
    expect(read('.weight-metrics')).toBe('計量回数2 回今回の消費電力20 pt今回の処理時間4 Tick')
    expect(read('.weight-totals')).toContain('100 クレジット')
    expect(read('.weight-delta strong')).toBe('+90 pt')
  })
})
