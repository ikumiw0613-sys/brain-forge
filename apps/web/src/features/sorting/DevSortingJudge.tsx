import { useSyncExternalStore } from 'react'
import {
  parseSortingJudgeError, parseSortingJudgeResult, sortingJudgeCaseLabels, sortingJudgeErrorLabels,
  sortingJudgePath, sortingJudgeReasonLabels,
} from './sortingJudgeProtocol'
import type { SortingJudgeError, SortingJudgeResult } from './sortingJudgeProtocol'

type JudgeState = { phase: 'idle' }
  | { phase: 'running'; source: string }
  | { phase: 'result'; source: string; result: SortingJudgeResult }
  | { phase: 'error'; source: string; error: SortingJudgeError }

// Facility navigation can unmount the panel while a request is active.
let state: JudgeState = { phase: 'idle' }
const listeners = new Set<() => void>()
const getState = () => state

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function setState(next: JudgeState) {
  state = next
  for (const listener of listeners) listener()
}

async function startJudge(source: string) {
  if (state.phase === 'running' || !source.trim()) return
  setState({ phase: 'running', source })
  const signal = AbortSignal.timeout(55_000)
  try {
    const response = await fetch(sortingJudgePath, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_code: source }),
      credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal,
    })
    const body: unknown = await response.json().catch(() => undefined)
    if (response.status === 200 || response.status === 503) {
      const result = parseSortingJudgeResult(body)
      if (result && (response.status === 503) === (result.status === 'unavailable')) {
        setState({ phase: 'result', source, result })
        return
      }
    }
    setState({ phase: 'error', source, error: signal.aborted ? 'timeout' : parseSortingJudgeError(body) ?? 'invalid_response' })
  } catch {
    setState({ phase: 'error', source, error: signal.aborted ? 'timeout' : 'network' })
  }
}

function resultStatus(result: SortingJudgeResult): string {
  if (result.cases.some(item => item.reason === 'judge_timeout')) return '採点タイムアウト'
  if (result.status === 'unavailable') return '通信エラー · Judge0 を利用できません'
  if (result.cases.some(item => item.reason === 'time_limit_exceeded')) return 'Python の実行時間切れ'
  return result.status === 'passed' ? '採点成功' : '採点失敗'
}

function caseStatus({ passed, reason }: SortingJudgeResult['cases'][number]): string {
  if (passed) return '合格'
  switch (reason) {
    case 'not_run': return '未実行'
    case 'judge_unavailable': return '判定不能'
    case 'judge_timeout':
    case 'time_limit_exceeded': return 'タイムアウト'
    default: return '不合格'
  }
}

export default function DevSortingJudge({ code }: { code: string }) {
  const current = useSyncExternalStore(subscribe, getState)
  const running = current.phase === 'running'
  const result = current.phase === 'result' ? current.result : null
  const error = current.phase === 'error' ? current.error : null
  const status = result ? `${resultStatus(result)} · ${result.passed_cases}/${result.total_cases} ケース合格`
    : error === 'timeout' ? '採点タイムアウト'
    : error === 'authentication' ? '認証エラー'
    : error === 'source_too_large' || error === 'invalid_source' ? '入力エラー'
    : error === 'busy' ? '別の実行が進行中'
    : error ? '通信エラー'
    : running ? `採点中 · 全 ${Object.keys(sortingJudgeCaseLabels).length} ケースの結果を待っています` : '採点前'

  return (
    <section className="manufacturing-panel sorting-panel" aria-labelledby="sorting-judge-title">
      <h2 id="sorting-judge-title">サーバー採点（開発用）</h2>
      <div className="manufacturing-buttons">
        <button type="button" className="manufacturing-primary" disabled={running || !code.trim()}
          onClick={() => void startJudge(code)}>サーバー採点</button>
      </div>
      <p role="status">{status}</p>
      {current.phase !== 'idle' && current.source !== code &&
        <p>この採点は送信時の下書きを使用しています。</p>}
      {error && <p>{sortingJudgeErrorLabels[error]}</p>}
      {result?.status === 'unavailable' && <p>Judge0 の稼働状況と Tailscale の接続を確認して再試行してください。</p>}
      {result && <div className="sorting-table" tabIndex={0} role="region" aria-label="サーバー採点のケース別結果">
        <table>
          <thead><tr><th scope="col">ケース</th><th scope="col">判定</th><th scope="col">理由</th></tr></thead>
          <tbody>{result.cases.map(item => <tr key={item.name}>
            <th scope="row">{sortingJudgeCaseLabels[item.name]}</th>
            <td>{caseStatus(item)}</td>
            <td>{item.reason ? sortingJudgeReasonLabels[item.reason] : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  )
}
