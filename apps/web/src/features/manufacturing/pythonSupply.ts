import { advanceWeightSearchOrder, assessSearchResult, createWeightSearch, generateWeights, weightSearchReducer } from '../../factory/warehouse/engine'
import { createManufacturingState, tickManufacturing } from '../../factory/manufacturing/engine'
import type { SupplyTicks } from '../../factory/manufacturing/engine'
import type { Measurement } from '../../factory/warehouse/engine'

export const supplyWarehouseSize = 64
export const defaultSupplySeed = 42

export function supplySample(seed: number, position: number) {
  let value = (seed + Math.imul(position, 0x9e3779b9)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 2 ** 32
}

export function generateSupplyWeights(seed: number, size: number) {
  let position = 0
  return generateWeights(size, () => supplySample(seed, ++position))
}

export function createPythonSupply(supplyTicks: SupplyTicks, seed: number, sizeOrWeights: number | readonly number[] = supplyWarehouseSize) {
  const generate = typeof sizeOrWeights === 'number'
  const weights = generate ? generateSupplyWeights(seed, sizeOrWeights) : sizeOrWeights
  return {
    line: createManufacturingState(supplyTicks),
    // Order samples are indexed by order number, independently of warehouse generation and weighing.
    search: createWeightSearch(weights, supplySample(seed, weights.length + 1), { allowDuplicates: !generate }),
    seed,
    lastDelivery: null as (Measurement & { orderId: string }) | null,
  }
}

export type PythonSupply = ReturnType<typeof createPythonSupply>

export function tickPythonSupply(state: PythonSupply): PythonSupply {
  const { line, search, seed } = state
  if (!line.running) return state
  if (line.status === 'COMPLETED') {
    return {
      ...state,
      line: { ...line, status: 'WAITING', waiting: 0, progress: 0 },
      search: advanceWeightSearchOrder(search, supplySample(seed, search.weights.length + search.order.number + 1)),
    }
  }
  if (line.status === 'WAITING' && !search.pending) return state
  return { ...state, line: tickManufacturing(line, false), search: weightSearchReducer(search, { type: 'tick' }) }
}

export function deliverPythonPart(state: PythonSupply, index: number): PythonSupply {
  if (!state.line.running || state.line.status !== 'WAITING' || state.search.pending ||
    !assessSearchResult(state.search, index).verified) return state
  const part = state.search.log.find(entry => entry.index === index)
  if (!part) return state
  return {
    ...state,
    line: { ...state.line, status: 'RECEIVED' },
    lastDelivery: { index: part.index, weight: part.weight, qualifies: part.qualifies, orderId: state.search.order.id },
  }
}
