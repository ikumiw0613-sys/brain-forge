import { conveyorLength, moveConveyorItems } from './conveyor'
import type { ConveyorItem, ConveyorState } from './conveyor'

export const productionInterval = 2
export const shippingCapacity = 1
export const shippingWindow = 20

export type MinerStatus = 'waiting' | 'supplied' | 'blocked'
type Shipment = Readonly<{ id: string; tick: number }>

export type FactoryState = ConveyorState & Readonly<{
  producedCount: number
  shippedCount: number
  nextItemId: number
  minerStatus: MinerStatus
  recentShipments: readonly Shipment[]
}>

export function createFactoryState(): FactoryState {
  return {
    tick: 0,
    running: false,
    speed: 1,
    items: [],
    producedCount: 0,
    shippedCount: 0,
    nextItemId: 1,
    minerStatus: 'waiting',
    recentShipments: [],
  }
}

export function trySupplyOre(items: readonly ConveyorItem[], nextItemId: number): ConveyorItem | undefined {
  if (items.some(item => item.position === 0)) return undefined
  return { id: `C-${String(nextItemId).padStart(2, '0')}`, position: 0 }
}

export function tickFactory(state: FactoryState): FactoryState {
  if (!state.running) return state

  const tick = state.tick + 1
  // The one-cell exit can provide at most one container to the gate before movement.
  const shipped = state.items.find(item => item.position === conveyorLength - 1)
  const items = moveConveyorItems(shipped ? state.items.filter(item => item !== shipped) : state.items)

  const productionDue = tick % productionInterval === 0
  const supplied = productionDue ? trySupplyOre(items, state.nextItemId) : undefined
  if (supplied) items.unshift(supplied)

  const recentShipments = state.recentShipments.filter(shipment => shipment.tick > tick - shippingWindow)
  if (shipped) recentShipments.push({ id: shipped.id, tick })

  const produced = Number(supplied !== undefined)
  return {
    ...state,
    items,
    producedCount: state.producedCount + produced,
    shippedCount: state.shippedCount + Number(shipped !== undefined),
    nextItemId: state.nextItemId + produced,
    minerStatus: supplied ? 'supplied' : productionDue ? 'blocked' : 'waiting',
    recentShipments,
    tick,
  }
}
