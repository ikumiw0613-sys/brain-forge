import { describe, expect, it } from 'vitest'
import { projectFactory } from '../../renderers/conveyorProjection'
import { dockIndex, getRobotPose, retractMs, shelfPoint, shipmentMs } from './robotMotion'
import type { RobotMotion } from './robotMotion'

const measure: RobotMotion = { kind: 'weigh', from: 2, index: 13, startedAt: 0 }

describe('warehouse robot motion', () => {
  it('maps the sixteen indices to two left-to-right rows of eight shelves', () => {
    const points = Array.from({ length: 16 }, (_, index) => shelfPoint(index))
    expect(new Set(points.map(point => point.join(','))).size).toBe(16)
    for (let column = 0; column < 8; column++) {
      expect(points[column][0]).toBe(points[column + 8][0])
      expect(projectFactory(points[column]).y).toBeLessThan(projectFactory(points[column + 8]).y)
      if (column > 0) expect(points[column][0]).toBeGreaterThan(points[column - 1][0])
    }
  })

  it('moves the bridge and trolley to the addressed shelf and retracts only after commitment', () => {
    const resting = shelfPoint(measure.from)
    const target = shelfPoint(measure.index)
    expect(getRobotPose(2, measure, 0)).toMatchObject({ point: resting, phase: 'travel', extension: 0 })
    const mid = getRobotPose(2, measure, 200)
    expect(mid.point[0]).toBeGreaterThan(resting[0])
    expect(mid.point[0]).toBeLessThan(target[0])
    expect(mid.point[1]).toBeGreaterThan(resting[1])
    const lowering = getRobotPose(2, measure, 520)
    expect(lowering).toMatchObject({ point: target, phase: 'lower' })
    expect(lowering.extension).toBeGreaterThan(0)
    expect(lowering.extension).toBeLessThan(1)
    expect(getRobotPose(2, measure, 900)).toMatchObject({ point: target, phase: 'weigh', extension: 1 })
    expect(getRobotPose(2, measure, 1200).extension).toBe(1)
    const after = { ...measure, retractAt: 1000 }
    expect(getRobotPose(13, after, 1000 + retractMs / 2)).toMatchObject({ point: target, phase: 'raise', extension: .5 })
    expect(getRobotPose(13, null, 1000 + retractMs)).toMatchObject({ point: target, phase: 'idle', extension: 0 })
    expect(getRobotPose(2, measure, 0, true)).toMatchObject({ point: target, phase: 'weigh', extension: 0 })
  })

  it('lifts only the selected ore, carries it to the gate and opens the shutter', () => {
    const ship = { ...measure, kind: 'ship' } as const
    expect(getRobotPose(2, ship, 520)).toMatchObject({ phase: 'pickup', picked: false, ore: undefined })
    expect(getRobotPose(2, ship, 900)).toMatchObject({ phase: 'carry', picked: true, ore: expect.any(Array) })
    expect(getRobotPose(2, ship, 1400)).toMatchObject({ phase: 'unload', point: shelfPoint(dockIndex), picked: true })
    const gate = getRobotPose(2, ship, 1700)
    expect(gate.phase).toBe('dispatch')
    expect(gate.shutterLift).toBeGreaterThan(0)
    expect(getRobotPose(dockIndex, ship, shipmentMs).ore).toBeUndefined()
  })
})
