import { useState } from 'react'
import { productionTicks, productRevenue } from '../../factory/manufacturing/engine'
import { powerPerWeigh, ticksPerWeigh, warehouseSizes } from '../../factory/warehouse/engine'
import { benchmarkConditions, benchmarkId, benchmarkSeeds, benchmarkTicks } from './benchmarkEngine'
import { benchmarkDistributionLabel, benchmarkDistributions, defaultBenchmarkDistribution } from './benchmarkDistributions'
import type { BenchmarkDistribution } from './benchmarkDistributions'
import { BenchmarkHistogram } from './BenchmarkHistogram'
import { BenchmarkResults, formatBenchmarkNumber } from './BenchmarkResults'
import { useBenchmark } from './useBenchmark'
import './benchmark.css'

const statusLabels = {
  idle: '試験前', running: '試験中', completed: '完了', failed: '失敗', stopped: '中断',
}
const format = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })

const binaryExample = `left, right = 0, n
while left < right:
    mid = (left + right) // 2
    if await weigh(mid) < target:
        left = mid + 1
    else:
        right = mid
result = left
`

function readSeeds(text: string) {
  const tokens = text.trim().split(/[\s,、]+/)
  const seeds = tokens.map(Number)
  if (!tokens.every(token => /^[+-]?\d+$/.test(token)) ||
    seeds.some(seed => seed < -2147483648 || seed > 2147483647)) return []
  return [...new Set(seeds)]
}

export function BenchmarkScreen({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const [codeB, setCodeB] = useState(binaryExample)
  const [compare, setCompare] = useState(false)
  const [sizes, setSizes] = useState<number[]>([benchmarkConditions.warehouseSize])
  const [distributions, setDistributions] = useState<BenchmarkDistribution[]>([defaultBenchmarkDistribution])
  const [seedText, setSeedText] = useState(String(benchmarkConditions.seed))
  const [ticks, setTicks] = useState<number>(benchmarkConditions.ticks)
  const benchmark = useBenchmark()
  const { result, status, job, results } = benchmark
  const running = status === 'running'
  const seeds = readSeeds(seedText)
  const codes = compare ? [{ variant: 'A', code }, { variant: 'B', code: codeB }] as const : [{ variant: 'A', code }] as const
  const caseCount = sizes.length * seeds.length * distributions.length * codes.length
  const edited = job && job.code !== (job.variant === 'A' ? code : codeB)
  const error = results.length === benchmark.caseCount && benchmark.caseCount === 1 ? results[0].issue?.detail : undefined

  function start() {
    const jobs = sizes.flatMap(warehouseSize => seeds.flatMap(seed => distributions.flatMap(distribution =>
      codes.map(entry => ({ ...entry, conditions: { warehouseSize, seed, ticks, distribution } })),
    )))
    benchmark.start(jobs)
  }
  return (
    <div className="manufacturing benchmark">
      <header className="manufacturing-header"><div>
        <strong>Brain Forge</strong>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/?view=warehouse`}>部品倉庫へ</a>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/`}>工場マップ</a>
      </div></header>
      <main className="manufacturing-main">
        <div className="manufacturing-title"><h1>アルゴリズム性能試験</h1></div>
        <div className="benchmark-layout">
          <section className="manufacturing-panel" aria-labelledby="benchmark-code">
            <div className="manufacturing-panel-heading"><h2 id="benchmark-code">試験用Python</h2></div>
            <div className="benchmark-controls">
              <fieldset className="benchmark-options" disabled={running}>
                <legend>倉庫サイズ</legend>
                {warehouseSizes.map(size => <label key={size}>
                  <input type="checkbox" checked={sizes.includes(size)}
                    onChange={event => setSizes(event.target.checked ? [...sizes, size].sort((a, b) => a - b) : sizes.filter(item => item !== size))} />
                  {format(size)} 部品
                </label>)}
              </fieldset>
              <fieldset className="benchmark-options" disabled={running}>
                <legend>重量分布</legend>
                {benchmarkDistributions.map(({ id, label }) => <label key={id}>
                  <input type="checkbox" checked={distributions.includes(id)}
                    onChange={event => setDistributions(event.target.checked ? [...distributions, id] : distributions.filter(item => item !== id))} />
                  {label}
                </label>)}
              </fieldset>
              <label htmlFor="benchmark-seeds">seed（複数の場合はカンマ区切り）</label>
              <div className="benchmark-input-row">
                <input id="benchmark-seeds" value={seedText} onChange={event => setSeedText(event.target.value)} disabled={running} />
                <button type="button" disabled={running} onClick={() => setSeedText(benchmarkSeeds.join(', '))}>候補を入力</button>
              </div>
              {!seeds.length && <p className="benchmark-error">seedは32ビット符号付き整数で入力してください。</p>}
              <label htmlFor="benchmark-ticks">試験時間</label>
              <select id="benchmark-ticks" value={ticks} onChange={event => setTicks(Number(event.target.value))} disabled={running}>
                {benchmarkTicks.map(limit => <option key={limit} value={limit}>{format(limit)} Tick</option>)}
              </select>
              <label><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} disabled={running} /> 2コードを同条件で比較</label>
              <label htmlFor="benchmark-python">コード A（初期値は部品倉庫の下書き）</label>
              <textarea id="benchmark-python" value={code} onChange={event => setCode(event.target.value)} spellCheck={false} />
              {compare && <>
                <label htmlFor="benchmark-python-b">コード B</label>
                <textarea id="benchmark-python-b" value={codeB} onChange={event => setCodeB(event.target.value)} spellCheck={false} />
              </>}
              <div className="manufacturing-buttons">
                <button type="button" className="manufacturing-primary" disabled={running || !caseCount || codes.some(entry => !entry.code.trim())} onClick={start}>試験開始</button>
                <button type="button" disabled={!running} onClick={benchmark.stop}>中断</button>
              </div>
              {edited && <details>
                <summary>今回の試験に使ったコード</summary>
                <pre>{job.code}</pre>
              </details>}
              <p>{caseCount} ケース。開始時のコードで順次実行します。この画面を離れると試験を終了します。</p>
            </div>
          </section>
          <section className="manufacturing-panel" aria-labelledby="benchmark-result">
            <div className="manufacturing-panel-heading"><h2 id="benchmark-result">試験結果</h2><span role="status">{statusLabels[status]}</span></div>
            <div className="benchmark-controls">
              {job ? <>
                <p>ケース {benchmark.caseNumber} / {benchmark.caseCount} · コード {job.variant}</p>
                <p><strong>{benchmarkId(job.conditions)}</strong> · seed {job.conditions.seed}</p>
                <p>{benchmarkDistributionLabel(job.conditions.distribution)} · {format(job.conditions.warehouseSize)} 部品 · {format(job.conditions.ticks)} Tick</p>
                <progress aria-label="現在のケースの計測Tick" value={result?.ticks ?? 0} max={job.conditions.ticks} />
              </> : <p>選択した条件で試験を開始してください。</p>}
              <p>計量 {ticksPerWeigh} Tick・{powerPerWeigh} pt / 回 · 製造 {productionTicks} Tick・{productRevenue} Cr / 個</p>
              {error && <pre className="benchmark-error" role="alert">{error}</pre>}
              <dl className="benchmark-metrics">
                <div><dt>計測Tick</dt><dd>{format(result?.ticks ?? 0)} Tick</dd></div>
                <div><dt>完成製品数</dt><dd>{format(result?.completed ?? 0)} 個</dd></div>
                <div><dt>確定売上</dt><dd>{format(result?.revenue ?? 0)} Cr</dd></div>
                <div><dt>生産効率</dt><dd>{formatBenchmarkNumber(result?.revenueRate ?? 0)} Cr/100 Tick</dd></div>
                <div><dt>計量回数</dt><dd>{format(result?.measurements ?? 0)} 回</dd></div>
                <div><dt>消費電力</dt><dd>{format(result?.power ?? 0)} pt</dd></div>
              </dl>
            </div>
          </section>
        </div>
        <BenchmarkHistogram sizes={sizes} seeds={seeds} distributions={distributions} running={running} />
        {results.length > 0 && <BenchmarkResults cases={results} />}
      </main>
    </div>
  )
}
