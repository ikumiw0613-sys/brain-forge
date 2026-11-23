import { projectFactory } from '../../renderers/conveyorProjection'
import type { FacilityKind } from './FacilityBuilding'

type Point = readonly [x: number, y: number]
const ports = {
  west: projectFactory([0, 1.78]),
  east: projectFactory([2.05, 1.78]),
  front: projectFactory([.95, 2.02]),
}
type Port = readonly [facility: FacilityKind, side: keyof typeof ports]
type Connection = Readonly<{ from: Port; to: Port; via: readonly [Point, Point]; kind: 'main' | 'analysis' | 'future' }>
export type SiteLayout = Readonly<{
  width: number
  height: number
  scale: number
  positions: Record<FacilityKind, Point>
  connections: readonly Connection[]
}>

export const wideSite: SiteLayout = {
  width: 1090, height: 600, scale: 1,
  positions: { warehouse: [153, 136], factory: [475, 152], shipping: [797, 168], analysis: [469, 396], sorting: [161, 390], logistics: [801, 401] },
  connections: [
    { from: ['warehouse', 'east'], to: ['factory', 'west'], via: [[291, 260], [352, 195]], kind: 'main' },
    { from: ['factory', 'east'], to: ['shipping', 'west'], via: [[616, 278], [678, 211]], kind: 'main' },
    { from: ['factory', 'front'], to: ['analysis', 'west'], via: [[363, 313], [345, 426]], kind: 'analysis' },
    { from: ['warehouse', 'front'], to: ['sorting', 'west'], via: [[81, 321], [48, 416]], kind: 'future' },
    { from: ['shipping', 'east'], to: ['logistics', 'east'], via: [[1009, 311], [986, 460]], kind: 'future' },
  ],
}

export const narrowSite: SiteLayout = {
  width: 370, height: 1020, scale: .61,
  positions: { warehouse: [119, 104], factory: [119, 288], shipping: [119, 472], analysis: [119, 686], sorting: [76, 879], logistics: [249, 879] },
  connections: [
    { from: ['warehouse', 'east'], to: ['factory', 'east'], via: [[258, 196], [258, 327]], kind: 'main' },
    { from: ['factory', 'west'], to: ['shipping', 'west'], via: [[29, 333], [29, 492]], kind: 'main' },
    { from: ['factory', 'east'], to: ['analysis', 'east'], via: [[281, 384], [269, 715]], kind: 'analysis' },
    { from: ['shipping', 'front'], to: ['sorting', 'west'], via: [[32, 603], [24, 831]], kind: 'future' },
    { from: ['shipping', 'east'], to: ['logistics', 'east'], via: [[346, 566], [346, 892]], kind: 'future' },
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
