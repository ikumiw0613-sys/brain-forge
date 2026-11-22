const warehouseSize = 16
export const defaultWeights = [12, 19, 27, 31, 36, 43, 51, 58, 64, 69, 76, 84, 91, 103, 116, 128] as const
export const powerPerWeigh = 10
export const ticksPerWeigh = 2
export const shippingReward = 100

type Order = Readonly<{
  id: string
  number: number
  requiredWeight: number
}>

export type Measurement = Readonly<{
  index: number
  weight: number
  qualifies: boolean
}>

type Cost = Readonly<{ count: number; power: number; ticks: number }>
type Completion = Readonly<{
  order: Order
  shipped: Measurement
  log: readonly Measurement[]
  actual: Cost
  linear: Cost
  savedPower: number
}>

type Pending = Readonly<{ index: number; elapsedTicks: number }>

type State = Readonly<{
  weights: readonly number[]
  order: Order
  pending: Pending | null
  log: readonly Measurement[]
  lastTooLight: number
  firstQualifying: number
  history: readonly Completion[]
  totalPower: number
}>

export type WeightSearchAction =
  | { type: 'weigh'; index: number }
  | { type: 'tick' }
  | { type: 'cancelWeigh' }
  | { type: 'resetAttempt' }
  | { type: 'ship'; index: number }
  | { type: 'nextOrder'; sample: number }

export function createWarehouse(weights: readonly number[]): readonly number[] {
  if (weights.length !== warehouseSize || [...weights].some(weight => !Number.isSafeInteger(weight) || weight <= 0) ||
    new Set(weights).size !== warehouseSize) {
    throw new RangeError('The warehouse needs 16 distinct positive integer weights.')
  }
  return [...weights].sort((left, right) => left - right)
}

export function generateOrder(min: number, max: number, sample: number, previous?: Order): Order {
  if (!(sample >= 0 && sample < 1)) throw new RangeError('The random sample must be in [0, 1).')
  const number = (previous?.number ?? 0) + 1
  let requiredWeight = min + Math.floor(sample * (max - min + (previous ? 0 : 1)))
  // Sample the integer range with the previous threshold removed.
  if (previous && requiredWeight >= previous.requiredWeight) requiredWeight++
  return { number, id: `ORD-${String(number).padStart(3, '0')}`, requiredWeight }
}

function emptyAttempt(size: number) {
  return {
    pending: null,
    log: [],
    lastTooLight: -1,
    firstQualifying: size,
  }
}

function beginOrder(weights: readonly number[], sample: number, previous?: Order) {
  return {
    order: generateOrder(weights[0], weights[weights.length - 1], sample, previous),
    ...emptyAttempt(weights.length),
  }
}

export function createWeightSearch(weights: readonly number[], sample: number): State {
  const warehouse = createWarehouse(weights)
  return { weights: warehouse, ...beginOrder(warehouse, sample), history: [], totalPower: 0 }
}

export function lowerBound(weights: readonly number[], target: number): number {
  let start = 0
  let end = weights.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (weights[middle] < target) start = middle + 1
    else end = middle
  }
  return start
}

function cost(count: number): Cost {
  return { count, power: count * powerPerWeigh, ticks: count * ticksPerWeigh }
}

function confirmedIndex(state: State): number | null {
  const { lastTooLight, firstQualifying, weights } = state
  return firstQualifying < weights.length && firstQualifying === lastTooLight + 1 ? firstQualifying : null
}

function currentCompletion(state: State): Completion | undefined {
  const latest = state.history.at(-1)
  return latest?.order.id === state.order.id ? latest : undefined
}

export function assessSearchResult(state: State, index: number) {
  const { weights, order, log } = state
  const correct = index === lowerBound(weights, order.requiredWeight)
  const verified = correct && (index === weights.length
    ? state.lastTooLight === weights.length - 1
    : index === confirmedIndex(state))
  return { correct, verified, cost: cost(log.length) }
}

export function weightSearchReducer(state: State, action: WeightSearchAction): State {
  const { weights, order, pending, log } = state
  switch (action.type) {
    case 'weigh':
      if (pending || currentCompletion(state) ||
        !Number.isInteger(action.index) || action.index < 0 || action.index >= weights.length) return state
      return { ...state, pending: { index: action.index, elapsedTicks: 0 } }
    case 'tick': {
      if (!pending) return state
      const { index } = pending
      const elapsedTicks = pending.elapsedTicks + 1
      if (elapsedTicks < ticksPerWeigh) return { ...state, pending: { index, elapsedTicks } }
      const weight = weights[index]
      const qualifies = weight >= order.requiredWeight
      return {
        ...state,
        pending: null,
        log: [...log, { index, weight, qualifies }],
        lastTooLight: qualifies ? state.lastTooLight : Math.max(state.lastTooLight, index),
        firstQualifying: qualifies ? Math.min(state.firstQualifying, index) : state.firstQualifying,
        totalPower: state.totalPower + powerPerWeigh,
      }
    }
    case 'cancelWeigh':
      return pending ? { ...state, pending: null } : state
    case 'resetAttempt':
      if (pending || currentCompletion(state)) return state
      return { ...state, ...emptyAttempt(weights.length) }
    case 'ship': {
      if (pending || currentCompletion(state) || action.index !== confirmedIndex(state)) return state
      const correctIndex = lowerBound(weights, order.requiredWeight)
      if (action.index !== correctIndex) return state
      const actual = cost(log.length)
      // Linear search weighs each position through the first qualifying ore, inclusive.
      const linear = cost(correctIndex + 1)
      const completion: Completion = {
        order, shipped: { index: correctIndex, weight: weights[correctIndex], qualifies: true },
        log, actual, linear, savedPower: linear.power - actual.power,
      }
      return { ...state, history: [...state.history, completion] }
    }
    case 'nextOrder':
      if (!currentCompletion(state)) return state
      return { ...state, ...beginOrder(weights, action.sample, order) }
  }
}

export function getWeightSearchView(state: State) {
  const { order, pending, log, weights, history } = state
  const first = state.lastTooLight + 1
  const last = Math.min(state.firstQualifying, weights.length - 1)
  const measured = new Map(log.map(result => [result.index, result]))
  return {
    order, pending, log,
    history: history.map(({ order, actual, savedPower }) => ({ order, actual, savedPower })),
    slots: weights.map((_, index) => ({
      index, measurement: measured.get(index), candidate: index >= first && index <= last,
    })),
    candidates: { first, last },
    confirmed: confirmedIndex(state),
    completion: currentCompletion(state),
    cost: cost(log.length),
    totalPower: state.totalPower,
    credits: history.length * shippingReward,
  }
}

export type WeightSearchView = ReturnType<typeof getWeightSearchView>
