import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
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
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const changeHandler = useRef(onChange)
  const editable = useRef(new Compartment())
  changeHandler.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(),
          python(), oneDark, indentUnit.of('    '), EditorState.tabSize.of(4), indentationMarkers(),
          indentOnInput(), bracketMatching(), closeBrackets(),
          keymap.of([...closeBracketsKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editable.current.of([EditorState.readOnly.of(busy), EditorView.editable.of(!busy)]),
          EditorView.contentAttributes.of({
            'aria-label': 'Pythonエディタ',
            'aria-describedby': 'weight-python-inputs',
            spellcheck: 'false',
            autocapitalize: 'off',
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) changeHandler.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    editor.current = view
    return () => { view.destroy(); editor.current = null }
    // The view lives for the lifetime of this editor; updates are applied below.
  }, [])

  useEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
    }
  }, [code])

  useEffect(() => {
    editor.current?.dispatch({ effects: editable.current.reconfigure([
      EditorState.readOnly.of(busy), EditorView.editable.of(!busy),
    ]) })
  }, [busy])

  return (
    <section className="weight-python" aria-labelledby="python-title">
      <div className="weight-subhead">
        <h3 id="python-title">Pythonエディタ</h3>
        <span className="weight-python-status" role="status" data-status={report.status}>{statusText[report.status]}</span>
      </div>
      <p id="weight-python-inputs"><code>n = {n}</code><code>target = {target}</code><span>計量の index は 0 始まり</span></p>
      <div ref={parent} className="weight-code-editor" />
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
