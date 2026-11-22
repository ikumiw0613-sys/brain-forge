import { advanceWeightSearchOrder, assessSearchResult, createWeightSearch, generateWeights, weightSearchReducer } from '../weight-search/engine'
import { createManufacturingState, tickManufacturing } from './engine'
import type { SupplyTicks } from './engine'

export const supplyWarehouseSize = 64
export const defaultSupplySeed = 42

function sample(seed: number, position: number) {
  let value = (seed + Math.imul(position, 0x9e3779b9)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 2 ** 32
}

export function createPythonSupply(supplyTicks: SupplyTicks, seed: number) {
  let position = 0
  const weights = generateWeights(supplyWarehouseSize, () => sample(seed, ++position))
  return { line: createManufacturingState(supplyTicks), search: createWeightSearch(weights, sample(seed, ++position)), seed }
}

export type PythonSupply = ReturnType<typeof createPythonSupply>

export function tickPythonSupply(state: PythonSupply): PythonSupply {
  const { line, search, seed } = state
  if (!line.running) return state
  if (line.status === 'COMPLETED') {
    return {
      ...state,
      line: { ...line, status: 'WAITING', waiting: 0, progress: 0 },
      search: advanceWeightSearchOrder(search, sample(seed, supplyWarehouseSize + search.order.number + 1)),
    }
  }
  if (line.status === 'WAITING' && !search.pending) return state
  return { ...state, line: tickManufacturing(line, false), search: weightSearchReducer(search, { type: 'tick' }) }
}

export function deliverPythonPart(state: PythonSupply, index: number): PythonSupply {
  if (!state.line.running || state.line.status !== 'WAITING' || state.search.pending ||
    !assessSearchResult(state.search, index).verified) return state
  return { ...state, line: { ...state.line, status: 'RECEIVED' } }
}
