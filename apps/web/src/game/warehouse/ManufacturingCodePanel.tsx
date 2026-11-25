import { useEffect, useRef, useState } from 'react'
import { PythonEditor } from '../../features/weight-search/PythonEditor'
import type { PythonReport } from '../../factory/python/usePythonSearch'
import type { Measurement } from '../../factory/warehouse/engine'
import './warehouseCodePanel.css'

const minWidth = 30
const maxWidth = 62

export function ManufacturingCodePanel({ open, onClose, draft, onChange, onApply, program, report, n, target,
  orderId, measurements, running }: {
  open: boolean
  onClose: () => void
  draft: string
  onChange: (code: string) => void
  onApply: () => void
  program: { active: string; queued: string | null }
  report: PythonReport
  n: number
  target: number | null
  orderId?: string
  measurements: readonly Measurement[]
  running: boolean
}) {
  const [width, setWidth] = useState(40)
  const closeButton = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ pointer: number; startX: number; startWidth: number } | null>(null)
  const changeWidth = (value: number) => setWidth(Math.min(maxWidth, Math.max(minWidth, Math.round(value))))
  const dirty = draft !== (program.queued ?? program.active)
  const queued = program.queued !== null
  const latestMeasurements = open ? measurements.slice(-5).reverse() : []
  const outcome = report.status === 'finished'
    ? report.verified ? '探索成功' : '部品未確定'
    : report.status === 'failed' ? '探索失敗' : null

  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  return (
    <aside id="manufacturing-code-panel" className="manufacturing-code-panel" aria-label="Pythonコード編集"
      hidden={!open} style={{ width: `${width}vw` }} onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented) onClose()
      }}>
      <div role="separator" tabIndex={0} aria-label="コードパネルの幅" aria-orientation="vertical"
        className="manufacturing-code-resize" aria-controls="manufacturing-code-panel"
        aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={width} aria-valuetext={`${width}%`}
        onPointerDown={event => {
          if (event.button !== 0) return
          drag.current = { pointer: event.pointerId, startX: event.clientX, startWidth: width }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const start = drag.current
          if (start?.pointer === event.pointerId) changeWidth(start.startWidth + (start.startX - event.clientX) / window.innerWidth * 100)
        }}
        onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={event => {
          const next = { ArrowLeft: width + 2, ArrowRight: width - 2, Home: minWidth, End: maxWidth }[event.key]
          if (next === undefined) return
          event.preventDefault()
          changeWidth(next)
        }} />
      <div className="manufacturing-code-toolbar warehouse-code-header">
        <h2>Python制御盤</h2>
        <button type="button" ref={closeButton} onClick={onClose}>閉じる</button>
      </div>
      <dl className="warehouse-code-states" aria-label="コードの適用状態" aria-live="polite">
        <div><dt>下書き</dt><dd data-state={dirty ? 'edited' : undefined}>{dirty ? '未適用の編集あり' : queued ? '予約コードと一致' : '適用コードと一致'}</dd></div>
        <div><dt>次の注文</dt><dd data-state={queued ? 'queued' : undefined}>{queued ? '適用待ち' : '予約なし'}</dd></div>
        <div><dt>稼働コード</dt><dd data-state="active">{running && report.status === 'running' ? '実行中' : '適用済み'}</dd></div>
      </dl>
      <div className="manufacturing-code-toolbar warehouse-code-actions">
        <a href={`${import.meta.env.BASE_URL}map/?view=benchmark`}>性能試験へ</a>
        <button type="button" disabled={!dirty || !draft.trim()} onClick={onApply}>適用</button>
      </div>
      <div className="warehouse-code-file"><code>main.py</code><span>下書き</span></div>
      <PythonEditor code={draft} report={report} n={n} target={target} busy={false} onChange={onChange} />
      <section className="warehouse-code-log" aria-labelledby="warehouse-code-log-title">
        <div className="warehouse-code-log-heading">
          <h3 id="warehouse-code-log-title">計量ログ</h3>{orderId && <code>{orderId}</code>}
          {outcome && <span>{outcome}</span>}
        </div>
        {latestMeasurements.length > 0 ? <ul>
          {latestMeasurements.map(({ index, weight, qualifies }, offset) => (
            <li key={measurements.length - offset}>
              <span>棚 {index}</span><strong>{weight} kg</strong><span>{qualifies ? '条件を満たす' : '必要重量未満'}</span>
            </li>
          ))}
        </ul> : <p>この注文の計量結果はまだありません。</p>}
      </section>
      <div className="warehouse-code-inspect">
        <details><summary>適用中のコードを表示</summary><pre>{program.active}</pre></details>
        {program.queued !== null && <details><summary>予約コードを表示</summary><pre>{program.queued}</pre></details>}
      </div>
    </aside>
  )
}
