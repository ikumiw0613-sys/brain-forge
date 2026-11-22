import { useEffect, useRef, useState } from 'react'
import { PythonEditor } from '../weight-search/PythonEditor'
import type { PythonReport } from '../weight-search/usePythonSearch'

const minWidth = 30
const maxWidth = 62

export function ManufacturingCodePanel({ open, onClose, draft, onChange, onApply, program, report, n, target }: {
  open: boolean
  onClose: () => void
  draft: string
  onChange: (code: string) => void
  onApply: () => void
  program: { active: string; queued: string | null }
  report: PythonReport
  n: number
  target: number
}) {
  const [width, setWidth] = useState(40)
  const closeButton = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ pointer: number; startX: number; startWidth: number } | null>(null)
  const changeWidth = (value: number) => setWidth(Math.min(maxWidth, Math.max(minWidth, Math.round(value))))
  const dirty = draft !== (program.queued ?? program.active)

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
      <div className="manufacturing-code-toolbar">
        <span role="status">{program.queued === null ? '適用済み' : '適用待ち · 次の注文から'}{dirty && ' / 未適用の編集あり'}</span>
        <button type="button" ref={closeButton} onClick={onClose}>閉じる</button>
      </div>
      <PythonEditor code={draft} report={report} n={n} target={target} busy={false} onChange={onChange} />
      <div className="manufacturing-code-toolbar">
        <p>適用したコードは、実行中の注文が完了してから有効になります。</p>
        <button type="button" disabled={!dirty || !draft.trim()} onClick={onApply}>適用</button>
      </div>
    </aside>
  )
}
