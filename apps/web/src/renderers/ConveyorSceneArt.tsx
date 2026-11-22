import { conveyorLength } from '../features/game/conveyor'
import { scannerPosition } from '../features/game/factory'
import { conveyorFaceAngle, conveyorSceneBounds, floorTransform, projectFactory, projectedPoints as points, projectedTranslate as translate } from './conveyorProjection'
import { shutterHeight } from './dispatchMotion'

const cells = Array.from({ length: conveyorLength }, (_, index) => index)
const beltHeight = 48
const paint = {
  foundation: ['#29394a', '#142335', '#101b2b'],
  frame: ['#53677e', '#2a3b4f', '#1b293b'],
  steel: ['#71879d', '#3b5067', '#26384d'],
  housing: ['#526d85', '#32495f', '#1e3146'],
  crate: ['#61788d', '#354c62', '#25364b'],
} as const

export function Block({ at, size, tones = paint.steel, stroke = '#7892a7' }: {
  at: readonly [number, number, number]
  size: readonly [number, number, number]
  tones?: readonly [string, string, string]
  stroke?: string
}) {
  const [x, y, z] = at
  const [width, depth, height] = size
  const end = x + width
  const front = y + depth
  const top = z + height
  return (
    <g stroke={stroke} strokeWidth="1" strokeLinejoin="round">
      <polygon points={points([x, front, top], [end, front, top], [end, front, z], [x, front, z])} fill={tones[1]} />
      <polygon points={points([end, y, top], [end, front, top], [end, front, z], [end, y, z])} fill={tones[2]} />
      <polygon points={points([x, y, top], [end, y, top], [end, front, top], [x, front, top])} fill={tones[0]} />
    </g>
  )
}

export function FactoryFloor({ id }: { id: string }) {
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id={`${id}-grid`} width="1" height="1" patternUnits="userSpaceOnUse" patternTransform={floorTransform}>
          <path d="M1 0H0V1" fill="none" stroke="#566980" strokeWidth=".01" />
        </pattern>
        <radialGradient id={`${id}-ambient`} cx="51%" cy="45%" r="62%">
          <stop stopColor="#253b54" />
          <stop offset=".7" stopColor="#131f31" />
          <stop offset="1" stopColor="#0b1220" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-10%" y="-35%" width="125%" height="180%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <rect {...conveyorSceneBounds} fill={`url(#${id}-ambient)`} />
      <rect {...conveyorSceneBounds} fill={`url(#${id}-grid)`} opacity=".27" />
      <polygon points={points([-2.2, -1.13], [10.29, -1.13], [10.29, 1.65], [-2.2, 1.65])}
        fill="#030711" opacity=".88" filter={`url(#${id}-shadow)`} />
      <Block at={[-2.14, -1.16, 0]} size={[12.18, 2.65, 7]} tones={paint.foundation} stroke="#41556a" />
      <polygon points={points([-2.14, -1.16, 7], [10.04, -1.16, 7], [10.04, 1.49, 7], [-2.14, 1.49, 7])}
        fill={`url(#${id}-grid)`} opacity=".55" />
      <polyline points={points([-2, -.98, 8], [9.9, -.98, 8], [9.9, 1.31, 8], [-2, 1.31, 8], [-2, -.98, 8])}
        fill="none" stroke="#63778c" strokeWidth="1.2" opacity=".6" />
      <polygon points={points([-1.8, -.86, 8], [9.64, -.86, 8], [9.64, 1.02, 8], [-1.8, 1.02, 8])}
        fill="#070e19" opacity=".53" />
      {[-1.45, -.45, 7.12, 8.13, 9.14].map(start => (
        <polyline key={start} points={points([start, 1.26, 8], [start + .5, 1.26, 8], [start + .56, 1.37, 8])}
          fill="none" stroke="#cf8846" strokeWidth="2" opacity=".73" />
      ))}
    </g>
  )
}

export function BeltLine({ id }: { id: string }) {
  const edge = 0.57
  const surface = points([0, -edge, beltHeight], [conveyorLength, -edge, beltHeight],
    [conveyorLength, edge, beltHeight], [0, edge, beltHeight])
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-rubber`} x2=".2" y2="1">
          <stop stopColor="#243448" />
          <stop offset="1" stopColor="#142133" />
        </linearGradient>
        <pattern id={`${id}-tread`} width=".25" height="1" patternUnits="userSpaceOnUse" patternTransform={floorTransform}>
          <path d="M.035 0v1" stroke="#576d83" strokeWidth=".019" />
          <path d="M.058 0v1" stroke="#0c1725" strokeWidth=".014" />
        </pattern>
        <clipPath id={`${id}-belt-clip`}><polygon points={surface} /></clipPath>
      </defs>
      {[.25, 2.65, 5.05, 7.43].map(along => (
        <g key={along}>
          <Block at={[along, -.63, 7]} size={[.37, .39, 29]} tones={paint.frame} stroke="#42576d" />
          <Block at={[along - .05, .35, 7]} size={[.47, .55, 6]} tones={paint.foundation} stroke="#485d73" />
          <Block at={[along, .45, 13]} size={[.29, .31, 23]} tones={paint.frame} stroke="#5b7085" />
        </g>
      ))}
      <Block at={[0, -.69, 29]} size={[conveyorLength, 1.38, 19]} tones={paint.frame} stroke="#536b81" />
      <polygon points={surface} fill={`url(#${id}-rubber)`} stroke="#637b90" strokeWidth="1.2" />
      <g clipPath={`url(#${id}-belt-clip)`}>
        <rect className="conveyor-treads" x="-125" y="-99" width="980" height="365" fill={`url(#${id}-tread)`} opacity=".78" />
        {cells.map(cell => (
          <polyline key={cell} points={points([cell + .31, -.14, beltHeight], [cell + .51, 0, beltHeight], [cell + .31, .14, beltHeight])}
            fill="none" stroke="#91b4c7" strokeOpacity=".33" strokeWidth="2" />
        ))}
      </g>
      <Block at={[0, -.72, 45]} size={[conveyorLength, .12, 7]} tones={paint.steel} stroke="#687e95" />
      <Block at={[0, .6, 45]} size={[conveyorLength, .12, 7]} tones={paint.steel} stroke="#687e95" />
      <polyline className="conveyor-power-rail" points={points([.05, .725, 44], [conveyorLength - .05, .725, 44])} />
      {cells.map(cell => (
        <g key={cell}>
          <polyline points={points([cell + .03, .64, 52], [cell + .03, .723, 52], [cell + .03, .723, 30])}
            fill="none" stroke="#a8bdcc" strokeOpacity=".65" />
          <g transform={translate([cell + .49, .697, 36])}>
            <ellipse rx="5" ry="4" fill="#0e1a2a" stroke="#6a7f94" />
            <circle r="1.5" fill="#93aabc" />
          </g>
          <g transform={translate([cell + .5, 1.13, 8])}>
            <rect x="-12" y="-10" width="24" height="20" rx="3" fill="#101c2b" stroke="#4f657c" />
            <text y="5" className="conveyor-cell-number">{cell + 1}</text>
          </g>
        </g>
      ))}
    </g>
  )
}

export function OreMiner({ producing, blocked }: { producing: boolean; blocked: boolean }) {
  return (
    <g aria-hidden="true">
      <Block at={[-1.8, -.83, 7]} size={[1.53, 1.67, 13]} tones={paint.frame} />
      <Block at={[-1.72, -.69, 20]} size={[1.27, 1.36, 61]} tones={paint.housing} />
      <Block at={[-1.76, -.73, 81]} size={[1.35, 1.44, 9]} tones={paint.steel} />
      <polygon points={points([-1.63, .47, 120], [-.44, .47, 120], [-.68, .24, 90], [-1.38, .24, 90])}
        fill="#405970" stroke="#7793a8" />
      <polygon points={points([-.44, -.58, 120], [-.44, .47, 120], [-.68, .24, 90], [-.68, -.35, 90])}
        fill="#263b50" stroke="#658095" />
      <Block at={[-1.67, -.62, 120]} size={[1.27, 1.13, 7]} tones={paint.steel} />
      <polygon points={points([-1.58, -.53, 128], [-.49, -.53, 128], [-.49, .41, 128], [-1.58, .41, 128])}
        fill="#14263a" stroke="#a0b9cb" />
      <polygon points={points([-1.52, -.25, 126], [-1.3, -.43, 136], [-1.12, -.22, 131], [-1.22, .01, 125], [-1.44, .09, 124])}
        fill="#517f97" stroke="#6998aa" />
      <polygon points={points([-1.18, .18, 127], [-.94, -.12, 137], [-.66, .03, 134], [-.67, .27, 126], [-.99, .34, 124])}
        fill="#6b9daf" stroke="#94bdc8" />
      <polygon points={points([-1.18, .18, 127], [-.94, -.12, 137], [-.9, .22, 132], [-.99, .34, 124])} fill="#42687e" />

      <g transform={`${translate([-1.2, .68, 48])} rotate(${conveyorFaceAngle})`}>
        <rect x="-32" y="-15" width="58" height="30" rx="4" fill="#1b2b3d" stroke="#718ca2" />
        <circle cx="-17" r="9" fill="#38526a" stroke="#8da5b7" />
        <path d="M-23 0h12m-6-6v12M0-5h15M0 0h15M0 5h15" stroke="#9bb0bf" strokeWidth="1.5" />
      </g>
      <polygon points={points([-.56, -.34, 70], [0, -.45, beltHeight], [0, .45, beltHeight], [-.56, .34, 70])}
        fill="#31475c" stroke="#8ba5b9" />
      <polygon points={points([-.56, .34, 76], [0, .45, 55], [0, .45, beltHeight], [-.56, .34, 70])}
        fill="#4c677e" stroke="#88a4b7" />
      <polyline points={points([-.56, -.34, 76], [0, -.45, 55], [0, -.45, beltHeight])} fill="none" stroke="#8ba5b9" strokeWidth="3" />
      <polyline points={points([-.52, .363, 74], [-.36, .393, 68], [-.21, .414, 62])}
        fill="none" stroke="#e4a25c" strokeWidth="3" strokeDasharray="4 5" />
      <g transform={`${translate([-1.43, .675, 73])} rotate(${conveyorFaceAngle})`}>
        <rect x="-12" y="-5" width="34" height="10" rx="2" fill="#142436" stroke="#607d92" />
        <circle className={blocked ? 'conveyor-lamp-blocked' : 'conveyor-lamp'} cx="-5" r="2.6" />
        <path d="M3 0h13" stroke="#7f9aaa" strokeWidth="1.5" />
        {producing && <circle className="conveyor-equipment-pulse" cx="-5" r="6" fill="#8df5ff" />}
      </g>
      {producing && <polyline className="conveyor-equipment-pulse" points={points([-.49, -.29, 73], [-.12, -.34, 57], [-.12, .34, 57])}
        fill="none" stroke="#8df5ff" strokeWidth="3" />}
    </g>
  )
}

const scannerFrame = scannerPosition + .06

export function ScannerBay() {
  return (
    <g className="conveyor-scanner-bay" aria-hidden="true">
      <Block at={[scannerFrame - .06, -.96, 7]} size={[.42, .35, 7]} tones={paint.frame} />
      <Block at={[scannerFrame, -.9, 14]} size={[.3, .24, 88]} tones={paint.housing} />
      <polyline points={points([scannerPosition, -.56, beltHeight + 1], [scannerPosition + 1, -.56, beltHeight + 1])}
        fill="none" stroke="#6daeba" strokeWidth="1.8" />
    </g>
  )
}

export function ScannerSweep({ returning }: { returning: boolean }) {
  const along = scannerPosition + .28
  const height = beltHeight + 37
  return (
    <g className="conveyor-scanner-sweep" data-returning={returning} aria-hidden="true">
      <polygon points={points([along - .05, -.27, height], [along + .05, -.27, height],
        [along + .05, .27, height], [along - .05, .27, height])} fill="#79e6f0" opacity=".48" />
      <polyline points={points([along, -.31, height], [along, .31, height])} stroke="#b9faff" strokeWidth="2.5" />
    </g>
  )
}

export function ScannerHousing({ status }: { status: 'waiting' | 'inspecting' | 'passed' }) {
  return (
    <g className="conveyor-scanner-housing" data-status={status} aria-hidden="true">
      <Block at={[scannerFrame - .06, .64, 7]} size={[.43, .38, 7]} tones={paint.frame} />
      <Block at={[scannerFrame, .69, 14]} size={[.3, .25, 88]} tones={paint.housing} />
      <Block at={[scannerFrame, -.9, 102]} size={[.48, 1.84, 14]} tones={paint.steel} />
      <Block at={[scannerPosition + .33, -.32, 97]} size={[.42, .64, 10]} tones={paint.housing} />
      <polyline className="conveyor-scanner-emitter" points={points([scannerPosition + .43, .322, 101], [scannerPosition + .68, .322, 101])}
        strokeWidth="2.8" strokeLinecap="round" />
      <g transform={`${translate([scannerPosition + .22, .95, 76])} rotate(${conveyorFaceAngle})`}>
        <rect x="-15" y="-10" width="30" height="22" rx="3" fill="#15263a" stroke="#829aaf" />
        <circle className="conveyor-scanner-lamp" cx="-7" r="3" />
        <path d="M1-4h7M1 1h7M1 6h7" stroke="#708a9f" strokeWidth="1.2" />
        {status === 'passed' && <circle className="conveyor-equipment-pulse conveyor-scanner-complete" cx="-7" r="7" fill="#b5fbff" />}
      </g>
    </g>
  )
}

const gateStart = conveyorLength
const gateMouth = gateStart + .1
const openingBack = -.53
const openingFront = .52
const shutterBase = beltHeight + 1
const shutterTop = shutterBase + shutterHeight
const guideTop = shutterTop + shutterHeight + 3
const gateOpening = points([gateMouth, openingBack, shutterTop], [gateMouth, openingFront, shutterTop],
  [gateMouth, openingFront, shutterBase], [gateMouth, openingBack, shutterBase])

export function DispatchBay({ shipped }: { shipped: boolean }) {
  return (
    <g className="conveyor-gate-interior" aria-hidden="true">
      <Block at={[gateStart - .02, -.79, 7]} size={[1.57, 1.58, 20]} tones={paint.frame} />
      <Block at={[gateStart - .01, -.55, 27]} size={[1.39, 1.1, beltHeight - 27]} tones={paint.foundation} stroke="#617b90" />
      <Block at={[gateStart + .16, -.77, 27]} size={[.86, .24, 80]} tones={paint.housing} />
      <Block at={[gateStart + 1.16, -.54, beltHeight]} size={[.22, 1.08, 61]} tones={paint.foundation} stroke="#49647b" />
      <polygon points={points([gateStart + .025, -.47, beltHeight + 1], [gateStart + 1.09, -.47, beltHeight + 1],
        [gateStart + 1.09, .47, beltHeight + 1], [gateStart + .025, .47, beltHeight + 1])}
        fill="#080f1c" stroke="#536b84" />
      {[.22, .47, .72, .97].map(offset => (
        <polyline key={offset} points={points([gateStart + offset, -.46, beltHeight + 1], [gateStart + offset, .46, beltHeight + 1])}
          stroke="#52687e" strokeWidth="1.2" />
      ))}
      <polygon points={gateOpening} fill="#091321" stroke="#3d546b" />
      {shipped && <polyline className="conveyor-equipment-pulse" points={points([gateStart + .12, -.43, beltHeight + 1],
        [gateStart + 1.1, -.43, beltHeight + 1], [gateStart + 1.1, .43, beltHeight + 1])} fill="none" stroke="#8df5ff" strokeWidth="3" />}
    </g>
  )
}

export function DispatchShutter({ id }: { id: string }) {
  const { x: left, y: top, height } = conveyorSceneBounds
  const { x: intakeLimit } = projectFactory([gateStart + .57, 0])

  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id={`${id}-intake-clip`}>
          <rect x={left} y={top} width={intakeLimit - left} height={height} />
        </clipPath>
      </defs>
      <g className="conveyor-gate-shutter">
        <polygon points={gateOpening} fill="#617a92" stroke="#9fb6ca" />
        {[8, 18, 28, 38, 48].map(offset => (
          <polyline key={offset} points={points([gateMouth, openingBack, shutterBase + offset], [gateMouth, openingFront, shutterBase + offset])}
            fill="none" stroke="#263d54" strokeWidth="2.2" />
        ))}
        <polyline points={points([gateMouth, openingBack, shutterBase + 3], [gateMouth, openingFront, shutterBase + 3])}
          fill="none" stroke="#ffb16d" strokeWidth="3" />
      </g>
      <Block at={[gateMouth - .04, openingBack - .1, shutterBase - 4]} size={[.12, .1, guideTop - shutterBase + 4]} tones={paint.frame} />
      <Block at={[gateMouth - .04, openingFront, shutterBase - 4]} size={[.12, .11, guideTop - shutterBase + 4]} tones={paint.frame} />
      <Block at={[gateMouth - .045, openingBack - .1, guideTop]} size={[.13, openingFront - openingBack + .21, 8]} />
    </g>
  )
}

export function DispatchHousing({ shippedCount, shipped }: { shippedCount: number; shipped: boolean }) {
  // The fixed camera sees the near wall, so the hood starts beyond the projected shutter.
  const hoodStart = gateStart + .91
  const hoodWidth = .63
  return (
    <g className="conveyor-gate-foreground" aria-hidden="true">
      <Block at={[hoodStart, .49, 27]} size={[hoodWidth, .31, 80]} tones={paint.housing} />
      <polygon points={points([hoodStart + .04, .801, 61], [hoodStart + .59, .801, 61],
        [hoodStart + .59, .801, 37], [hoodStart + .04, .801, 37])}
        fill="#203449" stroke="#536f84" />
      <Block at={[hoodStart, -.79, shutterTop]} size={[hoodWidth, 1.59, 17]} tones={paint.steel} />
      <Block at={[hoodStart + .12, -.55, 124]} size={[.34, .76, 7]} tones={paint.housing} />
      <polyline points={points([hoodStart, -.55, 109], [hoodStart, .52, 109], [hoodStart, .52, 49])}
        fill="none" stroke="#e4a25c" strokeWidth="2.5" strokeDasharray="5 6" />
      <g transform={`${translate([hoodStart + hoodWidth / 2, .8, 80])} rotate(${conveyorFaceAngle})`}>
        <rect x="-25" y="-11" width="50" height="23" rx="3" fill="#122339" stroke="#7898af" />
        <circle className={shipped ? 'conveyor-gate-lamp-complete' : 'conveyor-lamp'} cx="-17" r="3" />
        <text className="conveyor-gate-count" x="6" y="5" textLength={String(shippedCount).length > 3 ? 29 : undefined}
          lengthAdjust="spacingAndGlyphs">{shippedCount}</text>
        {shipped && <circle className="conveyor-equipment-pulse" cx="-17" r="6" fill="#8df5ff" />}
      </g>
    </g>
  )
}

export function OreContainer({ id, cell, moving = false, entering = false }: {
  id: string
  cell: number
  moving?: boolean
  entering?: boolean
}) {
  return (
    <g className="conveyor-container" transform={translate([cell + .5, 0, beltHeight])}>
      <g className={moving ? 'conveyor-item-moving' : undefined}>
        <g className={entering ? 'conveyor-item-entering' : undefined}>
          <polygon points={points([-.34, -.3], [.36, -.3], [.36, .37], [-.34, .37])} fill="#07111e" opacity=".67" />
          <Block at={[-.3, -.3, 0]} size={[.6, .6, 34]} tones={paint.crate} stroke="#99afc0" />
          <polygon points={points([-.252, -.245, 35], [.252, -.245, 35], [.252, .245, 35], [-.252, .245, 35])}
            fill="#526c84" stroke="#a2b7c6" />
          <polygon points={points([-.12, .05, 36], [-.038, -.13, 36], [.08, -.105, 36], [.15, .04, 36], [.023, .13, 36])}
            fill="#a8d3db" />
          <polygon points={points([-.12, .05, 36], [-.038, -.13, 36], [.023, .13, 36])} fill="#648f9f" />
          <g transform={`${translate([0, .307, 16])} rotate(${conveyorFaceAngle})`}>
            <rect x="-23" y="-10" width="46" height="20" rx="2" fill="#142437" stroke="#7692a7" />
            <text className="conveyor-container-id" y="5" textLength={id.length > 5 ? 39 : undefined} lengthAdjust="spacingAndGlyphs">{id}</text>
          </g>
          <polyline points={points([.303, -.22, 28], [.303, -.22, 8], [.303, .235, 8], [.303, .235, 28])}
            fill="none" stroke="#698397" />
        </g>
      </g>
    </g>
  )
}
