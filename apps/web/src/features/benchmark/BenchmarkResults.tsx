import { benchmarkId } from './benchmarkEngine'
import { metricValues, resultMetrics, summarize } from './benchmarkStats'
import type { BenchmarkIssue, CaseResult } from './benchmarkStats'

export const formatBenchmarkNumber = (value: number | null) => value?.toLocaleString('ja-JP', { maximumFractionDigits: 2 }) ?? '—'

const issues: Record<BenchmarkIssue, string> = {
  wrong: '誤答',
  unverified: '計量で未確認',
  'invalid-result': '不正な戻り値',
  exception: '実行エラー',
  timeout: 'タイムアウト',
}

export function BenchmarkResults({ cases }: { cases: readonly CaseResult[] }) {
  const groups = new Map<string, CaseResult[]>()
  for (const entry of cases) {
    const { variant, conditions } = entry.job
    const key = `${conditions.warehouseSize}部品 / ${variant}`
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  const bars = Array.from(groups, ([label, group]) => {
    const completed = group.filter(entry => entry.status === 'completed')
    return { label, done: completed.length, total: group.length,
      average: summarize(completed.map(entry => entry.result.revenueRate))?.average ?? null }
  })
  const scale = Math.max(1, ...bars.map(bar => bar.average ?? 0))
  return (
    <div className="benchmark-results">
      <section className="manufacturing-panel benchmark-controls" aria-labelledby="benchmark-cases">
        <h2 id="benchmark-cases">サイズ・seed別の結果</h2>
        <p>誤答・未確認・実行エラーでそのケースを終了し、次のケースへ進みます。失敗・中断の行は終了時点までの計測値です。</p>
        <div className="benchmark-table-scroll" tabIndex={0} aria-labelledby="benchmark-cases">
          <table>
            <thead><tr><th scope="col">コード</th><th scope="col">条件</th><th scope="col">結果</th>
              {resultMetrics.map(([key, label]) => <th key={key} scope="col">{label}</th>)}
            </tr></thead>
            <tbody>{cases.map(entry => {
              const { variant, conditions } = entry.job
              const id = benchmarkId(conditions)
              const values = metricValues(entry)
              return <tr key={`${variant}-${id}`}>
                <th scope="row">{variant}</th>
                <td><strong>{id}</strong><br />{conditions.warehouseSize}部品 · seed {conditions.seed} · {conditions.ticks} Tick</td>
                <td>{entry.issue ? <details><summary>{issues[entry.issue.kind]}</summary><p>{entry.issue.detail}</p></details>
                  : entry.status === 'completed' ? '完了' : '中断'}</td>
                {resultMetrics.map(([key]) => <td key={key}>{formatBenchmarkNumber(values[key])}</td>)}
              </tr>
            })}</tbody>
          </table>
        </div>
        <p>正答率の分母は、正答・誤答・不正な戻り値・実行エラー・タイムアウトの合計です。計量で未確認の正解indexも正答数に含めます。</p>
      </section>
      <section className="manufacturing-panel benchmark-controls" aria-labelledby="benchmark-graph">
        <h2 id="benchmark-graph">平均生産効率</h2>
        <p>完了したケースを集計しています。比較時は各コードの完了件数と正答率も確認できます。</p>
        <ul className="benchmark-bars">
          {bars.map(({ label, done, total, average }) => <li key={label}>
            <span>{label} · {done}/{total}件完了</span>
            <meter aria-label={`${label}の平均生産効率`} max={scale} value={average ?? 0} />
            <strong>{formatBenchmarkNumber(average)} Cr/100 Tick</strong>
          </li>)}
        </ul>
      </section>
      <section className="manufacturing-panel benchmark-controls" aria-labelledby="benchmark-aggregate">
        <h2 id="benchmark-aggregate">seed間の集計</h2>
        <p>完了・失敗したケースを集計します。中断したケースと計測前の正答率は集計から除きます。</p>
        {Array.from(groups, ([label, group]) => {
          const values = group.filter(entry => entry.status !== 'stopped').map(metricValues)
          return values.length > 0 && <details key={label}>
            <summary>{label} · {values.length} seed</summary>
            <div className="benchmark-table-scroll">
              <table>
                <thead><tr><th scope="col">指標</th><th scope="col">平均</th><th scope="col">最小</th><th scope="col">最大</th></tr></thead>
                <tbody>{resultMetrics.map(([key, metric]) => {
                  const summary = summarize(values.map(value => value[key]))
                  return <tr key={key}><th scope="row">{metric}</th>
                    <td>{formatBenchmarkNumber(summary?.average ?? null)}</td>
                    <td>{formatBenchmarkNumber(summary?.min ?? null)}</td>
                    <td>{formatBenchmarkNumber(summary?.max ?? null)}</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          </details>
        })}
      </section>
    </div>
  )
}
