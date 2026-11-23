import { projectedPoints, projectedTranslate } from '../../renderers/conveyorProjection'

type Box = readonly [x: number, y: number, width: number, depth: number, height: number, base?: number]

function Structure({ box: [x, y, w, d, h, z = 0], accent = false }: { box: Box; accent?: boolean }) {
  return (
    <g className={accent ? 'map-structure map-structure-accent' : 'map-structure'}>
      <polygon className="map-front" points={projectedPoints([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h])} />
      <polygon className="map-side" points={projectedPoints([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h])} />
      <polygon className="map-roof" points={projectedPoints([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} />
    </g>
  )
}

function RoofSeams({ box: [x, y, width, depth, height, base = 0] }: { box: Box }) {
  return (
    <g className="map-roof-seams">
      {[.25, .5, .75].map(offset => {
        const row = y + depth * offset
        return <polyline key={offset} points={projectedPoints(
          [x + .04, row, base + height], [x + width - .04, row, base + height],
        )} />
      })}
    </g>
  )
}

function LoadingDoor({ x, y, wide }: { x: number; y: number; wide: boolean }) {
  const half = wide ? 18 : 14
  return (
    <g transform={projectedTranslate([x, y, 1])}>
      <path className="map-door" d={`M-${half} -5v-24l${2 * half} ${wide ? 11 : 8}v24z`} />
      {(wide ? [-25, -20, -15, -10] : [-25, -19, -13]).map(row => (
        <path className="map-shutter-slat" key={row} d={`M${-half + 2} ${row}l${half * 2 - 4} ${wide ? 10 : 7}`} />
      ))}
      <path className="map-door-light" d={`M${-half + 2} -28l${half * 2 - 4} ${wide ? 10 : 7}`} />
    </g>
  )
}

function PalletStack({ x, y }: { x: number; y: number }) {
  return (
    <g className="map-pallet-stack">
      <Structure box={[x, y, .28, .29, 3]} />
      <Structure box={[x + .02, y + .02, .24, .24, 11, 3]} />
      <Structure box={[x + .06, y + .06, .16, .17, 8, 14]} />
    </g>
  )
}

function LoadingTruck() {
  return (
    <g className="map-loading-truck">
      {[1.23, 1.65].map(x => <circle key={x} r="4" transform={projectedTranslate([x, 1.86, 2])} />)}
      <Structure box={[1.10, 1.56, .45, .29, 14, 5]} />
      <g className="map-truck-cab"><Structure box={[1.55, 1.56, .23, .29, 10, 5]} /></g>
    </g>
  )
}

const structures = {
  warehouse: {
    boxes: [[.14, .3, 1.75, 1.08, 63], [.31, .45, 1.45, .38, 8, 63]],
    doors: [[.43, 1.38], [.95, 1.38], [1.47, 1.38]],
  },
  factory: {
    boxes: [[.33, .22, .25, .24, 98], [.74, .23, .24, .24, 110], [.18, .53, 1.6, 1.03, 50], [.39, .67, .58, .48, 13, 50], [1.13, .73, .4, .4, 8, 50]],
    doors: [[.54, 1.56], [1.21, 1.56]],
  },
  shipping: {
    boxes: [[.16, .35, 1.58, .78, 44], [.21, 1.14, 1.45, .7, 8]],
    doors: [[.51, 1.13], [1.25, 1.13]],
  },
  sorting: {
    boxes: [[.2, .28, 1.55, .42, 28], [.91, .72, .46, .53, 28], [.25, 1.26, 1.5, .43, 28], [.4, 1.34, 1.16, .17, 6, 28]],
    doors: [[.57, 1.69], [1.15, 1.69]],
  },
  analysis: {
    boxes: [[.22, .42, 1.58, 1.0, 46], [.30, .48, 1.42, .28, 15, 46], [1.28, .53, .27, .22, 22, 61], [1.38, .62, .07, .06, 19, 83]],
    doors: [[.96, 1.42]],
  },
  logistics: {
    boxes: [[.27, .37, 1.52, 1.18, 27], [.6, .52, .79, .7, 57, 27], [.74, .64, .46, .42, 8, 84], [.95, .83, .06, .06, 22, 92]],
    doors: [[.67, 1.55], [1.38, 1.55]],
  },
} satisfies Record<string, { boxes: Box[]; doors: [number, number][] }>

export type FacilityKind = keyof typeof structures

export function FacilityBuilding({ kind, lamp }: { kind: FacilityKind; lamp?: 'weighing' | 'producing' }) {
  const { boxes, doors } = structures[kind]
  return (
    <g className="map-building" aria-hidden="true">
      <Structure box={[0, 0, 2.05, 2.02, 9, -9]} />
      <polygon className="map-platform-edge" points={projectedPoints([.06, .07, 1], [1.99, .07, 1], [1.99, 1.95, 1], [.06, 1.95, 1])} />
      <g className="map-buildings">
        {boxes.map((box, index) => (
          <g key={index}>
            <Structure box={box} accent={index > (kind === 'factory' ? 2 : 0)} />
            {((kind === 'warehouse' && index === 0) || (kind === 'factory' && index === 2)) && <RoofSeams box={box} />}
          </g>
        ))}
      </g>
      {kind === 'factory' && <polyline className="map-factory-pipe" points={projectedPoints(
        [1.76, .65, 47], [1.93, .65, 47], [1.93, .65, 19], [1.93, 1.27, 19], [1.93, 1.27, 5],
      )} />}
      {doors.map(([x, y]) => <LoadingDoor key={x} x={x} y={y} wide={kind === 'warehouse' || kind === 'shipping'} />)}
      {kind === 'warehouse' && <><PalletStack x={.25} y={1.57} /><PalletStack x={.62} y={1.68} /></>}
      {kind === 'shipping' && <>
        <polyline className="map-dock-paint" points={projectedPoints([.35, 1.39, 9], [.35, 1.79, 9], [1.53, 1.79, 9])} />
        <PalletStack x={.53} y={1.60} /><LoadingTruck />
      </>}
      {(kind === 'sorting' || kind === 'logistics') && <polyline className="map-closed-barrier" points={projectedPoints(
        [.30, 1.88, 8], [1.68, 1.88, 8],
      )} />}
      {kind === 'analysis' && [.52, .69, 1.41, 1.58].map(x => (
        <polygon key={x} className="map-analysis-window"
          points={projectedPoints([x - .06, 1.42, 31], [x + .06, 1.42, 31], [x + .06, 1.42, 37], [x - .06, 1.42, 37])} />
      ))}
      <path className="map-route-mark" d={`M${projectedPoints([.21, 1.86])}L${projectedPoints([1.77, 1.86])}`} />
      {lamp && <g transform={projectedTranslate(lamp === 'weighing' ? [1.7, .42, 63] : [1.55, .68, 50])}>
        <circle className="map-activity-lamp" data-activity={lamp} r="8" />
        <circle className="map-activity-core" r="3.5" />
      </g>}
    </g>
  )
}
