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

const structures = {
  warehouse: {
    boxes: [[.14, .3, 1.75, 1.08, 63], [.31, .45, 1.45, .38, 8, 63], [.24, 1.52, .32, .27, 14], [.74, 1.59, .32, .27, 14]],
    doors: [[.43, 1.38], [.95, 1.38], [1.47, 1.38]],
  },
  factory: {
    boxes: [[.33, .22, .25, .24, 98], [.74, .23, .24, .24, 110], [.18, .53, 1.6, 1.03, 50], [.39, .67, .58, .48, 13, 50], [1.13, .73, .4, .4, 8, 50]],
    doors: [[.54, 1.56], [1.21, 1.56]],
  },
  shipping: {
    boxes: [[.16, .35, 1.58, .78, 44], [.21, 1.14, 1.45, .7, 8], [.41, 1.23, .31, .36, 19, 8], [1.01, 1.48, .44, .26, 20, 8]],
    doors: [[.51, 1.13], [1.25, 1.13]],
  },
  sorting: {
    boxes: [[.2, .28, 1.55, .42, 28], [.91, .72, .46, .53, 28], [.25, 1.26, 1.5, .43, 28], [.4, 1.34, 1.16, .17, 6, 28]],
    doors: [[.57, 1.69], [1.15, 1.69]],
  },
  logistics: {
    boxes: [[.27, .37, 1.52, 1.18, 27], [.6, .52, .79, .7, 57, 27], [.74, .64, .46, .42, 8, 84], [.95, .83, .06, .06, 22, 92]],
    doors: [[.67, 1.55], [1.38, 1.55]],
  },
} satisfies Record<string, { boxes: Box[]; doors: [number, number][] }>

export type FacilityKind = keyof typeof structures

export function FacilityBuilding({ kind }: { kind: FacilityKind }) {
  const { boxes, doors } = structures[kind]
  return (
    <svg className="map-building" viewBox="-111 -98 310 226" aria-hidden="true">
      <Structure box={[0, 0, 2.05, 2.02, 9, -9]} />
      <polygon className="map-platform-edge" points={projectedPoints([.06, .07, 1], [1.99, .07, 1], [1.99, 1.95, 1], [.06, 1.95, 1])} />
      {boxes.map((box, index) => <Structure key={index} box={box} accent={index > (kind === 'factory' ? 2 : 0)} />)}
      {doors.map(([x, y]) => (
        <g key={x} transform={projectedTranslate([x, y, 1])}>
          <path className="map-door" d="M-14-4v-22l28 8v22z" />
          <path className="map-door-light" d="m-12-24 24 7" />
        </g>
      ))}
      <path className="map-route-mark" d={`M${projectedPoints([.21, 1.86])}L${projectedPoints([1.77, 1.86])}`} />
    </svg>
  )
}
