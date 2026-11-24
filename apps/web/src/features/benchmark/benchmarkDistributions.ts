import { warehouseSizes } from '../../factory/warehouse/engine'
import { generateSupplyWeights, supplySample } from '../manufacturing/pythonSupply'

export const benchmarkDistributions = [
  { id: 'legacy', label: '従来の重量分布', description: '1〜9の整数から等確率で増分を選び、0から累積します。' },
  { id: 'uniform', label: '均等分布', description: '1〜10nを幅10の区間に分け、各区間から整数を1つ選びます。' },
  { id: 'skewed', label: '偏りのある分布', description: '区間ごとの乱数u（0以上1未満）を使い、1 + i + ⌊9n × ((i + u) / n)⁴⌋ で軽い側に集中させます（iは0始まり）。' },
  { id: 'duplicates', label: '重複の多い分布', description: '1〜10nを等間隔で結ぶ重量候補（n/8、最大8種類、端数は切り捨て）から等確率で復元抽出します。' },
] as const

export type BenchmarkDistribution = typeof benchmarkDistributions[number]['id']
export const defaultBenchmarkDistribution: BenchmarkDistribution = 'legacy'

export function benchmarkDistributionLabel(distribution: BenchmarkDistribution = defaultBenchmarkDistribution) {
  return benchmarkDistributions.find(option => option.id === distribution)!.label
}

export function generateBenchmarkWeights(seed: number, size: number, distribution: BenchmarkDistribution) {
  if (distribution === 'legacy') return generateSupplyWeights(seed, size)
  if (!warehouseSizes.some(option => option === size)) throw new RangeError('Invalid warehouse size')

  // New distributions share a weight range, so the same seed gives the same order thresholds.
  const maxWeight = 10 * size
  const levels = Math.min(8, size / 8)
  const weights = Array.from({ length: size }, (_, index) => {
    if (index === 0) return 1
    if (index === size - 1) return maxWeight
    const sample = supplySample(seed ^ 0x6c8e9cf5, index + 1)
    switch (distribution) {
      case 'uniform':
        return 1 + 10 * index + Math.floor(10 * sample)
      case 'skewed':
        return 1 + index + Math.floor(9 * size * ((index + sample) / size) ** 4)
      case 'duplicates':
        return 1 + Math.floor(Math.floor(sample * levels) * (maxWeight - 1) / (levels - 1))
    }
  })
  return weights.sort((left, right) => left - right)
}
