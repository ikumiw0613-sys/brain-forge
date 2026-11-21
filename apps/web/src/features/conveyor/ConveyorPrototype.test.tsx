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

function containerX(id: string) {
  const label = Array.from(scene().querySelectorAll('.conveyor-container-id')).find(element => element.textContent === id)
  const item = label?.parentElement
  const anchor = item?.parentElement?.getAttribute('transform')?.match(/^translate\(([\d.]+) /)
  if (!anchor) throw new Error(`Container position not found: ${id}`)
  // JSDOM does not resolve the SVG transform from CSS custom properties.
  return Number(anchor[1]) + (item?.classList.contains('conveyor-item-moving') ? beltOffset() : 0)
}

describe('conveyor prototype controls', () => {
  it('starts with one fixed clock and advances under StrictMode', async () => {
    await advance(1000)
    expect(tick()).toBe('0')
    expect(status()).toBe('停止中')
    expect(container.querySelectorAll('.conveyor-cell-number')).toHaveLength(8)
    expect(positions()).toBe('C-01 は 1 マス目、C-02 は 3 マス目、C-03 は 5 マス目')

    await clickButton('開始')
    expect(status()).toBe('運転中')
    await advance(499)
    expect(tick()).toBe('0')
    await advance(1)
    expect(tick()).toBe('1')
    expect(positions()).toBe('C-01 は 2 マス目、C-02 は 4 マス目、C-03 は 6 マス目')
    await advance(2500)
    expect(tick()).toBe('6')
    expect(positions()).toBe('C-01 は 6 マス目、C-02 は 7 マス目、C-03 は 8 マス目')
    await unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['0.5倍', 1000],
    ['1倍', 500],
    ['2倍', 250],
  ] as const)('starts containers and belt together at %s before the first tick commits', async (speed, tickMs) => {
    await selectSpeed(speed)
    const initialX = containerX('C-01')
    await clickButton('開始')
    expect(containerX('C-01')).toBe(initialX)
    expect(beltOffset()).toBe(0)

    await advance(128)
    expect(tick()).toBe('0')
    expect(beltOffset()).toBeCloseTo(cellWidth() * 128 / tickMs)
    expect(containerX('C-01') - initialX).toBeCloseTo(beltOffset())
  })

  it('freezes both belt and containers and resumes the remaining part of the tick', async () => {
    const initialX = containerX('C-01')
    await clickButton('開始')
    await advance(125)
    await clickButton('一時停止')
    expect(status()).toBe('一時停止中')
    expect(progress()).toBe(0.25)
    const pausedX = containerX('C-01')
    expect(pausedX - initialX).toBeCloseTo(beltOffset())
    await advance(2500)
    expect(progress()).toBe(0.25)
    expect(containerX('C-01')).toBe(pausedX)
    expect(tick()).toBe('0')

    await clickButton('再開')
    expect(status()).toBe('運転中')
    expect(progress()).toBe(0.25)
    expect(containerX('C-01')).toBe(pausedX)
    await advance(374)
    expect(tick()).toBe('0')
    await advance(1)
    expect(tick()).toBe('1')
    expect(containerX('C-01')).toBeCloseTo(initialX + cellWidth())
  })

  it('joins adjacent tick movements at the committed position without a jump', async () => {
    const initialX = containerX('C-01')
    await clickButton('開始')
    await advance(496)
    expect(tick()).toBe('0')
    expect(containerX('C-01') - initialX).toBeCloseTo(cellWidth() * 496 / 500)

    await advance(4)
    expect(tick()).toBe('1')
    expect(progress()).toBe(0)
    expect(containerX('C-01')).toBeCloseTo(initialX + cellWidth())
    await advance(12)
    expect(containerX('C-01') - initialX - cellWidth()).toBeCloseTo(beltOffset())
  })

  it('keeps the belt clock on cadence and leaves blocked containers fixed over a long run', async () => {
    await clickButton('開始')
    await advance(1500)
    expect(tick()).toBe('3')
    const endX = containerX('C-03')
    const followingX = containerX('C-02')
    await advance(128)
    expect(containerX('C-03')).toBe(endX)
    expect(beltOffset()).toBeGreaterThan(0)
    expect(containerX('C-02') - followingX).toBeCloseTo(beltOffset())

    await advance(120_000 - 1628)
    expect(tick()).toBe('240')
    expect(progress()).toBe(0)
    expect(positions()).toBe('C-01 は 6 マス目、C-02 は 7 マス目、C-03 は 8 マス目')
    const jammedPositions = ['C-01', 'C-02', 'C-03'].map(containerX)
    await advance(128)
    expect(beltOffset()).toBeCloseTo(cellWidth() * 128 / 500)
    expect(['C-01', 'C-02', 'C-03'].map(containerX)).toEqual(jammedPositions)
  })

  it('changes speed in place and resets phase, timer, speed, and containers', async () => {
    await clickButton('開始')
    await advance(240)
    const beforeX = containerX('C-01')
    const beforeBelt = beltOffset()
    await selectSpeed('2倍')
    expect(progress()).toBe(0.48)
    expect(containerX('C-01')).toBe(beforeX)
    expect(beltOffset()).toBe(beforeBelt)
    expect(container.querySelector('.conveyor-speed p')?.textContent).toBe('1 Tick = 250 ms')
    await advance(128)
    expect(containerX('C-01') - beforeX).toBeCloseTo(beltOffset() - beforeBelt)
    await advance(1)
    expect(tick()).toBe('0')
    await advance(1)
    expect(tick()).toBe('1')
    expect(positions()).toBe('C-01 は 2 マス目、C-02 は 4 マス目、C-03 は 6 マス目')

    await selectSpeed('0.5倍')
    await advance(999)
    expect(tick()).toBe('1')
    await advance(1)
    expect(tick()).toBe('2')

    await clickButton('リセット')
    await advance(2000)
    expect(tick()).toBe('0')
    expect(status()).toBe('停止中')
    expect(progress()).toBe(0)
    expect(container.querySelector('.conveyor-speed p')?.textContent).toBe('1 Tick = 500 ms')
    expect(positions()).toBe('C-01 は 1 マス目、C-02 は 3 マス目、C-03 は 5 マス目')
    await clickButton('開始')
    await advance(500)
    expect(tick()).toBe('1')
  })
})
