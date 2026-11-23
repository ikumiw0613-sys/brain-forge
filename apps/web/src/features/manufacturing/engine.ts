export const productionTicks = 20
export const productRevenue = 100
export const dashboardWindowTicks = 500
export const supplyPresets = [4, 16, 64] as const
export type SupplyTicks = typeof supplyPresets[number]
export type MachineStatus = 'WAITING' | 'RECEIVED' | 'PROCESSING' | 'COMPLETED'
type TickTotals = Readonly<{ completed: number; totalWaiting: number; totalProcessing: number }>
export type ManufacturingState = Readonly<{
  tick: number
  running: boolean
  status: MachineStatus
  supplyTicks: SupplyTicks
  waiting: number
  progress: number
  previousTotals: readonly TickTotals[]
}> & TickTotals

export function createManufacturingState(supplyTicks: SupplyTicks = 16): ManufacturingState {
  return { tick: 0, running: false, status: 'WAITING', supplyTicks, waiting: 0, progress: 0,
    completed: 0, totalWaiting: 0, totalProcessing: 0, previousTotals: [] }
}

export function getManufacturingDashboard(state: ManufacturingState) {
  const ticks = Math.min(state.tick, dashboardWindowTicks)
  const baseline = state.previousTotals[(state.tick - ticks) % dashboardWindowTicks]
  // The baseline already includes completions at its Tick, so the window is (tick - ticks, tick].
  const completedInWindow = state.completed - (baseline?.completed ?? 0)
  const perHundred = (value: number) => ticks === 0 ? 0 : value * 100 / ticks
  return {
    revenue: state.completed * productRevenue,
    revenueRate: perHundred(completedInWindow * productRevenue),
    windowTicks: ticks,
    productionRate: perHundred(completedInWindow),
    utilization: perHundred(state.totalProcessing - (baseline?.totalProcessing ?? 0)),
    waitingRate: perHundred(state.totalWaiting - (baseline?.totalWaiting ?? 0)),
  }
}

// The supplier decides whether the currently outstanding request has arrived.
export function tickManufacturing(state: ManufacturingState,
  arrived = (state.status === 'COMPLETED' ? 1 : state.waiting + 1) >= state.supplyTicks): ManufacturingState {
  if (!state.running) return state
  const tick = state.tick + 1
  const { completed, totalWaiting, totalProcessing } = state
  // Keep the cumulative totals before each Tick so the window is two snapshots apart.
  const previousTotals = state.previousTotals.slice()
  previousTotals[state.tick % dashboardWindowTicks] = { completed, totalWaiting, totalProcessing }
  if (state.status === 'WAITING' || state.status === 'COMPLETED') {
    const waiting = state.status === 'COMPLETED' ? 1 : state.waiting + 1
    return { ...state, tick, previousTotals, waiting, progress: 0, totalWaiting: totalWaiting + 1,
      status: arrived ? 'RECEIVED' : 'WAITING' }
  }
  const progress = state.progress + 1
  const finished = progress === productionTicks
  return { ...state, tick, previousTotals, progress, totalProcessing: totalProcessing + 1,
    status: finished ? 'COMPLETED' : 'PROCESSING', completed: completed + Number(finished) }
}
