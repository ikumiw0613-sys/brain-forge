import { conveyorLength, moveConveyorItems } from './conveyor'
import type { ConveyorItem, ConveyorState } from './conveyor'

export const productionInterval = 2
export const shippingCapacity = 1
export const shippingWindow = 20
export const scannerPosition = 3
export const inspectionDuration = 2

export type MinerStatus = 'waiting' | 'supplied' | 'blocked'
export type FactoryItem = ConveyorItem & Readonly<{
  inspectionStatus: 'pending' | 'inspecting' | 'passed'
  inspectionTicks: number
}>
type Shipment = Readonly<{ id: string; tick: number }>

export type FactoryState = Omit<ConveyorState, 'items'> & Readonly<{
  items: readonly FactoryItem[]
  producedCount: number
  shippedCount: number
  inspectedCount: number
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
    inspectedCount: 0,
    nextItemId: 1,
    minerStatus: 'waiting',
    recentShipments: [],
  }
}

export function trySupplyOre(items: readonly ConveyorItem[], nextItemId: number): FactoryItem | undefined {
  if (items.some(item => item.position === 0)) return undefined
  return { id: `C-${String(nextItemId).padStart(2, '0')}`, position: 0, inspectionStatus: 'pending', inspectionTicks: 0 }
}

export function tickFactory(state: FactoryState): FactoryState {
  if (!state.running) return state

  const tick = state.tick + 1
  // The one-cell exit can provide at most one container to the gate before movement.
  const shipped = state.items.find(item => item.position === conveyorLength - 1 && item.inspectionStatus === 'passed')
  const remaining = shipped ? state.items.filter(item => item !== shipped) : state.items
  const inspecting = remaining.find(item => item.position === scannerPosition && item.inspectionStatus === 'inspecting')
  const inspectionTicks = inspecting ? inspecting.inspectionTicks + 1 : 0
  const completed = inspectionTicks === inspectionDuration
  const updated = inspecting ? remaining.map<FactoryItem>(item => item === inspecting
    ? { ...item, inspectionTicks, inspectionStatus: completed ? 'passed' : 'inspecting' }
    : item) : remaining

  // The item being inspected at the start stays put even on its completion tick.
  const items = moveConveyorItems(updated, item => item.id !== inspecting?.id &&
    (item.position < scannerPosition || item.inspectionStatus === 'passed'))
  const arrival = items.findIndex(item => item.position === scannerPosition && item.inspectionStatus === 'pending')
  if (arrival !== -1) items[arrival] = { ...items[arrival], inspectionStatus: 'inspecting', inspectionTicks: 0 }

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
    inspectedCount: state.inspectedCount + Number(completed),
    nextItemId: state.nextItemId + produced,
    minerStatus: supplied ? 'supplied' : productionDue ? 'blocked' : 'waiting',
    recentShipments,
    tick,
  }
}
