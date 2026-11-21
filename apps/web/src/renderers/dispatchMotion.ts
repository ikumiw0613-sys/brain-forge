export const shutterHeight = 58

const openingEnd = 0.2
const closingStart = 0.8
const intakeDistance = 1.7

function smoothStep(value: number): number {
  const progress = Math.max(0, Math.min(1, value))
  return progress * progress * (3 - 2 * progress)
}

export function getDispatchFrame(progress: number) {
  const opening = smoothStep(progress / openingEnd)
  const closing = smoothStep((1 - progress) / (1 - closingStart))
  const intake = smoothStep((progress - openingEnd) / (closingStart - openingEnd))

  return { shutterLift: shutterHeight * Math.min(opening, closing), intakeTravel: intakeDistance * intake }
}
