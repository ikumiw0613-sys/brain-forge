import { useRef, useState } from 'react'
import { ManufacturingCodePanel } from './ManufacturingCodePanel'
import { StackedWarehouse } from '../../features/weight-search/StackedWarehouse'
import { getWeightSearchView } from '../../factory/warehouse/engine'
import type { FactoryRuntime } from '../../factory/runtime/useFactoryRuntime'

export function FactoryWarehouse({ runtime }: { runtime: FactoryRuntime }) {
  const { line, instant, setInstant, draft, setDraft } = runtime
  const [codeOpen, setCodeOpen] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const view = getWeightSearchView(line.search)
  const latest = view.log.at(-1)
  const delivery = line.lastDelivery
  return (
    <div className="manufacturing factory-warehouse">
      <header className="manufacturing-header"><div>◈ <strong>Brain Forge</strong>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/`}>工場マップ</a>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}prototypes/manufacturing/`}>製造工場へ</a>
      </div></header>
      <div className="manufacturing-workspace">
        <main className="manufacturing-main">
          <div className="manufacturing-title"><div><p>部品供給</p><h1>部品倉庫</h1></div></div>
          <div className="manufacturing-layout">
            <section className="manufacturing-panel manufacturing-python" aria-labelledby="manufacturing-warehouse">
              <div className="manufacturing-panel-heading"><h2 id="manufacturing-warehouse">製造工場からの依頼</h2><span>{view.order.id}</span></div>
              <StackedWarehouse size={view.slots.length} parked={view.pending?.index ?? latest?.index ?? 0}
                motion={null} bounds={view.candidates} pendingIndex={view.pending?.index} />
              <p id="shelf-legend" className="manufacturing-shelf-legend">シアンの枠は探索候補、ひし形は計量中の棚です。</p>
              <dl className="manufacturing-readings">
                <div><dt>必要重量</dt><dd>{view.order.requiredWeight} kg</dd></div>
                <div><dt>計量中の index</dt><dd>{view.pending?.index ?? '—'}</dd></div>
                <div><dt>直近の計量</dt><dd>{latest ? `index ${latest.index} · ${latest.weight} kg` : '—'}</dd></div>
                <div><dt>今回の計量回数</dt><dd>{view.cost.count} 回</dd></div>
                <div><dt>今回の部品待ち</dt><dd>{line.line.waiting} Tick</dd></div>
                <div><dt>累計電力消費</dt><dd>{view.totalPower} pt</dd></div>
              </dl>
            </section>
            <aside className="manufacturing-panel manufacturing-controls">
              <div className="manufacturing-panel-heading"><h2>製造工場へ供給</h2></div>
              <p><a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/?view=benchmark`}>アルゴリズム性能試験</a></p>
              <p>製造ラインの稼働中は、Pythonで選んだ部品を確認し、自動で製造工場へ送ります。</p>
              <p>{delivery ? `直近の発送：${delivery.orderId} · 棚 ${delivery.index} · ${delivery.weight} kg` : 'まだ発送していません'}</p>
              <label>計量速度<select value={instant ? 'instant' : 'normal'} onChange={event => setInstant(event.target.value === 'instant')}>
                <option value="normal">再生速度に合わせる</option><option value="instant">即時</option>
              </select></label>
              <div className="manufacturing-code-entry">
                <button type="button" ref={editButton} aria-expanded={codeOpen} aria-controls="manufacturing-code-panel"
                  onClick={() => setCodeOpen(!codeOpen)}>コードを編集</button>
                <p role="status">{line.program.queued === null ? '適用済み' : '適用待ち · 次の注文から'}</p>
                {line.report.status === 'loading' && <p role="status">Pyodideを読み込み中</p>}
                {line.report.status === 'running' && <p role="status">Pythonを実行中</p>}
                {line.report.status === 'failed' && <p className="manufacturing-python-error" role="alert">Pythonでエラーが発生しました。</p>}
                {line.report.status === 'finished' && !line.report.verified && <p className="manufacturing-python-error" role="alert">
                  {line.report.correct ? '計量による確認が不足しています。' : '探索結果が正しくありません。'}
                </p>}
              </div>
            </aside>
          </div>
        </main>
        <ManufacturingCodePanel open={codeOpen} onClose={() => {
          setCodeOpen(false)
          editButton.current?.focus()
        }} draft={draft} onChange={setDraft} onApply={() => line.applyCode(draft)}
          program={line.program} report={line.report} n={view.slots.length} target={view.order.requiredWeight} />
      </div>
    </div>
  )
}
