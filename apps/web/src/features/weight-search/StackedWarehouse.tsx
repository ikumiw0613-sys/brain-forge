import { useId, useLayoutEffect, useRef } from 'react'
import { getLiftPose, liftCenter, rackEnd, warehouseShelfX, dockIndex } from './robotMotion'
import type { RobotMotion } from './robotMotion'
import { shelfAddress, warehouseLayout } from './warehouseLayout'
import { Rock } from './WeightSearchGantry'
import type { SearchBounds } from '../../factory/warehouse/engine'

export function StackedWarehouse({ size, parked, motion, bounds, pendingIndex }: {
  size: number
  parked: number
  motion: RobotMotion | null
  bounds: SearchBounds
  pendingIndex?: number
}) {
  const { floors, slotsPerFloor } = warehouseLayout(size)
  const id = useId()
  const svg = useRef<SVGSVGElement>(null)
  const carriage = useRef<SVGGElement>(null)
  const head = useRef<SVGGElement>(null)
  const probe = useRef<SVGGElement>(null)
  const floorY = (floor: number) => 46 + (floors - 1 - floor) * 92
  const target = motion?.index ?? parked
  const activeFloor = target === dockIndex ? 0 : shelfAddress(target, slotsPerFloor).floor
  const baseY = floorY(0) + 74
  const groups = 8
  const groupSize = slotsPerFloor / groups

  useLayoutEffect(() => {
    const scene = svg.current!
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    let mounted = true
    function draw(now: number) {
      if (!mounted) return
      const pose = getLiftPose(slotsPerFloor, parked, motion, now, reduced)
      const y = 46 + (floors - 1 - pose.floor) * 92
      scene.dataset.phase = pose.phase
      scene.dataset.robotFloor = String(pose.floor + 1)
      scene.dataset.carrying = String(pose.carrying)
      carriage.current!.setAttribute('transform', `translate(0 ${y})`)
      head.current!.setAttribute('transform', `translate(${pose.x} 0)`)
      probe.current!.setAttribute('transform', `translate(0 ${pose.extension * 23})`)
      if (motion && !reduced && pose.phase !== 'weigh') frame = window.requestAnimationFrame(draw)
    }
    draw(performance.now())
    return () => {
      mounted = false
      window.cancelAnimationFrame(frame)
    }
  }, [floors, slotsPerFloor, parked, motion])

  return (
    <svg ref={svg} className="weight-gantry weight-stacked" viewBox={`0 0 920 ${baseY + 22}`}
      role="img" aria-label={`${floors}階層の自動倉庫。各階に${slotsPerFloor}棚`} aria-describedby="shelf-legend"
      data-floor-count={floors} data-parked-index={parked} data-target-index={motion?.index}>
      <defs>
        <linearGradient id={`${id}-wall`} x2="0" y2="1">
          <stop stopColor="#17314a" /><stop offset="1" stopColor="#081321" />
        </linearGradient>
        <g id={`${id}-bay`}>
          <path d="M-30 4h60v51h-60z" fill="#122439" stroke="#405973" />
          <path d="M-30 4l8-5h60l-8 5zm60 0 8-5v49l-8 7z" fill="#2c4359" />
          <g transform="translate(0 40) scale(.88)"><Rock /></g>
          <path d="M-22 40h44l-3 11h-38z" fill="#8a613d" stroke="#c58b51" />
          <path d="M-15 45h30" stroke="#dba36d" strokeOpacity=".65" />
        </g>
      </defs>
      <rect width="920" height={baseY + 22} fill={`url(#${id}-wall)`} />
      <path d={`M0 ${baseY}H920v22H0z`} fill="#213647" />
      <path d={`M0 ${baseY}H920M20 ${baseY + 12}H900`} fill="none" stroke="#9f7951" strokeWidth="2" />
      {Array.from({ length: floors }, (_, row) => {
        const floor = floors - 1 - row
        const start = floor * slotsPerFloor
        const floorEnd = start + slotsPerFloor - 1
        const hasCandidates = start <= bounds.upper && floorEnd >= bounds.lower
        const measuring = pendingIndex !== undefined && pendingIndex >= start && pendingIndex <= floorEnd
        return (
          <g key={floor} className="weight-rack-floor" transform={`translate(0 ${floorY(floor)})`}
            data-floor={floor + 1} data-active={floor === activeFloor} data-candidate={hasCandidates} data-measuring={measuring}>
            <rect className="weight-floor-plaque" x="24" y="0" width="108" height="60" rx="6" />
            <text x="38" y="27" className="weight-floor-title">{floor + 1}F</text>
            <text x="38" y="47" className="weight-floor-label">{start}–{start + slotsPerFloor - 1}</text>
            {!hasCandidates && <text x="82" y="27" className="weight-floor-status">除外済</text>}
            {measuring && <text x="510" y="-10" className="weight-floor-measuring">◆ 計量中 index {pendingIndex}</text>}
            <path className="weight-floor-frame" d="M144-4H425v65H144z M495-4h327v65H495z" />
            <path d="M144 61h281l-7 6H137z M495 61h327l-7 6H488z" fill="#405a70" />
            <path d="M145-6h280m70 0h326" stroke="#a6b9c3" strokeWidth="3" />
            {Array.from({ length: groups }, (_, group) => {
              const x = warehouseShelfX(group * groupSize + groupSize / 2 - .5, slotsPerFloor)
              const groupStart = start + group * groupSize
              const groupEnd = groupStart + groupSize - 1
              const count = Math.max(0, Math.min(groupEnd, bounds.upper) - Math.max(groupStart, bounds.lower) + 1)
              return (
                <g key={group} className="weight-rack-group" data-start={groupStart} data-end={groupEnd}
                  data-candidate={count > 0} data-partial={count > 0 && count < groupSize}>
                  <use href={`#${id}-bay`} x={x} />
                  {count > 0 && <rect className="weight-rack-highlight" x={x - 30} y="4" width="60" height="51" />}
                </g>
              )
            })}
          </g>
        )
      })}
      <path d={`M434 24h52v${baseY - 19}h-52z`} fill="#0a1827" stroke="#af783e" strokeWidth="3" />
      <path d={`M443 26v${baseY - 26}m34 -${baseY - 26}v${baseY - 26}`} stroke="#617a90" strokeWidth="5" />
      <path d={`M${rackEnd + 15} ${baseY - 39}h70v39h-70z`} fill="#253e53" stroke="#80684f" />
      <text x="838" y={baseY - 12} className="weight-floor-label">出荷</text>
      <g ref={carriage}>
        <path d={`M${liftCenter - 32}-15h64v23h-64z`} fill="#a66d2c" stroke="#fbc582" />
        <path d={`M152 0H${rackEnd}`} stroke="#60798f" strokeWidth="4" opacity=".75" />
        <path d="M449-7h22" stroke="#a1f9ff" strokeWidth="3" />
        <g ref={head}>
          <rect x="-16" y="-13" width="32" height="23" rx="3" fill="#b57732" stroke="#ffcf95" />
          <path d="M-7-5h14" stroke="#163949" strokeWidth="4" />
          <path d="M0 10v8" stroke="#c9d8e0" strokeWidth="3" />
          <g ref={probe}>
            <path d="M0 9v12m-10 7 3-7H7l3 7" fill="none" stroke="#c3d6e1" strokeWidth="2" />
            <circle className="weight-sensor" cy="21" r="4" />
            <g className="weight-lift-load" transform="translate(0 43) scale(.6)"><Rock /></g>
          </g>
        </g>
      </g>
      {target !== dockIndex && <path className="weight-lift-marker" transform={`translate(${warehouseShelfX(shelfAddress(target, slotsPerFloor).slot, slotsPerFloor)} ${floorY(activeFloor) + 59})`}
        d="M-9-3 0 4l9-7" fill="none" strokeWidth="3" />}
    </svg>
  )
}
