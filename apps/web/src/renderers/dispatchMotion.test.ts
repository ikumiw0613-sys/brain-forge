import { describe, expect, it } from 'vitest'
import { getDispatchFrame, shutterHeight } from './dispatchMotion'

describe('dispatch animation', () => {
  it('opens before the container moves', () => {
    expect(getDispatchFrame(0)).toEqual({ shutterLift: 0, intakeTravel: 0 })
    expect(getDispatchFrame(0.1)).toEqual({ shutterLift: shutterHeight / 2, intakeTravel: 0 })
    expect(getDispatchFrame(0.2)).toEqual({ shutterLift: shutterHeight, intakeTravel: 0 })
  })

  it('brings the container inside at full clearance', () => {
    const midpoint = getDispatchFrame(0.5)
    expect(midpoint.shutterLift).toBe(shutterHeight)
    expect(midpoint.intakeTravel).toBeCloseTo(0.85)
    expect(getDispatchFrame(0.8)).toEqual({ shutterLift: shutterHeight, intakeTravel: 1.7 })
  })

  it('closes once the container has reached the end of the intake', () => {
    expect(getDispatchFrame(0.9).shutterLift).toBeCloseTo(shutterHeight / 2)
    expect(getDispatchFrame(0.9).intakeTravel).toBe(1.7)
    expect(getDispatchFrame(1)).toEqual({ shutterLift: 0, intakeTravel: 1.7 })
  })
})
