const calibrationSource = 'factory'

export const factoryPath = '/prototypes/conveyor/'
export const calibrationMissionPath = `/?from=${calibrationSource}`

export function isCalibrationLaunch(search: string): boolean {
  return new URLSearchParams(search).get('from') === calibrationSource
}
