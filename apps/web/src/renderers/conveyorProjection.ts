export const conveyorStep = { x: 88, y: 27 }
const depthStep = { x: -48, y: 31 }
export const conveyorSceneBounds = { x: -290, y: -225, width: 1280, height: 560 }
export const conveyorFaceAngle = Math.atan2(conveyorStep.y, conveyorStep.x) * 180 / Math.PI

export type FactoryPoint = readonly [along: number, depth: number, height?: number]

export function projectFactory([along, depth, height = 0]: FactoryPoint) {
  return {
    x: along * conveyorStep.x + depth * depthStep.x,
    y: along * conveyorStep.y + depth * depthStep.y - height,
  }
}

export function projectedPoints(...points: FactoryPoint[]): string {
  return points.map(point => {
    const { x, y } = projectFactory(point)
    return `${x},${y}`
  }).join(' ')
}

export function projectedTranslate(point: FactoryPoint): string {
  const { x, y } = projectFactory(point)
  return `translate(${x} ${y})`
}

export const floorTransform = `matrix(${conveyorStep.x} ${conveyorStep.y} ${depthStep.x} ${depthStep.y} 0 0)`
