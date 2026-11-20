import { useState } from 'react'

export type Inspection = Readonly<{
  containerNumber: number
  quality: number
}>

export function useInspection(scanLimit: number, readQuality: (containerNumber: number) => number | undefined) {
  const [selectedNumber, selectContainer] = useState<number | null>(null)
  const [inspections, setInspections] = useState<readonly Inspection[]>([])

  function scanSelectedContainer() {
    const containerNumber = selectedNumber
    if (containerNumber === null) return

    setInspections(previous => {
      if (previous.length >= scanLimit || previous.some(scan => scan.containerNumber === containerNumber)) {
        return previous
      }

      const quality = readQuality(containerNumber)
      if (quality === undefined) return previous

      return [...previous, { containerNumber, quality }]
    })
  }

  return { selectedNumber, selectContainer, inspections, scanSelectedContainer }
}
