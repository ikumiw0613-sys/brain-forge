import type { PythonReport } from './usePythonSearch'

export const initialPythonCode = `async def search():
    for i in range(n):
        weight = await weigh(i)
        if weight >= target:
            return i
    return n

result = await search()
`

const statusText: Record<PythonReport['status'], string> = {
  idle: '実行待機',
  loading: 'Pyodideを読み込み中',
  running: 'Pythonを実行中',
  stopped: '実行を停止しました',
  failed: '実行エラー',
  finished: '実行完了',
}

export function PythonEditor({ code, report, n, target, canRun, busy, onChange, onRun, onStop }: {
  code: string
  report: PythonReport
  n: number
  target: number
  canRun: boolean
  busy: boolean
  onChange: (code: string) => void
  onRun: () => void
  onStop: () => void
}) {
  return (
    <section className="weight-python" aria-labelledby="python-title">
      <div className="weight-subhead">
        <h3 id="python-title"><label htmlFor="weight-python-code">Pythonエディタ</label></h3>
        <span className="weight-python-status" role="status" data-status={report.status}>{statusText[report.status]}</span>
      </div>
      <p id="weight-python-inputs"><code>n = {n}</code><code>target = {target}</code><span>計量の index は 0 始まり</span></p>
      <textarea id="weight-python-code" aria-describedby="weight-python-inputs" value={code} readOnly={busy}
        spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={event => onChange(event.target.value)} />
      <div className="weight-python-actions">
        <button type="button" className="weight-primary" disabled={!canRun || !code.trim()} onClick={onRun}>実行</button>
        <button type="button" className="weight-secondary" disabled={!busy} onClick={onStop}>停止</button>
      </div>
      {report.status === 'failed' && <pre className="weight-python-error" role="alert">{report.message}</pre>}
      {report.status === 'finished' && (
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
