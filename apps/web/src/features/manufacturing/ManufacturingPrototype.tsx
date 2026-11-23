import { useRef, useState } from 'react'
import { conveyorSpeeds } from '../game/conveyor'
import type { ConveyorSpeed } from '../game/conveyor'
import { dashboardWindowTicks, getManufacturingDashboard, productionTicks, supplyPresets } from './engine'
import type { MachineStatus, SupplyTicks } from './engine'
import { getWeightSearchView } from '../weight-search/engine'
import { initialPythonCode } from '../weight-search/PythonEditor'
import { StackedWarehouse } from '../weight-search/StackedWarehouse'
import { defaultSupplySeed } from './pythonSupply'
import { useManufacturingLine } from './useManufacturingLine'
import type { SupplyMode } from './useManufacturingLine'
import { ManufacturingCodePanel } from './ManufacturingCodePanel'
import '../weight-search/weightSearch.css'
import './manufacturing.css'

const labels: Record<MachineStatus, string> = {
  WAITING: '部品待ち', RECEIVED: '部品受取', PROCESSING: '製造中', COMPLETED: '出荷完了',
}
const supplies: Record<SupplyTicks, string> = { 4: '高速供給', 16: '通常供給', 64: '低速供給' }

export function ManufacturingPrototype({ seed = defaultSupplySeed }: { seed?: number }) {
  const [mode, setMode] = useState<SupplyMode>('preset')
  const [speed, setSpeed] = useState<ConveyorSpeed>(1)
  const [instant, setInstant] = useState(false)
  const [draft, setDraft] = useState(initialPythonCode)
  const [codeOpen, setCodeOpen] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const line = useManufacturingLine(mode, speed, instant, seed, initialPythonCode)
  const { line: state, search, started } = line
  const pythonMode = mode === 'python'
  const view = pythonMode ? getWeightSearchView(search) : null
  const latest = view?.log.at(-1)
  const dashboard = getManufacturingDashboard(state)

  const utilization = state.tick ? (state.totalProcessing / state.tick * 100).toFixed(1) : '0.0'
  return (
    <div className="manufacturing">
      <header className="manufacturing-header"><div>◈ <strong>Brain Forge</strong>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/`}>工場マップ</a>
        <span>Gameplay Prototype 04-B</span>
      </div></header>
      <section className="manufacturing-dashboard" aria-label="生産ダッシュボード">
        <p>生産指標 · 直近{dashboardWindowTicks} Tick</p>
        <dl>
          <div><dt>累計売上</dt><dd>{dashboard.revenue.toLocaleString('ja-JP')}<small> Cr</small></dd></div>
          <div><dt>生産速度</dt><dd>{dashboard.productionRate.toFixed(2)}<small> 個/100 Tick</small></dd></div>
          <div><dt>製造機械稼働率</dt><dd>{dashboard.utilization.toFixed(1)}<small> %</small></dd></div>
          <div><dt>部品待ち率</dt><dd>{dashboard.waitingRate.toFixed(1)}<small> %</small></dd></div>
        </dl>
      </section>
      <div className="manufacturing-workspace">
      <main className="manufacturing-main">
        <div className="manufacturing-title"><div><p>製造ライン</p><h1>部品供給と生産</h1></div><span data-running={state.running}>{state.running ? '● 稼働中' : started ? '● 一時停止中' : '● 停止中'}</span></div>
        <div className="manufacturing-layout">
          <section className="manufacturing-panel manufacturing-factory" aria-labelledby="factory-title">
            <div className="manufacturing-panel-heading"><h2 id="factory-title">製造機械</h2><span>製造時間 {productionTicks} Tick / 個</span></div>
            <svg className="manufacturing-scene" viewBox="0 0 900 430" role="img" aria-label={`部品搬入口、製造機械、製品出荷口。現在${labels[state.status]}`}>
              <defs><pattern id="manufacturing-grid" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .32 -.7 .45 0 0)"><path d="M46 0H0V46" fill="none" stroke="#58708a" strokeWidth="1" /></pattern></defs>
              <rect width="900" height="430" fill="#0c1726" /><rect width="900" height="430" fill="url(#manufacturing-grid)" opacity=".36" />
              <path d="M47 304 497 155 868 280 411 425Z" fill="#15283a" stroke="#4c6379" />
              <path d="M98 285 330 212 425 241 190 321Z" fill="#394d5e" stroke="#8399a5" /><path d="M98 285v21l92 37v-22zm92 36 235-80v22l-235 80z" fill="#253747" stroke="#566e80" />
              <path d="M484 270 653 214 824 269 653 328Z" fill="#394d5e" stroke="#8399a5" /><path d="M484 270v22l169 59v-23zm169 58 171-59v22l-171 60z" fill="#253747" stroke="#566e80" />
              <g className="manufacturing-machine" data-processing={state.status === 'PROCESSING'}>
                <path d="M300 116 434 69 578 115 444 164Z" fill="#5e7483" stroke="#9bb0bc" />
                <path d="M300 116v147l144 50V164Z" fill="#354a5b" stroke="#79919f" />
                <path d="M444 164v149l134-48V115Z" fill="#263d4e" stroke="#708b99" />
                <path d="M321 154v83l98 34v-83z" fill="#122436" stroke="#7795a6" />
                <path d="M332 169v58l76 26v-58z" fill="#0b1825" stroke="#476d7d" />
                <circle className="manufacturing-lamp" cx="475" cy="185" r="8" />
                <path d="M463 223l82-29v10l-82 29zm0 22 82-29v10l-82 29z" fill="#536c7b" />
                <path d="M335 110l66-23 48 15-67 24z" fill="#d28c47" />
              </g>
              <g transform="translate(73 75)" className="manufacturing-label"><text>部品搬入口</text><text y="25">{state.status === 'WAITING' ? `${state.waiting}${pythonMode ? '' : ` / ${state.supplyTicks}`} Tick` : '搬入完了'}</text></g>
              <g transform="translate(690 90)" className="manufacturing-label"><text>製品出荷口</text><text y="25">{state.completed} 個</text></g>
              <g transform="translate(340 350)" className="manufacturing-label"><text>{labels[state.status]}</text><text y="25">{state.progress} / {productionTicks} Tick</text></g>
            </svg>
            <div className="manufacturing-progress"><span>{labels[state.status]}</span><progress max={productionTicks} value={state.progress} aria-label="製造進捗" /><strong>{state.progress} / {productionTicks} Tick</strong></div>
          </section>
          <aside className="manufacturing-panel manufacturing-controls">
            <div className="manufacturing-panel-heading"><h2>稼働設定</h2></div>
            <label>供給モード<select value={mode} onChange={event => {
              line.reset()
              setCodeOpen(false)
              setMode(event.target.value === 'python' ? 'python' : 'preset')
            }}><option value="preset">仮供給</option><option value="python">Python供給</option></select></label>
            {pythonMode ? <label>計量速度<select value={instant ? 'instant' : 'normal'} onChange={event => setInstant(event.target.value === 'instant')}>
              <option value="normal">再生速度に合わせる</option><option value="instant">即時</option>
            </select></label> : <>
            <label>部品供給時間<select aria-label="部品供給時間" value={state.supplyTicks} onChange={event => {
              const ticks = supplyPresets.find(value => value === Number(event.target.value))
              if (ticks) line.setSupplyTicks(ticks)
            }}>{supplyPresets.map(value => <option key={value} value={value}>{supplies[value]} · {value} Tick</option>)}</select></label>
            <p>待機中に変更すると、現在の部品要求から新しい供給時間を適用します。</p>
            </>}
            <label>再生速度<select aria-label="再生速度" value={speed} onChange={event => {
              const value = conveyorSpeeds.find(option => option === Number(event.target.value))
              if (value) setSpeed(value)
            }}>{conveyorSpeeds.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
            <div className="manufacturing-buttons">
              <button type="button" className="manufacturing-primary" onClick={line.toggle}>
                {state.running ? '一時停止' : started ? '再開' : '開始'}</button>
              <button type="button" onClick={line.reset}>リセット</button>
            </div>
            {pythonMode && <div className="manufacturing-code-entry">
              <button type="button" ref={editButton} aria-expanded={codeOpen} aria-controls="manufacturing-code-panel"
                onClick={() => setCodeOpen(!codeOpen)}>コードを編集</button>
              <p role="status">{line.program.queued === null ? '適用済み' : '適用待ち · 次の注文から'}</p>
              {line.report.status === 'loading' && <p role="status">Pyodideを読み込み中</p>}
              {line.report.status === 'running' && <p role="status">Pythonを実行中</p>}
              {line.report.status === 'failed' && <p className="manufacturing-python-error" role="alert">Pythonでエラーが発生しました。</p>}
              {line.report.status === 'finished' && !line.report.verified && <p className="manufacturing-python-error" role="alert">
                {line.report.correct ? '計量による確認が不足しています。' : '探索結果が正しくありません。'}
              </p>}
            </div>}
          </aside>
        </div>
        <section className="manufacturing-panel manufacturing-stats" aria-labelledby="stats-title">
          <div className="manufacturing-panel-heading"><h2 id="stats-title">生産統計</h2></div>
          <dl>
            <div><dt>経過時間</dt><dd>{state.tick}<small> Tick</small></dd></div>
            <div><dt>製造完了数</dt><dd>{state.completed}<small> 個</small></dd></div>
            <div><dt>累計部品待ち</dt><dd>{state.totalWaiting}<small> Tick</small></dd></div>
            <div><dt>累計製造時間</dt><dd>{state.totalProcessing}<small> Tick</small></dd></div>
            <div><dt>機械稼働率</dt><dd>{utilization}<small> %</small></dd></div>
            <div><dt>売上</dt><dd>{dashboard.revenue}<small> クレジット</small></dd></div>
          </dl>
        </section>
        {view && <section className="manufacturing-panel manufacturing-python" aria-labelledby="manufacturing-warehouse">
            <div className="manufacturing-panel-heading"><h2 id="manufacturing-warehouse">部品倉庫</h2><span>{view.order.id}</span></div>
            <StackedWarehouse size={view.slots.length} parked={view.pending?.index ?? latest?.index ?? 0}
              motion={null} bounds={view.candidates} pendingIndex={view.pending?.index} />
            <p id="shelf-legend" className="manufacturing-shelf-legend">シアンの枠は探索候補、ひし形は計量中の棚です。</p>
            <dl className="manufacturing-readings">
              <div><dt>必要重量</dt><dd>{view.order.requiredWeight} kg</dd></div>
              <div><dt>計量中の index</dt><dd>{view.pending?.index ?? '—'}</dd></div>
              <div><dt>直近の計量</dt><dd>{latest ? `index ${latest.index} · ${latest.weight} kg` : '—'}</dd></div>
              <div><dt>今回の計量回数</dt><dd>{view.cost.count} 回</dd></div>
              <div><dt>今回の部品待ち</dt><dd>{state.waiting} Tick</dd></div>
              <div><dt>累計電力消費</dt><dd>{view.totalPower} pt</dd></div>
            </dl>
        </section>}
      </main>
      {view && <ManufacturingCodePanel open={codeOpen} onClose={() => {
        setCodeOpen(false)
        editButton.current?.focus()
      }} draft={draft} onChange={setDraft} onApply={() => line.applyCode(draft)}
        program={line.program} report={line.report} n={view.slots.length} target={view.order.requiredWeight} />}
      </div>
    </div>
  )
}
