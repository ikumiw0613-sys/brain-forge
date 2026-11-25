import { PythonCodeEditor } from '../../factory/python/PythonCodeEditor'
import type { PythonReport } from '../../factory/python/usePythonSearch'

const statusText: Record<PythonReport['status'], string> = {
  idle: '実行待機',
  loading: 'Pyodideを読み込み中',
  running: 'Pythonを実行中',
  stopped: '実行を停止しました',
  failed: '実行エラー',
  finished: '実行完了',
}

export function PythonEditor({ code, report, n, target, canRun, busy, compact = false, label = 'Pythonエディタ', onChange, onRun, onStop }: {
  code: string
  report: PythonReport
  n: number
  target: number | null
  canRun?: boolean
  busy: boolean
  compact?: boolean
  label?: string
  onChange: (code: string) => void
  onRun?: () => void
  onStop?: () => void
}) {
  return (
    <section className="weight-python" aria-labelledby={compact ? undefined : 'python-title'}>
      {!compact && <>
        <div className="weight-subhead">
          <h3 id="python-title">Pythonエディタ</h3>
          <span className="weight-python-status" role="status" data-status={report.status}>{statusText[report.status]}</span>
        </div>
        <p id="weight-python-inputs"><code>n = {n}</code><code>target = {target ?? '—'}</code><span>計量の index は 0 始まり</span></p>
      </>}
      <PythonCodeEditor code={code} onChange={onChange} label={label}
        describedBy={compact ? undefined : 'weight-python-inputs'} readOnly={busy} />
      {onRun && onStop && <div className="weight-python-actions">
        <button type="button" className="weight-primary" disabled={!canRun || !code.trim()} onClick={onRun}>実行</button>
        <button type="button" className="weight-secondary" disabled={!busy} onClick={onStop}>停止</button>
      </div>}
      {!compact && report.status === 'failed' && <pre className="weight-python-error" role="alert">{report.message}</pre>}
      {report.status === 'finished' && (!compact || !report.verified) && (
        <div className="weight-python-result" aria-live="polite">
          <p><code>result = {report.index}</code>{report.index === n && <span>該当する鉱石なし</span>}</p>
          <p data-correct={report.correct}>{report.correct
            ? report.verified ? '正解。計量結果から確認できました。' : '位置は正しいですが、計量による確認が不足しています。'
            : '不正解。注文を満たす最初の位置を確認してください。'}</p>
          <p>{report.cost.count} 回 · {report.cost.power} pt · {report.cost.ticks} Tick</p>
        </div>
      )}
    </section>
  )
}
