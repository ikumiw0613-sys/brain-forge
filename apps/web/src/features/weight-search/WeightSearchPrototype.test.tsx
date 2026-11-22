// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retractMs, shipmentMs } from './robotMotion'
import { WeightSearchPrototype } from './WeightSearchPrototype'
import { weightSearchTickMs } from './useWeightSearch'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
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
const metricValues = () => Array.from(container.querySelectorAll('.weight-metrics dd:not(.weight-metric-delta)'), value => value.textContent)
const gantry = () => container.querySelector<SVGSVGElement>('.weight-gantry')!
const click = (button: HTMLButtonElement) => act(async () => { button.click() })
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })

async function measure(index: number) {
  await click(slot(index))
  await advance(2 * weightSearchTickMs + retractMs)
}

describe('weight search prototype', () => {
  it('renders the manual flow and comparison, then clears revealed slots on the next order', async () => {
    await render()
    expect(read('h1')).toContain('70 kg')
    expect(container.querySelectorAll('.weight-slots button')).toHaveLength(16)
    expect(Array.from(gantry().querySelectorAll('.weight-shelf-index'), label => label.textContent))
      .toEqual(Array.from({ length: 16 }, (_, index) => String(index)))
    expect(Array.from(container.querySelectorAll('.weight-slot-reading'), reading => reading.textContent)).toEqual(Array(16).fill('—'))
    expect(slot(10).getAttribute('aria-label')).toContain('未計量')
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    expect(read('.weight-no-match')).toBe('16 は該当なし')
    expect(gantry().querySelectorAll('.weight-shelf-mass')).toHaveLength(0)
    expect(container.textContent).not.toContain('76 kg')
    expect(primary().disabled).toBe(true)

    await click(slot(10))
    expect(gantry().dataset.targetIndex).toBe('10')
    expect(gantry().querySelector('[data-index="10"]')?.getAttribute('data-target')).toBe('true')
    expect(gantry().dataset.phase).toBe('travel')
    expect(read('.weight-stations [role="status"]')).toContain('0/2 Tick')
    await advance(weightSearchTickMs)
    expect(read('.weight-stations [role="status"]')).toContain('1/2 Tick')
    expect(container.textContent).not.toContain('76 kg')
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    expect(metricValues()).toEqual(['0 回', '0 pt', '0 Tick'])
    await advance(weightSearchTickMs)
    expect(slot(10).textContent).toContain('76 kg')
    expect(read('.weight-stations [role="status"]')).toContain('条件を満たす')
    expect(read('.weight-range')).toBe('index 0〜10（11位置）')
    expect(read('.weight-no-match')).toBeUndefined()
    expect(read('.weight-range-change')).toContain('直近の除外 6位置')
    expect(read('.weight-range-change')).toContain('基準 70 kg 以上。index 11〜15 と「該当なし」 を除外')
    expect(gantry().querySelectorAll('.weight-shelf-mass')).toHaveLength(1)
    expect(slot(11).getAttribute('aria-label')).toContain('未計量、除外済み')
    expect(gantry().querySelector('[data-index="11"] .weight-shelf-ore')).not.toBeNull()
    expect(gantry().querySelector('[data-index="11"] .weight-shelf-excluded')).not.toBeNull()
    expect(metricValues()).toEqual(['1 回', '10 pt', '2 Tick'])
    expect(gantry().dataset.phase).toBe('raise')
    expect(primary().disabled).toBe(true)

    await advance(retractMs)
    expect(gantry().dataset.parkedIndex).toBe('10')
    await measure(9)
    expect(slot(9).getAttribute('aria-label')).toContain('必要重量未満')
    expect(read('.weight-range')).toBe('index 10（1位置）')
    expect(read('.weight-bound-state')).toBe('境界確定')
    expect(read('.weight-range-change')).toContain('基準 70 kg 未満。index 0〜9 を除外')
    expect(read('.weight-log li')).toContain('2回目index 969 kg必要重量未満10位置を除外+10 pt · +2 Tick')
    expect(primary().disabled).toBe(false)
    await click(primary())
    expect(read('.weight-stations > div + div')).toContain('鉱石 10 を搬送中')
    expect(primary().disabled).toBe(true)
    await advance(shipmentMs - 1)
    expect(read('.weight-totals')).toContain('0 クレジット')
    await advance(1)
    expect(read('.weight-stations > div + div')).toContain('鉱石 10 · 76 kg を出荷完了')
    expect(gantry().querySelector('[data-index="10"] .weight-shelf-ore')).toBeNull()
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
    expect(read('.weight-range')).toBe('index 0〜16（17位置）')
    expect(gantry().querySelectorAll('.weight-shelf-mass')).toHaveLength(0)
    expect(container.textContent).not.toContain('76 kg')
    expect(read('.weight-totals')).toContain('20 pt')
    expect(read('.weight-history')).toContain('ORD-001')

    await measure(0)
    await measure(0)
    await click(primary())
    await advance(shipmentMs)
    expect(read('.weight-delta strong')).toBe('-10 pt')
    expect(read('.weight-totals')).toContain('200 クレジット')
  })

  it('marks a reweigh outside the range without extending it, even with reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    await render()
    await measure(10)
    await measure(9)
    await click(slot(9))
    expect(gantry().dataset.targetIndex).toBe('9')
    expect(slot(9).getAttribute('aria-label')).toContain('除外済み、計量中')
    expect(slot(9).querySelector('.weight-slot-excluded-mark')).not.toBeNull()
    expect(slot(9).querySelector('.weight-slot-active-mark')).not.toBeNull()
    expect(read('.weight-range')).toBe('index 10（1位置）')
    await advance(2 * weightSearchTickMs + retractMs)
    expect(read('.weight-range')).toBe('index 10（1位置）')
    expect(read('.weight-range-change')).toContain('候補範囲は変わりません')
    expect(read('.weight-log li')).toContain('0位置を除外')
    expect(metricValues()).toEqual(['3 回', '30 pt', '6 Tick'])
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
    await advance(shipmentMs)
    expect(metricValues()).toEqual(['2 回', '20 pt', '4 Tick'])
    expect(read('.weight-totals')).toContain('100 クレジット')
    expect(read('.weight-delta strong')).toBe('+90 pt')
  })
})
