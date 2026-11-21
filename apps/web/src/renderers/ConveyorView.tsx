import { useId, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { conveyorLength } from '../features/game/conveyor'
import type { ConveyorItem } from '../features/game/conveyor'
import './factory.css'
import './conveyor.css'

const trackLeft = 80
const cellWidth = 100
const trackWidth = conveyorLength * cellWidth
const cells = Array.from({ length: conveyorLength }, (_, index) => index)

export function ConveyorView({ items, nextItems, running, progressAt }: {
  items: readonly ConveyorItem[]
  nextItems: readonly ConveyorItem[]
  running: boolean
  progressAt: (now: number) => number
}) {
  const id = useId()
  const scene = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const svg = scene.current!
    let frame: number
    const animate = (now: number) => {
      svg.style.setProperty('--conveyor-progress', String(progressAt(now)))
      if (running) frame = window.requestAnimationFrame(animate)
    }
    animate(performance.now())
    return () => window.cancelAnimationFrame(frame)
  }, [progressAt, running])

  return (
    <section className="panel factory-panel" aria-labelledby={`${id}-heading`}>
      <h2 className="panel-heading" id={`${id}-heading`}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1.5" y="6" width="17" height="8" rx="4" />
          <path d="M6 10h.01m4 0h.01m4 0h.01M5 14v3m10-3v3" />
        </svg>
        搬送ライン
      </h2>
      <div className="factory-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-heading`}>
        <svg
          ref={scene}
          className="factory-scene conveyor-scene"
          style={{ '--conveyor-cell-width': `${cellWidth}px` } as CSSProperties}
          viewBox="0 0 960 302"
          role="img"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
        >
          <title id={`${id}-title`}>左から右に搬送する8マスのコンベア</title>
          <desc id={`${id}-description`}>
            {items.map(({ id, position }) => `${id} は ${position + 1} マス目`).join('、')}
          </desc>
          <defs>
            <pattern id={`${id}-floor`} width="42" height="17" patternUnits="userSpaceOnUse" patternTransform="skewX(38)">
              <path d="M42 0H0V17" fill="none" stroke="#36434a" />
            </pattern>
            <pattern id={`${id}-tread`} width="20" height="32" patternUnits="userSpaceOnUse">
              <path d="m0 32 15-32m3 32 15-32" stroke="#54656b" strokeWidth="1.5" />
            </pattern>
            <pattern id={`${id}-hazard`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
              <rect width="6" height="12" fill="#d1994b" />
            </pattern>
            <clipPath id={`${id}-track`}>
              <path d="M64 188l16-32h800l-16 32z" />
            </clipPath>
          </defs>

          <g strokeLinejoin="round">
            <path d="M38 206H877l48 42v10H86l-48-42Z" fill="#0e1317" stroke="#39464c" />
            <path d="M38 206H877l48 42H86Z" fill="#1c252b" stroke="#46565e" />
            <path d="M38 206H877l48 42H86Z" fill={`url(#${id}-floor)`} />
            <path d="M86 253h839" stroke="#46565e" />

            <g fill="#303d44" stroke="#6a787d">
              <path d="M108 211h16v25h-16Zm242 0h16v25h-16Zm242 0h16v25h-16Zm242 0h16v25h-16Z" />
              <path d="M102 236h28m214 0h28m214 0h28m214 0h28" strokeWidth="3" />
            </g>

            <path d="M64 188l16-32h800l-16 32z" fill="#1c282e" stroke="#75838b" />
            <g clipPath={`url(#${id}-track)`}>
              <rect className="conveyor-treads" x={trackLeft - cellWidth - 20} y="156" width={trackWidth + cellWidth + 20} height="32" fill={`url(#${id}-tread)`} />
              <path d="M70 177h800m-804 8h800" fill="none" stroke="#abb9bd" strokeOpacity=".2" />
            </g>

            <rect x="59" y="188" width="819" height="32" rx="12" fill="#303c45" stroke="#829099" />
            <rect x="65" y="193" width="807" height="22" rx="10" fill="#11191e" stroke="#566971" />
            {cells.map(cell => (
              <g key={cell} transform={`translate(${trackLeft + cell * cellWidth} 0)`}>
                {cell > 0 && <path d="M0 151v5l-16 32v33" stroke="#99a7ab" strokeWidth="1.5" fill="none" />}
                <circle cx="18" cy="204" r="7" fill="#35434c" stroke="#60727a" />
                <circle cx="18" cy="204" r="2.5" fill="#83939b" />
                <circle cx="66" cy="204" r="7" fill="#35434c" stroke="#60727a" />
                <circle cx="66" cy="204" r="2.5" fill="#83939b" />
                <text className="conveyor-cell-number" x="42" y="281">{cell + 1}</text>
              </g>
            ))}
            <path d="M878 142h12v51l-14 18h-9v-24l11-27Z" fill="#38464b" stroke="#8a9794" />
            <path d="M879 145h8v41l-8 10Z" fill={`url(#${id}-hazard)`} />
          </g>

          <g fill="#c4cfd3" stroke="#c4cfd3">
            <text x="80" y="60" stroke="none" fontSize="15" fontWeight="700">搬送方向</text>
            <path d="M156 55h91m-7-5 7 5-7 5" fill="none" />
          </g>

          {items.map(item => {
            const nextPosition = nextItems.find(({ id }) => id === item.id)?.position ?? item.position
            return (
              <g key={item.id} transform={`translate(${trackLeft + (item.position + 0.5) * cellWidth} 115)`}>
                <g className={nextPosition === item.position ? undefined : 'conveyor-item-moving'}>
                  <path d="M-32 55h64v6h-64z" fill="#0a1014" opacity=".65" />
                  <path d="M-32 9l10-9h62l-10 9z" fill="#677881" stroke="#91a0a2" />
                  <path d="M30 9l10-9v46l-10 9z" fill="#26343c" stroke="#76878c" />
                  <rect x="-32" y="9" width="62" height="46" rx="2" fill="#3a4951" stroke="#8e9fa3" />
                  <rect x="-26" y="15" width="50" height="34" rx="2" fill="#1a262d" stroke="#566971" />
                  <path d="M-17 4h37m16 10v24" fill="none" stroke="#8a9a9d" />
                  <text className="conveyor-container-id" x="-1" y="38">{item.id}</text>
                </g>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
