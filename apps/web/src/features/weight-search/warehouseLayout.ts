export function warehouseLayout(size: number) {
  const floors = size >= 256 ? 4 : size >= 64 ? 2 : 1
  return { floors, slotsPerFloor: size / floors }
}

export function shelfAddress(index: number, slotsPerFloor: number) {
  return { floor: Math.floor(index / slotsPerFloor), slot: index % slotsPerFloor }
}

export function nearbySlots(index: number, size: number) {
  const count = Math.min(9, size)
  const start = Math.max(0, Math.min(size - count, index - Math.floor(count / 2)))
  return { start, end: start + count }
}
