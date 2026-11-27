import { useSyncExternalStore } from 'react'
import {
  algorithmLabels, benchmarkDistributions, measurementErrors, measurementLabels,
  parseSortingBenchmarkResult, sortingBenchmarkPath,
} from './sortingBenchmarkProtocol'
import type { SortingBenchmarkResult } from './sortingBenchmarkProtocol'
import {
  parseSortingJudgeError, sortingJudgeCaseLabels, sortingJudgeErrorLabels, sortingJudgeReasonLabels,
} from './sortingJudgeProtocol'
import type { SortingJudgeError } from './sortingJudgeProtocol'

type BenchmarkState = { phase: 'idle' }
  | { phase: 'running'; source: string }
  | { phase: 'result'; source: string; result: SortingBenchmarkResult }
  | { phase: 'error'; source: string; error: SortingJudgeError }

// Keep the request and its source snapshot across facility navigation.
let state: BenchmarkState = { phase: 'idle' }
const listeners = new Set<() => void>()
const getState = () => state

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function setState(next: BenchmarkState) {
  state = next
  for (const listener of listeners) listener()
}

async function start(source: string) {
  if (state.phase === 'running' || !source.trim()) return
  setState({ phase: 'running', source })
  const signal = AbortSignal.timeout(125_000)
  try {
    const response = await fetch(sortingBenchmarkPath, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_code: source }),
      credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal,
    })
    const body: unknown = await response.json().catch(() => undefined)
    if (response.status === 200 || response.status === 503) {
      const result = parseSortingBenchmarkResult(body)
      if (result && (response.status === 503) === (result.algorithm_status === 'unavailable')) {
        setState({ phase: 'result', source, result })
        return
      }
    }
    setState({ phase: 'error', source, error: signal.aborted ? 'timeout' : parseSortingJudgeError(body) ?? 'invalid_response' })
  } catch {
    setState({ phase: 'error', source, error: signal.aborted ? 'timeout' : 'network' })
  }
}

const time = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const formatTime = (value: number | null) => value === null ? '—' : time.format(value)

function Results({ result }: { result: SortingBenchmarkResult }) {
  const { correctness, correctness_passed, measurements } = result
  return <>
    <p>正当性（Sorting Judge 01） {correctness_passed ? '合格' : correctness.status === 'unavailable' ? '判定不能' : '不合格'}
      {' · '}{correctness.passed_cases}/{correctness.total_cases} ケース合格</p>
    {!correctness_passed && <ul>{correctness.cases.filter(item => item.reason && item.reason !== 'not_run').map(item =>
      <li key={item.name}>{sortingJudgeCaseLabels[item.name]} · {item.reason && sortingJudgeReasonLabels[item.reason]}</li>
    )}</ul>}
    <p>Python {result.python_version ?? '—'} · Judge0 言語 ID {result.judge0_language_id}</p>
    {correctness_passed && <div className="sorting-table" tabIndex={0} role="region" aria-label="Judge0 のサイズ・分布別測定結果">
      <table>
        <thead><tr><th scope="col">件数</th><th scope="col">入力</th><th scope="col">成功回数</th>
          <th scope="col">中央値 (ms)</th><th scope="col">最小–最大 (ms)</th><th scope="col">ジョブ CPU (ms)</th>
          <th scope="col">測定状況</th></tr></thead>
        <tbody>{measurements.map(item => <tr key={`${item.size}-${item.distribution}`}>
          <th scope="row">{item.size.toLocaleString('ja-JP')}</th><td>{benchmarkDistributions[item.distribution]}</td>
          <td>{item.successful_runs}/{item.requested_runs}</td><td>{formatTime(item.median_ms)}</td>
          <td>{item.min_ms === null ? '—' : `${formatTime(item.min_ms)}–${formatTime(item.max_ms)}`}</td>
          <td>{formatTime(item.judge0_cpu_ms)}</td><td>{measurementLabels[item.status]}
            {item.error_message && <div>{measurementErrors[item.error_message]}</div>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>
}

export function DevSortingBenchmark({ code }: { code: string }) {
  const current = useSyncExternalStore(subscribe, getState)
  const running = current.phase === 'running'
  const error = current.phase === 'error' ? current.error : null
  const status = current.phase === 'result' ? algorithmLabels[current.result.algorithm_status]
    : error === 'timeout' ? 'タイムアウト'
    : error === 'busy' ? '別の実行が進行中'
    : error === 'invalid_source' || error === 'source_too_large' ? '入力エラー'
    : error === 'authentication' ? '認証エラー'
    : error ? '接続エラー'
    : running ? '測定中 · 正当性を確認してから入力ごとに測定します' : '測定前'

  return <section className="manufacturing-panel sorting-panel" aria-labelledby="sorting-benchmark-title">
    <h2 id="sorting-benchmark-title">性能測定（Judge0・開発用）</h2>
    <p>サーバー上で sort_parts(a) を計測した参考値です。</p>
    <div className="manufacturing-buttons">
      <button type="button" className="manufacturing-primary" disabled={running || !code.trim()}
        onClick={() => void start(code)}>性能測定</button>
    </div>
    <p role="status">{status}</p>
    {current.phase !== 'idle' && current.source !== code && <p>この測定は送信時の下書きを使用しています。</p>}
    {error && <p>{error === 'timeout' ? '測定 API の応答が待機時間を超えました。' : sortingJudgeErrorLabels[error]}</p>}
    {current.phase === 'result' && <Results result={current.result} />}
  </section>
}
