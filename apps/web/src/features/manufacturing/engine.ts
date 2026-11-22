export const productionTicks = 20
export const productRevenue = 100
export const supplyPresets = [4, 16, 64] as const
export type SupplyTicks = typeof supplyPresets[number]
export type MachineStatus = 'WAITING' | 'RECEIVED' | 'PROCESSING' | 'COMPLETED'
export type ManufacturingState = Readonly<{
  tick: number
  running: boolean
  status: MachineStatus
  supplyTicks: SupplyTicks
  waiting: number
  progress: number
  completed: number
  totalWaiting: number
  totalProcessing: number
}>

export function createManufacturingState(supplyTicks: SupplyTicks = 16): ManufacturingState {
  return { tick: 0, running: false, status: 'WAITING', supplyTicks, waiting: 0, progress: 0,
    completed: 0, totalWaiting: 0, totalProcessing: 0 }
}

// The supplier decides whether the currently outstanding request has arrived.
export function tickManufacturing(state: ManufacturingState,
  arrived = (state.status === 'COMPLETED' ? 1 : state.waiting + 1) >= state.supplyTicks): ManufacturingState {
  if (!state.running) return state
  const tick = state.tick + 1
  if (state.status === 'WAITING' || state.status === 'COMPLETED') {
    const waiting = state.status === 'COMPLETED' ? 1 : state.waiting + 1
    return { ...state, tick, waiting, progress: 0, totalWaiting: state.totalWaiting + 1,
      status: arrived ? 'RECEIVED' : 'WAITING' }
  }
  const progress = state.progress + 1
  const finished = progress === productionTicks
  return { ...state, tick, progress, totalProcessing: state.totalProcessing + 1,
    status: finished ? 'COMPLETED' : 'PROCESSING', completed: state.completed + Number(finished) }
}
