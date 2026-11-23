type Point = readonly [number, number]

const wideRoads = [
  'M23 127 59 94H927L1031 163V313L995 351H35',
  'M1031 313V479L985 511H877 M35 351 54 394H236L283 424 M399 351 423 377H544',
]
const narrowRoads = [
  'M317 72V928L277 962H249',
  'M317 137H170 M317 308H183 M317 486H183 M317 682H185',
]

function Fence({ points }: { points: readonly Point[] }) {
  const ground = points.map(point => point.join(',')).join(' ')
  const top = points.map(([x, y]) => `${x},${y - 13}`).join(' ')
  return (
    <g className="map-fence">
      <polygon points={`${top} ${[...points].reverse().map(point => point.join(',')).join(' ')}`} />
      <polyline points={ground} /><polyline points={top} />
      {points.slice(1).map(([x, y], i) => {
        const [fromX, fromY] = points[i]
        const sections = Math.ceil(Math.hypot(x - fromX, y - fromY) / 49)
        return Array.from({ length: sections }, (_, j) => {
          const px = fromX + (x - fromX) * j / sections
          const py = fromY + (y - fromY) * j / sections
          return <path key={`${i}:${j}`} d={`M${px} ${py}v-15`} />
        })
      })}
    </g>
  )
}

function Tree({ at, scale }: { at: Point; scale: number }) {
  return (
    <g className="map-tree" transform={`translate(${at.join(' ')}) scale(${scale})`}>
      <ellipse cx="5" cy="2" rx="15" ry="6" className="map-tree-shadow" />
      <path d="M0 3v-13" className="map-tree-trunk" />
      <path d="m-12-7-4-10 9-12 13-3 12 10-2 12-10 8z" className="map-tree-crown" />
      <path d="m-16-17 9-12 13-3 8 8-14 6z" className="map-tree-light" />
    </g>
  )
}

function StreetLight({ at, scale }: { at: Point; scale: number }) {
  return (
    <g className="map-streetlight" transform={`translate(${at.join(' ')}) scale(${scale})`}>
      <path d="m-4 2 9-3M0 0v-25l11-4" />
      <path className="map-light-head" d="m10-29 7 2-6 2-5-2z" />
    </g>
  )
}

function YardSign({ at, scale }: { at: Point; scale: number }) {
  return (
    <g className="map-yard-sign" transform={`translate(${at.join(' ')}) scale(${scale})`}>
      <path d="M0 0v-21m19 24v-17" />
      <path className="map-sign-face" d="M-3-25l25 7v12l-25-7z" />
      <path className="map-sign-arrow" d="m3-18 12 3m-4-6 4 6-5 2" />
    </g>
  )
}

export function SiteScenery({ narrow }: { narrow: boolean }) {
  const roads = narrow ? narrowRoads : wideRoads
  const scale = narrow ? .63 : 1
  const trees: readonly Point[] = narrow
    ? [[43, 93], [333, 119], [336, 251], [53, 278], [61, 492], [333, 458], [57, 701], [332, 780], [45, 998], [331, 995]]
    : [[170, 85], [195, 78], [346, 93], [698, 96], [1036, 115], [1052, 135], [1070, 399], [57, 557], [83, 569], [306, 569], [690, 566], [1020, 568], [1050, 552]]
  const lights: readonly Point[] = narrow
    ? [[298, 166], [299, 297], [302, 485], [297, 691], [318, 871]]
    : [[320, 114], [672, 114], [994, 196], [928, 366], [618, 371], [271, 365], [1016, 491]]
  const fence: readonly Point[] = narrow
    ? [[16, 141], [16, 51], [44, 25], [311, 25], [354, 67], [354, 322]]
    : [[17, 158], [17, 82], [82, 27], [952, 27], [1071, 110], [1071, 288]]

  return (
    <g className="map-scenery" aria-hidden="true">
      <g className="map-yard-roads">
        {roads.map(d => <g key={d}>
          <path className="map-road-curb" d={d} />
          <path className="map-road-surface" d={d} />
          <path className="map-road-marking" d={d} />
        </g>)}
      </g>
      <Fence points={fence} />
      <Fence points={narrow ? [[16, 968], [16, 1004], [221, 1004], [354, 1004], [354, 963]] : [[18, 450], [18, 543], [80, 581], [1021, 581], [1070, 533], [1070, 439]]} />
      {trees.map(at => <Tree key={at.join(',')} at={at} scale={scale} />)}
      {lights.map(at => <StreetLight key={at.join(',')} at={at} scale={scale} />)}
      <YardSign at={narrow ? [289, 571] : [952, 356]} scale={scale} />
      <g className="map-ground-marker" transform={`translate(${narrow ? '294 112' : '68 152'}) scale(${scale})`}>
        <path d="M-10 0h19m-4-4 4 4-4 4" />
      </g>
    </g>
  )
}
