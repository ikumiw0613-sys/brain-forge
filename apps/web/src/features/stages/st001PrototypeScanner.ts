// The ST-001 sample in the MVP design. Production quality data belongs on the server.
const qualities = [8, 15, 20, 24, 31, 37, 42, 46, 51, 58, 63, 68, 72, 76, 83, 91] as const

export function readSt001PrototypeQuality(containerNumber: number): number | undefined {
  return qualities[containerNumber - 1]
}
