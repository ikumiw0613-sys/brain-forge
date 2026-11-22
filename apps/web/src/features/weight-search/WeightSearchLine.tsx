import { useId, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  BeltLine, DispatchBay, DispatchHousing, DispatchShutter, FactoryFloor, OreContainer,
  ScannerBay, ScannerHousing, ScannerSweep,
} from '../../renderers/ConveyorSceneArt'
import { conveyorStep, projectedPoints } from '../../renderers/conveyorProjection'
import { getDispatchFrame } from '../../renderers/dispatchMotion'
import { conveyorLength } from '../game/conveyor'
import { scannerPosition } from '../game/factory'
import type { Measurement, WeightSearchView } from './engine'
import '../../renderers/conveyor.css'

const beltVariables = {
  '--conveyor-step-x': `${conveyorStep.x}px`,
  '--conveyor-step-y': `${conveyorStep.y}px`,
  '--weigh-start-x': `${-scannerPosition * conveyorStep.x}px`,
  '--weigh-start-y': `${-scannerPosition * conveyorStep.y}px`,
} as CSSProperties
const deliveryCell = conveyorLength - 1
const gateApproachMs = 500
const gateCycleMs = 650

function oreLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function WeightSearchLine({ pending, latest, measurementCount, shipped, shippedCount }: {
  pending: WeightSearchView['pending']
  latest?: Measurement
  measurementCount: number
  shipped?: Measurement
  shippedCount: number
}) {
  const id = useId()
  const scene = useRef<SVGSVGElement>(null)
  const shownIndex = pending?.index ?? latest?.index
  const shippingOrigin = shipped?.index === latest?.index ? scannerPosition : 0

  useLayoutEffect(() => {
    if (!shipped || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const svg = scene.current!
    const start = performance.now()
    let frame: number
    function animate(now: number) {
      const elapsed = Math.max(0, now - start)
      const approach = Math.min(1, elapsed / gateApproachMs)
      const gateProgress = Math.max(0, Math.min(1, (elapsed - gateApproachMs) / gateCycleMs))
      const { shutterLift, intakeTravel } = getDispatchFrame(gateProgress)
      svg.style.setProperty('--conveyor-shutter-y', `${-shutterLift}px`)
      svg.style.setProperty('--conveyor-intake-travel', String((approach - 1) * (deliveryCell - shippingOrigin) + intakeTravel))
      svg.style.setProperty('--ship-visibility', gateProgress === 1 ? 'hidden' : 'visible')
      if (gateProgress < 1) frame = window.requestAnimationFrame(animate)
    }
    animate(start)
    return () => {
      window.cancelAnimationFrame(frame)
      svg.style.removeProperty('--conveyor-shutter-y')
      svg.style.removeProperty('--conveyor-intake-travel')
      svg.style.removeProperty('--ship-visibility')
    }
  }, [shipped, shippingOrigin])

  return (
    <svg ref={scene} className="conveyor-scene weight-line" viewBox="-115 -118 1015 415"
      style={beltVariables} data-running={pending !== null}
      role="img" aria-label="倉庫から計量機と出荷ゲートへ鉱石を運ぶコンベア">
      <FactoryFloor id={id} />
      <BeltLine id={id} />
      <ScannerBay />
      <DispatchBay shipped={Boolean(shipped)} />
      <g aria-hidden="true">
        <polygon points={projectedPoints([-.7, -.56, 48], [0, -.56, 48], [0, .56, 48], [-.7, .56, 48])}
          fill="#3c4f60" stroke="#8ea1ad" />
        <polygon points={projectedPoints([-.7, .56, 48], [0, .56, 48], [0, .56, 17], [-.7, .56, 17])}
          fill="#26394b" stroke="#61788b" />
        <polyline points={projectedPoints([-.48, -.2, 49], [-.23, 0, 49], [-.48, .2, 49])}
          fill="none" stroke="#f2aa67" strokeWidth="3" />
      </g>
      {!shipped && shownIndex !== undefined && (
        <g className={pending ? 'weight-line-loading' : undefined} key={measurementCount + Number(Boolean(pending))}>
          <OreContainer id={oreLabel(shownIndex)} cell={scannerPosition} />
        </g>
      )}
      {shipped && (
        <g className="weight-line-shipment" clipPath={`url(#${id}-intake-clip)`} aria-hidden="true">
          <g className="conveyor-gate-load-motion">
            <OreContainer id={oreLabel(shipped.index)} cell={deliveryCell} />
          </g>
        </g>
      )}
      {pending && <g className="weight-line-sweep"><ScannerSweep returning={false} /></g>}
      <ScannerHousing status={pending ? 'inspecting' : latest ? 'passed' : 'waiting'} />
      <DispatchShutter id={id} />
      <DispatchHousing shipped={Boolean(shipped)} shippedCount={shippedCount} />
    </svg>
  )
}
