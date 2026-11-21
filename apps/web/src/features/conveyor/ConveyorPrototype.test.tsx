// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConveyorView } from '../../renderers/ConveyorView'
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
const cellWidth = () => Number.parseFloat(scene().style.getPropertyValue('--conveyor-step-x'))
const cellRise = () => Number.parseFloat(scene().style.getPropertyValue('--conveyor-step-y'))
const beltOffset = () => progress() * cellWidth()
const shutterLift = () => Math.abs(Number.parseFloat(scene().style.getPropertyValue('--conveyor-shutter-y')))
const intakeTravel = () => Number(scene().style.getPropertyValue('--conveyor-intake-travel'))
const gateLoad = () => scene().querySelector('.conveyor-gate-load')
const gateCount = () => scene().querySelector('.conveyor-gate-count')?.textContent

function reading(label: string) {
  const term = Array.from(container.querySelectorAll('dt')).find(element => element.textContent?.startsWith(label))
  return term?.nextElementSibling?.textContent
}

function svgAnchor(element: Element | null | undefined) {
  const anchor = element?.getAttribute('transform')?.match(/^translate\(([-\d.]+) ([-\d.]+)\)$/)
  if (!anchor) throw new Error('Missing SVG anchor')
  return { x: Number(anchor[1]), y: Number(anchor[2]) }
}

function polygonXs(polygon: Element) {
  return polygon.getAttribute('points')!.split(' ').map(point => Number(point.split(',')[0]))
}

function containerPosition(id: string) {
  const label = Array.from(scene().querySelectorAll('.conveyor-container-id')).find(element => element.textContent === id)
  const item = label?.closest('.conveyor-container')
  const anchor = svgAnchor(item)
  // JSDOM does not resolve the SVG transform from CSS custom properties.
  const phase = item?.closest('.conveyor-gate-load-motion') ? intakeTravel()
    : item?.querySelector('.conveyor-item-moving') ? progress() : 0
  return { x: anchor.x + phase * cellWidth(), y: anchor.y + phase * cellRise() }
}

const containerX = (id: string) => containerPosition(id).x

describe('conveyor prototype controls', () => {
  it('keeps the shutter and its upward travel clear of the foreground housing', () => {
    const shutter = scene().querySelector('.conveyor-gate-shutter')!
    const door = shutter.querySelector('polygon')!
    const hoodFaces = Array.from(scene().querySelectorAll('.conveyor-gate-foreground polygon'))
    const hoodLeft = Math.min(...hoodFaces.flatMap(polygonXs))
    expect(hoodLeft - Math.max(...polygonXs(door))).toBeGreaterThan(4)
    expect(shutter.closest('[clip-path]')).toBeNull()
    expect(Array.from(scene().querySelectorAll('.conveyor-gate-interior polygon'))
      .some(polygon => polygon.getAttribute('points') === door.getAttribute('points'))).toBe(true)
  })

  it('fits all eight projected cell markers inside the view and spaces them along the motion vector', () => {
    const [left, top, width, height] = scene().getAttribute('viewBox')!.split(' ').map(Number)
    const markers = Array.from(scene().querySelectorAll('.conveyor-cell-number'), text => svgAnchor(text.parentElement))
    expect(markers).toHaveLength(8)
    for (const [index, marker] of markers.entries()) {
      expect(marker.x).toBeGreaterThan(left + 12)
      expect(marker.x).toBeLessThan(left + width - 12)
      expect(marker.y).toBeGreaterThan(top + 10)
      expect(marker.y).toBeLessThan(top + height - 10)
      expect(marker.x - markers[0].x).toBeCloseTo(index * cellWidth())
      expect(marker.y - markers[0].y).toBeCloseTo(index * cellRise())
    }
  })

  it('starts with one fixed clock and advances under StrictMode', async () => {
    await advance(1000)
    expect(tick()).toBe('0')
    expect(status()).toBe('停止中')
    expect(Array.from(scene().querySelectorAll('.conveyor-cell-number'), number => number.textContent))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
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
    const initial = containerPosition('C-01')
    expect(beltOffset()).toBe(0)

    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(tick()).toBe('2')
    expect(beltOffset()).toBeGreaterThan(0)
    expect(beltOffset()).toBeCloseTo(cellWidth() * (performance.now() - spawnTime) / tickMs)
    const moved = containerPosition('C-01')
    expect(moved.x - initial.x).toBeCloseTo(beltOffset())
    expect(moved.y - initial.y).toBeCloseTo(progress() * cellRise())
    expect(moved.y).toBeGreaterThan(initial.y)
  })

  it('freezes both belt and containers and resumes the remaining part of the tick', async () => {
    await clickButton('開始')
    await advance(1000)
    const initialX = containerX('C-01')
    await advance(125)
    await clickButton('一時停止')
    expect(status()).toBe('一時停止中')
    expect(progress()).toBe(0.25)
    const paused = containerPosition('C-01')
    expect(paused.x - initialX).toBeCloseTo(beltOffset())
    await advance(2500)
    expect(progress()).toBe(0.25)
    expect(containerPosition('C-01')).toEqual(paused)
    expect(tick()).toBe('2')

    await clickButton('再開')
    expect(status()).toBe('運転中')
    expect(progress()).toBe(0.25)
    expect(containerPosition('C-01')).toEqual(paused)
    await advance(374)
    expect(tick()).toBe('2')
    await advance(1)
    expect(tick()).toBe('3')
    expect(containerX('C-01')).toBeCloseTo(initialX + cellWidth())
  })

  it('joins adjacent tick movements at the committed position without a jump', async () => {
    await clickButton('開始')
    await advance(1000)
    const initial = containerPosition('C-01')
    await advance(488)
    expect(tick()).toBe('2')
    expect(containerX('C-01') - initial.x).toBeCloseTo(cellWidth() * 488 / 500)

    await advance(12)
    expect(tick()).toBe('3')
    expect(progress()).toBe(0)
    expect(containerPosition('C-01')).toEqual({ x: initial.x + cellWidth(), y: initial.y + cellRise() })
    await advance(4)
    expect(containerX('C-01') - initial.x - cellWidth()).toBeCloseTo(beltOffset())
  })

  it('opens, intakes and closes in the tick before the shipment commits', async () => {
    await clickButton('開始')
    await advance(999)
    expect(scene().querySelector('.conveyor-item-entering')).toBeNull()
    await advance(1)
    expect(scene().querySelector('.conveyor-item-entering')?.textContent).toBe('C-01')
    expect(scene().querySelector('.conveyor-equipment-pulse')).not.toBeNull()

    await advance(3256)
    expect(tick()).toBe('8')
    expect(shutterLift()).toBe(0)
    expect(gateLoad()).toBeNull()
    await advance(244)
    expect(tick()).toBe('9')
    const exit = containerPosition('C-01')
    const load = gateLoad()!
    expect(load.textContent).toBe('C-01')
    expect(load.getAttribute('aria-hidden')).toBe('true')
    expect(shutterLift()).toBe(0)

    const clip = scene().querySelector('clipPath[id$="-intake-clip"]')!
    const clipRect = clip.querySelector('rect')!
    const clipEdge = Number(clipRect.getAttribute('x')) + Number(clipRect.getAttribute('width'))
    const crateShadow = load.querySelector('.conveyor-container polygon')!
    const crateXs = polygonXs(crateShadow)
    expect(load.getAttribute('clip-path')).toBe(`url(#${clip.id})`)
    expect(load.compareDocumentPosition(scene().querySelector('.conveyor-gate-interior')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(load.compareDocumentPosition(scene().querySelector('.conveyor-gate-foreground')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(exit.x + Math.max(...crateXs)).toBeLessThan(clipEdge)

    await advance(60)
    expect(shutterLift()).toBeGreaterThan(0)
    expect(containerPosition('C-01')).toEqual(exit)
    expect(gateCount()).toBe('0')
    await advance(196)
    const open = shutterLift()
    const inside = containerPosition('C-01')
    expect(inside.x - exit.x).toBeCloseTo(intakeTravel() * cellWidth())
    expect(inside.y - exit.y).toBeCloseTo(intakeTravel() * cellRise())
    expect(inside.x).toBeGreaterThan(exit.x)
    expect(positions()).toContain('C-01 は 8 マス目')
    expect(reading('出荷数')).toBe('0 個')

    await advance(176)
    expect(shutterLift()).toBeGreaterThan(0)
    expect(shutterLift()).toBeLessThan(open)
    expect(containerX('C-01') + Math.min(...crateXs)).toBeGreaterThan(clipEdge)
    await advance(67)
    expect(gateCount()).toBe('0')
    await advance(1)
    expect(tick()).toBe('10')
    expect(gateLoad()).toBeNull()
    expect(shutterLift()).toBe(0)
    expect(positions()).not.toContain('C-01 は 8 マス目')
    expect(positions()).toContain('C-01 を回収')
    expect(scene().querySelector('.conveyor-gate-lamp-complete')).not.toBeNull()
    expect(scene().querySelector('.conveyor-item-entering')?.textContent).toBe('C-05')
    expect(reading('出荷数')).toBe('1 個')
    expect(gateCount()).toBe('1')
    expect(container.querySelector('.conveyor-mobile-loads')?.textContent).not.toContain('C-01')
    expect(reading('コンベア上のコンテナ')).toBe('4 個')
    expect(reading('出荷ペース')).toBe('0.10 個 / Tick')
    await advance(500)
    expect(gateLoad()?.textContent).toBe('C-02')
    expect(gateCount()).toBe('1')
  })

  it('keeps a single visual load when a shipment completes and the next intake is already planned', async () => {
    await act(async () => {
      root?.render(<ConveyorView items={[{ id: 'C-02', position: 7 }]} nextItems={[]} minerStatus="waiting"
        shippedId="C-01" shippedCount={1} running={false} progressAt={() => 0.5} />)
    })
    expect(Array.from(scene().querySelectorAll('.conveyor-container-id'), label => label.textContent)).toEqual(['C-02'])
    expect(gateLoad()?.textContent).toBe('C-02')
    expect(shutterLift()).toBeGreaterThan(0)
    expect(gateCount()).toBe('1')
  })

  it('preserves gate progress through pause, resume and 2x speed, and clears an in-flight intake on reset', async () => {
    await clickButton('開始')
    await advance(4560)
    await clickButton('一時停止')
    const opening = shutterLift()
    const entrance = containerPosition('C-01')
    expect(opening).toBeGreaterThan(0)
    await advance(1008)
    expect(shutterLift()).toBe(opening)
    expect(containerPosition('C-01')).toEqual(entrance)
    expect(tick()).toBe('9')

    await clickButton('再開')
    expect(shutterLift()).toBe(opening)
    expect(containerPosition('C-01')).toEqual(entrance)
    await advance(208)
    expect(shutterLift()).toBeGreaterThan(opening)
    const open = shutterLift()
    const inside = containerPosition('C-01')
    expect(inside.x).toBeGreaterThan(entrance.x)
    await selectSpeed('2倍')
    expect(shutterLift()).toBe(open)
    expect(containerPosition('C-01')).toEqual(inside)
    await advance(64)
    expect(containerX('C-01')).toBeGreaterThan(inside.x)
    expect(gateCount()).toBe('0')
    await advance(52)
    expect(tick()).toBe('10')
    expect(gateCount()).toBe('1')

    await advance(298)
    expect(gateLoad()?.textContent).toBe('C-02')
    expect(shutterLift()).toBeGreaterThan(0)
    await clickButton('リセット')
    expect(gateLoad()).toBeNull()
    expect(shutterLift()).toBe(0)
    expect(gateCount()).toBe('0')
    expect(tick()).toBe('0')
  })

  it('keeps the simulation clock and the last 20 ticks of shipments accurate during continuous operation', async () => {
    await clickButton('開始')
    await advance(120_000)
    expect(tick()).toBe('240')
    expect(progress()).toBe(0)
    expect(reading('生産数')).toBe('120 個')
    expect(reading('出荷数')).toBe('116 個')
    expect(gateCount()).toBe('116')
    expect(gateLoad()).toBeNull()
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
    const before = containerPosition('C-01')
    const beforeBelt = beltOffset()
    await selectSpeed('2倍')
    expect(progress()).toBe(0.496)
    expect(containerPosition('C-01')).toEqual(before)
    expect(beltOffset()).toBe(beforeBelt)
    expect(container.querySelector('.conveyor-speed p')?.textContent).toBe('1 Tick = 250 ms')
    await advance(112)
    expect(containerX('C-01') - before.x).toBeCloseTo(beltOffset() - beforeBelt)
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
    expect(gateLoad()).toBeNull()
    expect(reading('生産数')).toBe('0 個')
    expect(reading('出荷数')).toBe('0 個')
    expect(reading('コンベア上のコンテナ')).toBe('0 個')
    await clickButton('開始')
    await advance(1000)
    expect(tick()).toBe('2')
    expect(positions()).toContain('C-01 は 1 マス目')
  })
})
