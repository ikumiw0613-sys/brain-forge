import { countPositions, powerPerWeigh, ticksPerWeigh } from './engine'
import type { Measurement, SearchBounds, WeightSearchView } from './engine'

export const verdict = (result: Measurement) => result.qualifies ? '条件を満たす' : '必要重量未満'

function formatBounds({ lower, upper }: SearchBounds) {
  return lower === upper ? String(lower) : `${lower}〜${upper}`
}

function describeExcluded(excluded: SearchBounds, n: number) {
  if (excluded.lower === n) return '「該当なし」'
  const shelves = formatBounds({ lower: excluded.lower, upper: Math.min(excluded.upper, n - 1) })
  return `index ${shelves}${excluded.upper === n ? ' と「該当なし」' : ''}`
}

export function CandidateSummary({ candidates, slots, order, log }: Pick<WeightSearchView, 'candidates' | 'slots' | 'order' | 'log'>) {
  const latest = log.at(-1)
  const n = slots.length
  return (
    <section className="weight-search-status" aria-labelledby="candidate-title">
      <h3 id="candidate-title">正解位置の候補</h3>
      <div role="status" aria-atomic="true">
        <div className="weight-range-heading">
          <div className="weight-range">index <strong>{formatBounds(candidates)}</strong><span>（{candidates.count}位置）</span></div>
          <span className="weight-bound-state" data-resolved={candidates.resolved}>
            {candidates.resolved ? '境界確定' : '探索中'}
          </span>
        </div>
        <div className="weight-range-scale">
          <div className="weight-range-track" aria-hidden="true">
            {slots.length <= 16 && slots.map(({ index, candidate }) => <span key={index} data-candidate={candidate} />)}
          </div>
          {candidates.upper === n && <span className="weight-no-match">{n} は該当なし</span>}
        </div>
        <p className="weight-range-change">
          {latest ? <>
            <strong>直近の除外 {latest.excluded ? countPositions(latest.excluded) : 0}位置</strong>
            <span>棚 {latest.index} の {latest.weight} kg は基準 {order.requiredWeight} kg {latest.qualifies ? '以上' : '未満'}。
              {latest.excluded ? `${describeExcluded(latest.excluded, n)} を除外しました。` : '候補範囲は変わりません。'}</span>
          </> : '計量結果を待っています。'}
        </p>
      </div>
    </section>
  )
}

export function MeasurementLog({ log, target }: { log: WeightSearchView['log']; target: number }) {
  return (
    <section className="weight-log" aria-labelledby="log-title">
      <div className="weight-subhead"><h3 id="log-title">計量ログ</h3><span>{log.length} 件 · 基準 {target} kg</span></div>
      {log.length > 0 ? (
        <ol reversed start={log.length} tabIndex={0} aria-label="計量ログ（新しい順）">
          {[...log].reverse().map((entry, index) => (
            <li key={log.length - index}>
              <span className="weight-log-seq">{log.length - index}回目</span>
              <div className="weight-log-reading">
                <span>index {entry.index}</span><strong>{entry.weight} kg</strong>
                <span data-qualifies={entry.qualifies}>{verdict(entry)}</span>
              </div>
              <div className="weight-log-effect">
                <span>{entry.excluded ? countPositions(entry.excluded) : 0}位置を除外</span>
                <small>+{powerPerWeigh} pt · +{ticksPerWeigh} Tick</small>
              </div>
            </li>
          ))}
        </ol>
      ) : <p>計量結果がここに表示されます。</p>}
    </section>
  )
}
