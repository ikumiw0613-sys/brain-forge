import { PythonEditor } from '../../features/weight-search/PythonEditor'
import type { PythonReport } from '../../factory/python/usePythonSearch'
import type { Measurement } from '../../factory/warehouse/engine'
import type { MachineStatus } from '../../factory/manufacturing/engine'

export type MapEditorData = {
  draft: string
  onChange: (draft: string) => void
  onApply: () => void
  program: { active: string; queued: string | null }
  report: PythonReport
  n: number
  target: number
  measurements: readonly Measurement[]
}

export type MapDelivery = Pick<Measurement, 'index' | 'weight'> & { readonly orderId: string }

export function MapPythonActions({ draft, program, onApply }: Pick<MapEditorData, 'draft' | 'program' | 'onApply'>) {
  const unchanged = draft === (program.queued ?? program.active)
  return (
    <>
      <span className="map-editor-queued" role="status">{program.queued !== null ? '予約中' : ''}</span>
      <button className="map-editor-apply" type="button" disabled={unchanged || !draft.trim()} onClick={onApply}>適用</button>
    </>
  )
}

export function MapPythonEditor({ data }: { data: MapEditorData }) {
  return (
    <div className="map-editor">
      <PythonEditor code={data.draft} report={data.report} n={data.n} target={data.target} busy={false} compact
        label="warehouse.py" onChange={data.onChange} />
    </div>
  )
}

const eventLimit = 20

export function MapEventLog({ orderId, started, measurements, delivery, status, completed, report }: {
  orderId?: string; started: boolean; measurements: readonly Measurement[]
  delivery: MapDelivery | null; status?: MachineStatus; completed?: number
  report: PythonReport
}) {
  const events = []
  // The delivery receipt records the atomic dispatch and acceptance of one part.
  const isCurrentDelivery = delivery?.orderId === orderId
  const dispatchedPart = delivery && {
    label: isCurrentDelivery ? '部品発送・受取' : '直近の部品発送・受取',
    detail: `${delivery.orderId} · 棚 ${delivery.index} · ${delivery.weight} kg`,
  }
  if (dispatchedPart && !isCurrentDelivery) events.push(dispatchedPart)
  if (completed && status !== 'COMPLETED') events.push({ label: '直近の製造完了', detail: `累計 ${completed.toLocaleString('ja-JP')} 個` })
  if (started && orderId) events.push({ label: '注文受信', detail: orderId })
  for (const { index, weight, qualifies } of measurements.slice(-eventLimit)) {
    events.push({ label: '計量完了', detail: `棚 ${index} · ${weight} kg · ${qualifies ? '条件を満たす' : '必要重量未満'}` })
  }
  if (dispatchedPart && isCurrentDelivery) events.push(dispatchedPart)
  if (completed && status === 'COMPLETED') {
    events.push({ label: '製造完了', detail: [orderId, `累計 ${completed.toLocaleString('ja-JP')} 個`].filter(Boolean).join(' · ') })
  }
  if (report.status === 'failed') events.push({ label: 'Python実行エラー', detail: report.message })
  return (
    <div className="map-events" id="map-events-panel">
      {events.length ? <ol>
        {events.slice(-eventLimit).reverse().map(({ label, detail }, index) => <li key={index}>
          <strong>{label}</strong><span>{detail}</span>
        </li>)}
      </ol> : <p className="map-tool-empty">工場の稼働を開始すると、注文や計量結果が表示されます。</p>}
    </div>
  )
}
