import { useMemo, useState } from 'react'
import { benchmarkDistributions, generateBenchmarkWeights } from './benchmarkDistributions'
import type { BenchmarkDistribution } from './benchmarkDistributions'

const binCount = 12

function buildHistograms(seed: number, size: number, distributions: readonly BenchmarkDistribution[]) {
  const samples = benchmarkDistributions.filter(option => distributions.includes(option.id)).map(option => ({
    ...option, weights: generateBenchmarkWeights(seed, size, option.id),
  }))
  const min = Math.min(...samples.map(sample => sample.weights[0]))
  const max = Math.max(...samples.map(sample => sample.weights.at(-1)!))
  const width = Math.ceil((max - min + 1) / binCount)
  const histograms = samples.map(({ weights, ...option }) => {
    const bins = Array.from({ length: binCount }, () => 0)
    for (const weight of weights) bins[Math.floor((weight - min) / width)]++
    return { ...option, bins, distinct: new Set(weights).size }
  })
  return { min, width, scale: Math.max(1, ...histograms.flatMap(histogram => histogram.bins)), histograms }
}

export function BenchmarkHistogram({ sizes, seeds, distributions, running }: {
  sizes: readonly number[]
  seeds: readonly number[]
  distributions: readonly BenchmarkDistribution[]
  running: boolean
}) {
  const [previewSize, setPreviewSize] = useState<number>()
  const [previewSeed, setPreviewSeed] = useState<number>()
  const size = previewSize !== undefined && sizes.includes(previewSize) ? previewSize : sizes[0]
  const seed = previewSeed !== undefined && seeds.includes(previewSeed) ? previewSeed : seeds[0]
  const preview = useMemo(() => (
    size !== undefined && seed !== undefined && distributions.length ? buildHistograms(seed, size, distributions) : null
  ), [seed, size, distributions])

  if (!preview) return null
  const { min, width, scale, histograms } = preview
  return (
    <section className="manufacturing-panel benchmark-controls benchmark-histograms" aria-labelledby="benchmark-histograms">
      <h2 id="benchmark-histograms">重量ヒストグラム</h2>
      <div className="benchmark-preview-settings">
        <label>プレビューの倉庫サイズ <select value={size} disabled={running} onChange={event => setPreviewSize(Number(event.target.value))}>
          {sizes.map(value => <option key={value} value={value}>{value.toLocaleString('ja-JP')} 部品</option>)}
        </select></label>
        <label>プレビューのseed <select value={seed} disabled={running} onChange={event => setPreviewSeed(Number(event.target.value))}>
          {seeds.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <p>各グラフの横軸は重量、縦軸は部品数です。1区間の幅は {width}、縦軸の上限は {scale} 個です。</p>
      {histograms.some(histogram => histogram.id !== 'legacy') &&
        <p>nは倉庫サイズです。新しい3分布は最小重量を 1、最大重量を 10n に固定します。</p>}
      <div className="benchmark-histogram-grid">{histograms.map(({ id, label, description, bins, distinct }) => {
        const ranges = bins.map((count, index) => {
          const start = min + index * width
          return `${start}〜${start + width - 1} · ${count} 個`
        })
        return <figure key={id}>
          <figcaption><strong>{label}</strong> · 異なる重量 {distinct} 種類</figcaption>
          <div className="benchmark-histogram-plot" role="img" aria-label={`${label}の重量区間別部品数。 ${ranges.join('、')}`}>
            {bins.map((count, index) => <span key={index} title={ranges[index]}>
              <span style={{ height: `${count * 100 / scale}%` }} />
            </span>)}
          </div>
          <div className="benchmark-histogram-axis" aria-hidden="true"><span>{min}</span><span>{min + width * binCount - 1}</span></div>
          <p>{description}</p>
        </figure>
      })}</div>
    </section>
  )
}
