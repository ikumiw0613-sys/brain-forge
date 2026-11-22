import { useId, useLayoutEffect, useRef } from 'react'
import { Block, DispatchBay, DispatchHousing, DispatchShutter, FactoryFloor } from '../../renderers/ConveyorSceneArt'
import { projectedPoints, projectedTranslate } from '../../renderers/conveyorProjection'
import type { Measurement, WeightSearchView } from './engine'
import { armTravel, clawHeight, getRobotPose, shelfHeight, shelfPoint } from './robotMotion'
import type { RobotMotion } from './robotMotion'
import '../../renderers/conveyor.css'

const railHeight = 145
const railStart = -.67
const railSpan = 8.53
const railDepths = [-1.23, 1.41]
const paintedSteel = ['#58788b', '#324d63', '#263b50'] as const
const darkSteel = ['#38516a', '#22364b', '#162538'] as const

export function Rock() {
  return (
    <g>
      <ellipse cx="0" cy="1" rx="18" ry="5" fill="#080f1c" opacity=".67" />
      <path d="m-15-5 5-12 12-4 11 7 3 9-11 7-12-1z" fill="#5c8b9a" stroke="#9fcbd3" />
      <path d="m-15-5 8-6 9-10 11 7-9 5-11-2-3-6" fill="#83b0b8" />
      <path d="m-15-5 8-6L4-9 5 2-7 1z" fill="#496a82" />
      <path d="m4-9 9-5 3 9-11 7z" fill="#416078" />
    </g>
  )
}

function Rails() {
  return railDepths.map(depth => (
    <g key={depth}>
      {[railStart, railStart + railSpan - .18].map(along => (
        <g key={along}>
          <Block at={[along - .08, depth - .1, 7]} size={[.34, .38, 9]} tones={darkSteel} />
          <Block at={[along, depth, 16]} size={[.18, .18, railHeight - 16]} tones={paintedSteel} />
        </g>
      ))}
      <Block at={[railStart, depth, railHeight]} size={[railSpan, .18, 10]} tones={paintedSteel} />
      <polyline points={projectedPoints([railStart, depth + .185, railHeight + 3], [railStart + railSpan, depth + .185, railHeight + 3])}
        fill="none" stroke="#ffbb7e" strokeWidth="1.2" opacity=".78" />
    </g>
  ))
}

function Shelf({ index, active, candidate, measurement, shipped }: WeightSearchView['slots'][number] & {
  active: boolean
  shipped: boolean
}) {
  const [along, depth] = shelfPoint(index)
  const rim = projectedPoints([along - .38, depth - .4, shelfHeight + 1], [along + .38, depth - .4, shelfHeight + 1],
    [along + .38, depth + .4, shelfHeight + 1], [along - .38, depth + .4, shelfHeight + 1])
  return (
    <g className="weight-shelf" data-index={index} data-target={active} data-candidate={candidate}>
      <Block at={[along - .39, depth - .43, 8]} size={[.78, .86, shelfHeight - 8]} tones={darkSteel} />
      <polygon className="weight-shelf-rim" points={rim} />
      {!shipped && <g className="weight-shelf-ore" transform={projectedTranslate([along, depth, shelfHeight + 1])}><Rock /></g>}
      <g transform={projectedTranslate([along, depth + .48, shelfHeight - 5])}>
        <rect x="-15" y="-8" width={measurement ? 77 : 30} height="19" rx="2" fill="#111d2c" stroke="#607e93" />
        <text className="weight-shelf-index" x="0" y="6">{index}</text>
        {measurement && <text className="weight-shelf-mass" x="15" y="6">{measurement.weight} kg</text>}
        {!candidate && <path className="weight-shelf-excluded" d="m-25-3 7 7m0-7-7 7" />}
        {active && <path className="weight-shelf-active" d="m0-21 5 5-5 5-5-5z" />}
      </g>
    </g>
  )
}

export function WeightSearchGantry({ slots, parked, motion, latest, shipped, shippedCount }: {
  slots: WeightSearchView['slots']
  parked: number
  motion: RobotMotion | null
  latest?: Measurement
  shipped?: Measurement
  shippedCount: number
}) {
  const id = useId()
  const svg = useRef<SVGSVGElement>(null)
  const bridge = useRef<SVGGElement>(null)
  const trolley = useRef<SVGGElement>(null)
  const claw = useRef<SVGGElement>(null)
  const rod = useRef<SVGLineElement>(null)
  const load = useRef<SVGGElement>(null)

  useLayoutEffect(() => {
    const scene = svg.current!
    const still = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    let frame = 0
    let mounted = true

    function draw(now: number) {
      if (!mounted) return
      const pose = getRobotPose(parked, motion, now, still)
      const [along, depth] = pose.point
      const extension = pose.extension * armTravel
      bridge.current!.setAttribute('transform', projectedTranslate([along, 0]))
      trolley.current!.setAttribute('transform', projectedTranslate([0, depth]))
      claw.current!.setAttribute('transform', `translate(0 ${extension})`)
      rod.current!.setAttribute('y2', String(-clawHeight + extension))
      const payload = load.current!
      payload.setAttribute('visibility', pose.ore ? 'visible' : 'hidden')
      if (pose.ore) payload.setAttribute('transform', projectedTranslate(pose.ore))
      scene.dataset.phase = pose.phase
      scene.dataset.picked = String(Boolean(pose.picked))
      scene.style.setProperty('--conveyor-shutter-y', `${-(pose.shutterLift ?? 0)}px`)
      if (motion && !still && pose.phase !== 'weigh') frame = window.requestAnimationFrame(draw)
    }

    draw(performance.now())
    return () => {
      mounted = false
      window.cancelAnimationFrame(frame)
    }
  }, [parked, motion])

  return (
    <svg ref={svg} className="weight-gantry" viewBox="-148 -217 1053 520" data-floor-count="1"
      role="img" aria-label="保管棚、天井走行式計量ロボット、出荷ゲート" aria-describedby="shelf-legend"
      data-target-index={motion?.index} data-parked-index={parked}>
      <FactoryFloor id={id} />
      <g className="weight-rack-floor" data-floor="1" data-active={Boolean(motion)} transform="translate(-115 -180)">
        <rect className="weight-floor-plaque" width="110" height="60" rx="6" />
        <text x="14" y="27" className="weight-floor-title">1F</text>
        <text x="14" y="47" className="weight-floor-label">0–15</text>
      </g>
      <Rails />
      <Block at={[-.41, -1.02, 5]} size={[7.43, 2.28, 3]} tones={darkSteel} />
      {slots.map(slot => (
        <Shelf key={slot.index} {...slot} active={motion?.index === slot.index} shipped={shipped?.index === slot.index} />
      ))}
      <Block at={[7.16, -.51, 8]} size={[.97, 1.03, 40]} tones={paintedSteel} />
      <polyline points={projectedPoints([7.37, -.32, 49], [7.61, 0, 49], [7.37, .32, 49])}
        fill="none" stroke="#f2a46d" strokeWidth="3" />
      <DispatchBay shipped={Boolean(shipped)} />

      <g ref={bridge} className="weight-bridge">
        <Block at={[-.18, railDepths[0] - .08, railHeight + 10]} size={[.36, 2.96, 13]} tones={paintedSteel} stroke="#90acba" />
        <Block at={[-.25, railDepths[0] - .08, railHeight + 2]} size={[.48, .3, 17]} tones={darkSteel} />
        <Block at={[-.25, railDepths[1] - .04, railHeight + 2]} size={[.48, .3, 17]} tones={darkSteel} />
        <polyline points={projectedPoints([.183, -1.22, railHeight + 16], [.183, 1.58, railHeight + 16])}
          fill="none" stroke="#78aec0" strokeWidth="1.6" />
        <g ref={trolley} className="weight-trolley">
          <Block at={[-.25, -.24, 123]} size={[.5, .48, 31]} tones={['#57889a', '#315363', '#254052']} stroke="#9cc6d0" />
          <line ref={rod} x1="0" y1="-126" x2="0" y2={-clawHeight} stroke="#a4bac6" strokeWidth="5" />
          <g ref={claw} className="weight-claw">
            <path d="M-9 -109H9V-99H-9Z M-8 -99l-4 10 5 3 M8 -99l4 10 -5 3"
              fill="#426278" stroke="#a6c5d0" strokeWidth="2.1" strokeLinejoin="round" />
            <circle className="weight-sensor" cy="-104" r="3.5" />
          </g>
        </g>
      </g>

      <g clipPath={`url(#${id}-intake-clip)`}>
        <g ref={load} visibility="hidden"><Rock /></g>
      </g>
      <DispatchShutter id={id} />
      <DispatchHousing shipped={Boolean(shipped)} shippedCount={shippedCount} />

      <g className="weight-gantry-panel" transform="translate(634 -161)" aria-hidden="true">
        <rect width="224" height="86" rx="7" fill="#132337" stroke="#527086" />
        <path d="M12 33h200" stroke="#354f63" />
        <text x="14" y="22" className="weight-gantry-caption">ロボット計量表示</text>
        <text x="14" y="64" className="weight-gantry-reading">{latest ? `${latest.weight} kg` : '— kg'}</text>
        <text x="173" y="64" className="weight-gantry-caption">{latest ? `#${latest.index}` : ''}</text>
      </g>
    </svg>
  )
}

