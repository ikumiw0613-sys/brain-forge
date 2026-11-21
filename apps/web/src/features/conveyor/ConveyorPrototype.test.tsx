// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConveyorPrototype } from './ConveyorPrototype'

let container: HTMLDivElement
let root: Root | undefined

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(<StrictMode><ConveyorPrototype /></StrictMode>) })
})

afterEach(async () => {
  await unmount()
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function unmount() {
  await act(async () => { root?.unmount() })
  root = undefined
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(element => element.textContent === label)
  if (!button) throw new Error(`Button not found: ${label}`)
  await act(async () => { button.click() })
}

async function selectSpeed(label: string) {
  const option = Array.from(container.querySelectorAll('label')).find(element => element.textContent === label)
  const input = option?.querySelector('input')
  if (!input) throw new Error(`Speed not found: ${label}`)
  await act(async () => { input.click() })
}

async function advance(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

const tick = () => container.querySelector('.conveyor-tick strong')?.textContent
const status = () => container.querySelector('[role="status"]')?.textContent
const positions = () => container.querySelector('svg desc')?.textContent
const scene = () => container.querySelector<SVGSVGElement>('.conveyor-scene')!
const progress = () => Number(scene().style.getPropertyValue('--conveyor-progress'))
const cellWidth = () => Number.parseFloat(scene().style.getPropertyValue('--conveyor-cell-width'))
const beltOffset = () => progress() * cellWidth()

function reading(label: string) {
  const term = Array.from(container.querySelectorAll('dt')).find(element => element.textContent?.startsWith(label))
  return term?.nextElementSibling?.textContent
}

function containerX(id: string) {
  const label = Array.from(scene().querySelectorAll('.conveyor-container-id')).find(element => element.textContent === id)
  const item = label?.closest('.conveyor-container')
  const anchor = item?.getAttribute('transform')?.match(/^translate\(([\d.]+) /)
  if (!anchor) throw new Error(`Container position not found: ${id}`)
  // JSDOM does not resolve the SVG transform from CSS custom properties.
  return Number(anchor[1]) + (item?.querySelector('.conveyor-item-moving') || item?.closest('.conveyor-item-exiting') ? beltOffset() : 0)
}

describe('conveyor prototype controls', () => {
  it('starts with one fixed clock and advances under StrictMode', async () => {
    await advance(1000)
    expect(tick()).toBe('0')
    expect(status()).toBe('停止中')
    expect(container.querySelectorAll('.conveyor-cell-number')).toHaveLength(8)
    expect(positions()).toContain('コンベア上にコンテナはありません')
    expect(positions()).toContain('採掘機は供給待機')
    expect(reading('生産数')).toBe('0 個')
    expect(reading('生産間隔')).toBe('2 Tick')
    expect(reading('ゲートの処理能力')).toBe('最大 1 個 / Tick')

    await clickButton('開始')
    expect(status()).toBe('運転中')
    await advance(499)
    expect(tick()).toBe('0')
    await advance(1)
    expect(tick()).toBe('1')
    expect(reading('生産数')).toBe('0 個')
    await advance(2500)
    expect(tick()).toBe('6')
    expect(reading('生産数')).toBe('3 個')
    expect(reading('出荷数')).toBe('0 個')
    expect(reading('コンベア上のコンテナ')).toBe('3 個')
    expect(positions()).toContain('C-03 は 1 マス目、C-02 は 3 マス目、C-01 は 5 マス目')
    await unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['0.5倍', 1000],
    ['1倍', 500],
    ['2倍', 250],
  ] as const)('moves the first supplied container and belt together at %s', async (speed, tickMs) => {
    await selectSpeed(speed)
    await clickButton('開始')
    await advance(2 * tickMs)
    const spawnTime = performance.now()
    const initialX = containerX('C-01')
    expect(beltOffset()).toBe(0)

    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(tick()).toBe('2')
    expect(beltOffset()).toBeGreaterThan(0)
    expect(beltOffset()).toBeCloseTo(cellWidth() * (performance.now() - spawnTime) / tickMs)
    expect(containerX('C-01') - initialX).toBeCloseTo(beltOffset())
  })

  it('freezes both belt and containers and resumes the remaining part of the tick', async () => {
    await clickButton('開始')
    await advance(1000)
    const initialX = containerX('C-01')
    await advance(125)
    await clickButton('一時停止')
    expect(status()).toBe('一時停止中')
    expect(progress()).toBe(0.25)
    const pausedX = containerX('C-01')
    expect(pausedX - initialX).toBeCloseTo(beltOffset())
    await advance(2500)
    expect(progress()).toBe(0.25)
    expect(containerX('C-01')).toBe(pausedX)
    expect(tick()).toBe('2')

    await clickButton('再開')
    expect(status()).toBe('運転中')
    expect(progress()).toBe(0.25)
    expect(containerX('C-01')).toBe(pausedX)
    await advance(374)
    expect(tick()).toBe('2')
    await advance(1)
    expect(tick()).toBe('3')
    expect(containerX('C-01')).toBeCloseTo(initialX + cellWidth())
  })

  it('joins adjacent tick movements at the committed position without a jump', async () => {
    await clickButton('開始')
    await advance(1000)
    const initialX = containerX('C-01')
    await advance(488)
    expect(tick()).toBe('2')
    expect(containerX('C-01') - initialX).toBeCloseTo(cellWidth() * 488 / 500)

    await advance(12)
    expect(tick()).toBe('3')
    expect(progress()).toBe(0)
    expect(containerX('C-01')).toBeCloseTo(initialX + cellWidth())
    await advance(4)
    expect(containerX('C-01') - initialX - cellWidth()).toBeCloseTo(beltOffset())
  })

  it('runs production and shipping effects at the committed tick boundaries', async () => {
    await clickButton('開始')
    await advance(999)
    expect(scene().querySelector('.conveyor-item-entering')).toBeNull()
    await advance(1)
    expect(scene().querySelector('.conveyor-item-entering')?.textContent).toBe('C-01')
    expect(scene().querySelector('.conveyor-equipment-pulse')).not.toBeNull()

    await advance(3500)
    expect(tick()).toBe('9')
    const endX = containerX('C-03')
    const exitX = containerX('C-01')
    await advance(499)
    expect(containerX('C-01')).toBe(exitX)
    expect(containerX('C-03')).toBeGreaterThan(endX)
    expect(scene().querySelector('.conveyor-item-exiting')).toBeNull()
    await advance(1)
    expect(tick()).toBe('10')
    expect(containerX('C-01')).toBe(exitX)
    expect(positions()).not.toContain('C-01 は 8 マス目')
    expect(positions()).toContain('C-01 を回収')
    expect(scene().querySelector('.conveyor-item-exiting')?.getAttribute('aria-hidden')).toBe('true')
    expect(scene().querySelector('.conveyor-item-entering')?.textContent).toBe('C-05')
    expect(reading('出荷数')).toBe('1 個')
    expect(reading('コンベア上のコンテナ')).toBe('4 個')
    expect(reading('出荷ペース')).toBe('0.10 個 / Tick')
    await advance(500)
    expect(scene().querySelector('.conveyor-item-exiting')).toBeNull()
  })

  it('keeps the simulation clock and the last 20 ticks of shipments accurate during continuous operation', async () => {
    await clickButton('開始')
    await advance(120_000)
    expect(tick()).toBe('240')
    expect(progress()).toBe(0)
    expect(reading('生産数')).toBe('120 個')
    expect(reading('出荷数')).toBe('116 個')
    expect(reading('コンベア上のコンテナ')).toBe('4 個')
    expect(reading('出荷ペース')).toBe('0.50 個 / Tick')
    expect(container.querySelector('.mission-readings')?.textContent).toContain('直近 20 Tick')
    const initialX = containerX('C-118')
    await advance(128)
    expect(beltOffset()).toBeCloseTo(cellWidth() * 128 / 500)
    expect(containerX('C-118') - initialX).toBeCloseTo(beltOffset())
  })

  it('changes speed in place and resets phase, timer, speed, and containers', async () => {
    await clickButton('開始')
    await advance(1248)
    const beforeX = containerX('C-01')
    const beforeBelt = beltOffset()
    await selectSpeed('2倍')
    expect(progress()).toBe(0.496)
    expect(containerX('C-01')).toBe(beforeX)
    expect(beltOffset()).toBe(beforeBelt)
    expect(container.querySelector('.conveyor-speed p')?.textContent).toBe('1 Tick = 250 ms')
    await advance(112)
    expect(containerX('C-01') - beforeX).toBeCloseTo(beltOffset() - beforeBelt)
    await advance(13)
    expect(tick()).toBe('2')
    await advance(1)
    expect(tick()).toBe('3')
    expect(positions()).toContain('C-01 は 2 マス目')

    await selectSpeed('0.5倍')
    await advance(999)
    expect(tick()).toBe('3')
    await advance(1)
    expect(tick()).toBe('4')
    await advance(6000)
    expect(tick()).toBe('10')
    expect(reading('出荷数')).toBe('1 個')

    await clickButton('リセット')
    await advance(2000)
    expect(tick()).toBe('0')
    expect(status()).toBe('停止中')
    expect(progress()).toBe(0)
    expect(container.querySelector('.conveyor-speed p')?.textContent).toBe('1 Tick = 500 ms')
    expect(positions()).toContain('コンベア上にコンテナはありません')
    expect(scene().querySelector('.conveyor-item-exiting')).toBeNull()
    expect(reading('生産数')).toBe('0 個')
    expect(reading('出荷数')).toBe('0 個')
    expect(reading('コンベア上のコンテナ')).toBe('0 個')
    await clickButton('開始')
    await advance(1000)
    expect(tick()).toBe('2')
    expect(positions()).toContain('C-01 は 1 マス目')
  })
})
