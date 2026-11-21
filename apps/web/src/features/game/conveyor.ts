export const conveyorLength = 8
export const conveyorSpeeds = [0.5, 1, 2] as const

export type ConveyorSpeed = typeof conveyorSpeeds[number]
export type ConveyorItem = Readonly<{ id: string; position: number }>
export type ConveyorState = Readonly<{
  items: readonly ConveyorItem[]
  running: boolean
  tick: number
  speed: ConveyorSpeed
}>

export function createConveyorState(): ConveyorState {
  return {
    items: [
      { id: 'C-01', position: 0 },
      { id: 'C-02', position: 2 },
      { id: 'C-03', position: 4 },
    ],
    running: false,
    tick: 0,
    speed: 1,
  }
}

export function setConveyorRunning(state: ConveyorState, running: boolean): ConveyorState {
  return state.running === running ? state : { ...state, running }
}

export function setConveyorSpeed(state: ConveyorState, speed: ConveyorSpeed): ConveyorState {
  return state.speed === speed ? state : { ...state, speed }
}

export function getConveyorTickMs(speed: ConveyorSpeed): number {
  return 500 / speed
}

export function tickConveyor(state: ConveyorState): ConveyorState {
  if (!state.running) return state

  return { ...state, items: moveConveyorItems(state.items), tick: state.tick + 1 }
}

export function moveConveyorItems<Item extends ConveyorItem>(current: readonly Item[], canMove: (item: Item) => boolean = () => true): Item[] {
  const items = [...current].sort((left, right) => left.position - right.position)
  // The next item has already moved, so it may have freed a cell this tick.
  let nextOccupied = conveyorLength
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    const destination = item.position + 1
    if (destination < nextOccupied && canMove(item)) items[index] = { ...item, position: destination }
    nextOccupied = items[index].position
  }

  return items
}
