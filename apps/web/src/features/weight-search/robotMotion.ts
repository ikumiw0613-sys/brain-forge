import { getDispatchFrame } from '../../renderers/dispatchMotion'
import type { FactoryPoint } from '../../renderers/conveyorProjection'

export const shelvesPerRow = 8
export const dockIndex = shelvesPerRow * 2
export const retractMs = 150
const travelMs = 450
const lowerMs = 240
const pickupMs = 400
const carryMs = 420
const unloadMs = 230
const gateMs = 480
export const shipmentMs = travelMs + pickupMs + carryMs + unloadMs + gateMs

export type RobotMotion = Readonly<{
  kind: 'weigh' | 'ship'
  from: number
  index: number
  startedAt: number
  retractAt?: number
}>

type RailPoint = readonly [along: number, depth: number]
type RobotPhase = 'idle' | 'travel' | 'lower' | 'weigh' | 'raise' | 'pickup' | 'carry' | 'unload' | 'dispatch'
type RobotPose = {
  point: RailPoint
  phase: RobotPhase
  extension: number
  ore?: FactoryPoint
  picked?: boolean
  shutterLift?: number
}

export const shelfHeight = 23
export const clawHeight = 103
export const armTravel = clawHeight - shelfHeight - 9
const gatePlatform = 48
const dockExtension = (clawHeight - gatePlatform - 9) / armTravel

export function shelfPoint(index: number): RailPoint {
  if (index === dockIndex) return [7.5, 0]
  return [index % shelvesPerRow * .94, index < shelvesPerRow ? -.60 : .78]
}

function ease(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  return t * t * (3 - 2 * t)
}

function slide(from: RailPoint, to: RailPoint, progress: number): RailPoint {
  const t = ease(progress)
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

function heldOre([along, depth]: RailPoint, extension: number): FactoryPoint {
  return [along, depth, clawHeight - extension * armTravel - 9]
}

export function getRobotPose(parked: number, motion: RobotMotion | null, now: number, still = false): RobotPose {
  if (!motion) return { point: shelfPoint(parked), phase: 'idle', extension: 0 }

  const target = shelfPoint(motion.index)
  const elapsed = Math.max(0, now - motion.startedAt)
  if (still) {
    return { point: target, phase: motion.kind === 'ship' ? 'pickup' : motion.retractAt === undefined ? 'weigh' : 'raise', extension: 0 }
  }
  if (motion.retractAt !== undefined) {
    return { point: target, phase: 'raise', extension: 1 - ease((now - motion.retractAt) / retractMs) }
  }
  if (elapsed < travelMs) {
    return { point: slide(shelfPoint(motion.from), target, elapsed / travelMs), phase: 'travel', extension: 0 }
  }

  let stage = elapsed - travelMs
  if (motion.kind === 'weigh') {
    return stage < lowerMs
      ? { point: target, phase: 'lower', extension: ease(stage / lowerMs) }
      : { point: target, phase: 'weigh', extension: 1 }
  }
  if (stage < pickupMs) {
    const picked = stage >= pickupMs / 2
    const extension = ease(1 - Math.abs(2 * stage / pickupMs - 1))
    return { point: target, phase: 'pickup', extension, picked, ore: picked ? heldOre(target, extension) : undefined }
  }

  stage -= pickupMs
  const dock = shelfPoint(dockIndex)
  if (stage < carryMs) {
    const point = slide(target, dock, stage / carryMs)
    return { point, phase: 'carry', extension: 0, picked: true, ore: heldOre(point, 0) }
  }
  stage -= carryMs
  if (stage < unloadMs) {
    const extension = dockExtension * ease(stage / unloadMs)
    return { point: dock, phase: 'unload', extension, picked: true, ore: heldOre(dock, extension) }
  }
  stage -= unloadMs
  const progress = Math.min(1, stage / gateMs)
  const { shutterLift, intakeTravel } = getDispatchFrame(progress)
  return {
    point: dock, phase: 'dispatch', extension: dockExtension * (1 - ease(stage / retractMs)), picked: true, shutterLift,
    ore: progress < .8 ? [dock[0] + intakeTravel, dock[1], gatePlatform] : undefined,
  }
}
