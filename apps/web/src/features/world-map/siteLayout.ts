import { projectFactory } from '../../renderers/conveyorProjection'
import type { FacilityKind } from './FacilityBuilding'

type Point = readonly [x: number, y: number]
const ports = {
  west: projectFactory([0, 1.78]),
  east: projectFactory([2.05, 1.78]),
  front: projectFactory([.95, 2.02]),
}
type Port = readonly [facility: FacilityKind, side: keyof typeof ports]
type Connection = Readonly<{ from: Port; to: Port; via: readonly [Point, Point]; future?: boolean }>
export type SiteLayout = Readonly<{
  width: number
  height: number
  scale: number
  positions: Record<FacilityKind, Point>
  connections: readonly Connection[]
}>

export const wideSite: SiteLayout = {
  width: 1056, height: 560, scale: 1,
  positions: { warehouse: [140, 151], factory: [466, 155], shipping: [797, 151], sorting: [270, 366], logistics: [689, 370] },
  connections: [
    { from: ['warehouse', 'east'], to: ['factory', 'west'], via: [[302, 280], [346, 220]] },
    { from: ['factory', 'east'], to: ['shipping', 'west'], via: [[629, 284], [674, 217]] },
    { from: ['warehouse', 'front'], to: ['sorting', 'west'], via: [[89, 338], [133, 405]], future: true },
    { from: ['shipping', 'east'], to: ['logistics', 'east'], via: [[991, 294], [920, 416]], future: true },
  ],
}

export const narrowSite: SiteLayout = {
  width: 370, height: 818, scale: .61,
  positions: { warehouse: [119, 104], factory: [119, 288], shipping: [119, 472], sorting: [76, 690], logistics: [249, 690] },
  connections: [
    { from: ['warehouse', 'east'], to: ['factory', 'east'], via: [[271, 196], [271, 319]] },
    { from: ['factory', 'west'], to: ['shipping', 'west'], via: [[29, 333], [29, 492]] },
    { from: ['shipping', 'front'], to: ['sorting', 'west'], via: [[46, 580], [24, 655]], future: true },
    { from: ['shipping', 'east'], to: ['logistics', 'east'], via: [[311, 545], [338, 674]], future: true },
  ],
}

export function connectionPoints(layout: SiteLayout, { from, to, via }: Connection): Point[] {
  const portPosition = ([facility, side]: Port): Point => {
    const [x, y] = layout.positions[facility]
    const offset = ports[side]
    return [x + offset.x * layout.scale, y + offset.y * layout.scale]
  }
  return [portPosition(from), ...via, portPosition(to)]
}
