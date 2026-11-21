import { useId, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { conveyorLength } from '../features/game/conveyor'
import type { ConveyorItem } from '../features/game/conveyor'
import type { MinerStatus } from '../features/game/factory'
import { BeltLine, DispatchBay, DispatchHousing, FactoryFloor, OreContainer, OreMiner } from './ConveyorSceneArt'
import { conveyorSceneBounds, conveyorStep } from './conveyorProjection'
import './conveyor.css'

const minerReadings: Record<MinerStatus, string> = {
  waiting: '供給待機',
  supplied: '供給完了',
  blocked: '入口満杯・供給待機',
}
const { x, y, width, height } = conveyorSceneBounds
const viewBox = `${x} ${y} ${width} ${height}`

export function ConveyorView({ items, nextItems, minerStatus, shippedId, shippedCount, running, progressAt }: {
  items: readonly ConveyorItem[]
  nextItems: readonly ConveyorItem[]
  minerStatus: MinerStatus
  shippedId: string | undefined
  shippedCount: number
  running: boolean
  progressAt: (now: number) => number
}) {
  const id = useId()
  const scene = useRef<SVGSVGElement>(null)
  const shipping = shippedId !== undefined
  const minerReading = minerReadings[minerStatus]
  const shipmentReading = shipping ? `${shippedId} を回収` : '回収待ち'

  useLayoutEffect(() => {
    const svg = scene.current!
    let frame: number | undefined
    const animate = (now: number) => {
      svg.style.setProperty('--conveyor-progress', String(progressAt(now)))
      if (running) frame = window.requestAnimationFrame(animate)
    }
    animate(performance.now())
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame) }
  }, [progressAt, running])

  return (
    <section className="panel conveyor-board" aria-labelledby={`${id}-heading`}>
      <h2 className="panel-heading" id={`${id}-heading`}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m2 8 8-4 8 4-8 4-8-4Zm0 0v4l8 4 8-4V8m-8 4v4" />
        </svg>
        搬送ライン
      </h2>
      <svg
        ref={scene}
        className="conveyor-scene"
        data-running={running}
        style={{ '--conveyor-step-x': `${conveyorStep.x}px`, '--conveyor-step-y': `${conveyorStep.y}px` } as CSSProperties}
        viewBox={viewBox}
        role="img"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
      >
        <title id={`${id}-title`}>採掘機、8マスのコンベア、出荷ゲート</title>
        <desc id={`${id}-description`}>
          {`採掘機は${minerReading}。出荷ゲートは${shipmentReading}。`}
          {items.length === 0 ? 'コンベア上にコンテナはありません。'
            : items.map(({ id, position }) => `${id} は ${position + 1} マス目`).join('、')}
        </desc>

        <FactoryFloor id={id} />
        <BeltLine id={id} />
        <OreMiner producing={minerStatus === 'supplied'} blocked={minerStatus === 'blocked'} />
        <DispatchBay shipping={shipping} />

        {items.map(item => {
          const next = nextItems.find(({ id }) => id === item.id)
          return (
            <OreContainer
              key={item.id}
              id={item.id}
              cell={item.position}
              moving={next !== undefined && next.position !== item.position}
              entering={minerStatus === 'supplied' && item.position === 0}
            />
          )
        })}
        {shipping && (
          <g className="conveyor-item-exiting" aria-hidden="true">
            <OreContainer id={shippedId} cell={conveyorLength - 1} />
          </g>
        )}
        <DispatchHousing shippedCount={shippedCount} shipping={shipping} />

        <g className="conveyor-diagram-label" transform="translate(-252 -181)" aria-hidden="true">
          <path d="M0 43h35l34 28" />
          <circle cx="69" cy="71" r="2.5" />
          <text className="conveyor-equipment-name">採掘機</text>
          <text y="25" className="conveyor-equipment-status">{minerReading}</text>
        </g>
        <g className="conveyor-diagram-label" transform="translate(800 23)" aria-hidden="true">
          <path d="M0 43h-19l-31 33" />
          <circle cx="-50" cy="76" r="2.5" />
          <text className="conveyor-equipment-name">出荷ゲート</text>
          <text y="25" className="conveyor-equipment-status">{shipmentReading}</text>
        </g>
      </svg>
      <div className="conveyor-mobile-readings" aria-hidden="true">
        <div><strong>採掘機</strong><span>{minerReading}</span></div>
        <div><strong>出荷ゲート</strong><span>{shipmentReading}</span></div>
        <div className="conveyor-mobile-loads">
          <strong>搬送中</strong>
          <span>{items.length ? items.map(item => item.id).join(' / ') : 'なし'}</span>
        </div>
      </div>
    </section>
  )
}
