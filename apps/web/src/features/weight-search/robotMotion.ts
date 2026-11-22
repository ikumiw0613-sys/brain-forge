import { getDispatchFrame } from '../../renderers/dispatchMotion'
import type { FactoryPoint } from '../../renderers/conveyorProjection'
import { shelfAddress } from './warehouseLayout'

export const shelvesPerRow = 8
export const dockIndex = -1
export const retractMs = 150
export const weighSpeeds = [1, 4, 16, 'instant'] as const
export type WeighSpeed = typeof weighSpeeds[number]
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
  speed?: Exclude<WeighSpeed, 'instant'>
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
  const speed = motion.speed ?? 1
  const elapsed = Math.max(0, now - motion.startedAt) * speed
  if (still) {
    return { point: target, phase: motion.kind === 'ship' ? 'pickup' : motion.retractAt === undefined ? 'weigh' : 'raise', extension: 0 }
  }
  if (motion.retractAt !== undefined) {
    return { point: target, phase: 'raise', extension: 1 - ease((now - motion.retractAt) * speed / retractMs) }
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

export const liftCenter = 460
export const rackEnd = 815
const rackStart = 150
const shaftGap = 38
const dispatchX = 870
type LiftPoint = { floor: number; x: number }

export function warehouseShelfX(slot: number, slotsPerFloor: number) {
  const half = slotsPerFloor / 2
  const right = slot >= half
  const start = right ? liftCenter + shaftGap : rackStart
  const end = right ? rackEnd : liftCenter - shaftGap
  return start + (end - start) * ((slot % half + .5) / half)
}

function liftPoint(index: number, slotsPerFloor: number): LiftPoint {
  if (index === dockIndex) return { floor: 0, x: dispatchX }
  const { floor, slot } = shelfAddress(index, slotsPerFloor)
  return { floor, x: warehouseShelfX(slot, slotsPerFloor) }
}

function liftTravel(from: LiftPoint, to: LiftPoint, progress: number): LiftPoint {
  const mix = (start: number, end: number, t: number) => start + (end - start) * ease(t)
  if (from.floor === to.floor) return { floor: from.floor, x: mix(from.x, to.x, progress) }
  if (progress < .25) return { floor: from.floor, x: mix(from.x, liftCenter, progress / .25) }
  if (progress < .7) return { floor: mix(from.floor, to.floor, (progress - .25) / .45), x: liftCenter }
  return { floor: to.floor, x: mix(liftCenter, to.x, (progress - .7) / .3) }
}

export function getLiftPose(slotsPerFloor: number, parked: number, motion: RobotMotion | null, now: number, still: boolean) {
  const pose = getRobotPose(parked, motion, now, still)
  if (!motion) return { ...pose, ...liftPoint(parked, slotsPerFloor), carrying: false }

  const from = liftPoint(motion.from, slotsPerFloor)
  const target = liftPoint(motion.index, slotsPerFloor)
  const elapsed = Math.max(0, now - motion.startedAt) * (motion.speed ?? 1)
  let position = target
  if (pose.phase === 'travel') position = liftTravel(from, target, elapsed / travelMs)
  if (pose.phase === 'carry') {
    position = liftTravel(target, liftPoint(dockIndex, slotsPerFloor), (elapsed - travelMs - pickupMs) / carryMs)
  }
  if (pose.phase === 'unload' || pose.phase === 'dispatch') position = liftPoint(dockIndex, slotsPerFloor)
  return { ...pose, ...position, carrying: Boolean(pose.ore) }
}
