import { useState } from 'react'
import type { WeightSearchView } from './engine'
import { powerPerWeigh, shippingReward, ticksPerWeigh } from './engine'
import { initialPythonCode, PythonEditor } from './PythonEditor'
import { shelvesPerRow } from './robotMotion'
import type { RobotMotion } from './robotMotion'
import { CandidateSummary, MeasurementLog, verdict } from './SearchFeedback'
import { usePythonSearch } from './usePythonSearch'
import { useWeightSearch } from './useWeightSearch'
import { WeightSearchGantry } from './WeightSearchGantry'
import './weightSearch.css'

const signed = (value: number) => value > 0 ? `+${value}` : String(value)

function Warehouse({ view, motion, weigh, manual }: {
  view: WeightSearchView
  motion: RobotMotion | null
  weigh: (index: number) => void
  manual: boolean
}) {
  const unavailable = !manual || Boolean(motion || view.completion)
  const rows = [
    { name: '奥側', slots: view.slots.slice(0, shelvesPerRow) },
    { name: '手前側', slots: view.slots.slice(shelvesPerRow) },
  ]
  return (
    <section className="weight-warehouse" aria-labelledby="warehouse-title">
      <div className="weight-subhead">
        <h3 id="warehouse-title">鉱石倉庫</h3>
        <span className="weight-sort">軽い <span aria-hidden="true">⟶</span> 重い</span>
      </div>
      <div className="weight-slot-legend" id="shelf-legend">
        <span><i className="weight-legend-candidate" aria-hidden="true" />候補</span>
        <span><b aria-hidden="true">×</b> 除外済み</span>
        <span><b aria-hidden="true">◆</b> ロボット操作中</span>
      </div>
      {rows.map(row => (
        <div key={row.name} className="weight-slots-row">
          <span className="weight-row-name">{row.name}</span>
          <div className="weight-slots" role="group" aria-label={row.name}>
            {row.slots.map(({ index, measurement, candidate }) => {
              const label = measurement ? `${measurement.weight} kg、${verdict(measurement)}` : '未計量'
              const shipped = view.completion?.shipped.index === index
              const active = motion?.index === index
              const operation = active ? (view.pending ? '、計量中' : '、ロボット操作中') : ''
              return (
                <button key={index} type="button" aria-disabled={unavailable}
                  aria-label={`鉱石 ${index}、${shipped ? '出荷済み、' : ''}${label}、${candidate ? '探索候補' : '除外済み'}${operation}`}
                  onClick={() => { if (!unavailable) weigh(index) }}
                  data-candidate={candidate} data-active={active}
                  data-result={measurement ? (measurement.qualifies ? 'pass' : 'light') : undefined}>
                  <span className="weight-slot-number">
                    {!candidate && <span className="weight-slot-excluded-mark" aria-hidden="true">×</span>}
                    {index}
                    {active && <span className="weight-slot-active-mark" aria-hidden="true">◆</span>}
                  </span>
                  <span className="weight-slot-reading">{shipped ? '出荷済み' : measurement ? `${measurement.weight} kg` : '—'}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="weight-help">{manual
        ? '鉱石を選ぶと計量できます。計量済みの重量は下のログでも確認でき、再計量にも同じコストがかかります。'
        : 'Pythonの await weigh(index) で、同じ番号の棚を計量します。'}</p>
    </section>
  )
}

function CostComparison({ completion }: { completion: NonNullable<WeightSearchView['completion']> }) {
  const { actual, linear, savedPower } = completion
  return (
    <section className="weight-comparison" aria-labelledby="comparison-title">
      <h3 id="comparison-title">線形探索との比較</h3>
      <table>
        <thead><tr><th scope="col">指標</th><th scope="col">今回</th><th scope="col">線形探索</th></tr></thead>
        <tbody>
          <tr><th scope="row">計量回数</th><td>{actual.count} 回</td><td>{linear.count} 回</td></tr>
          <tr><th scope="row">消費電力</th><td>{actual.power} pt</td><td>{linear.power} pt</td></tr>
          <tr><th scope="row">処理時間</th><td>{actual.ticks} Tick</td><td>{linear.ticks} Tick</td></tr>
        </tbody>
      </table>
      <p className="weight-delta" data-negative={savedPower < 0}>
        <span>電力削減量 <small>線形探索 − 今回</small></span>
        <strong>{signed(savedPower)} pt</strong>
      </p>
    </section>
  )
}

export function WeightSearchPrototype({ initialSample, random = Math.random }: {
  initialSample: number
  random?: () => number
}) {
  const game = useWeightSearch(initialSample, random)
  const python = usePythonSearch(game)
  const [manual, setManual] = useState(false)
  const [code, setCode] = useState(initialPythonCode)
  const { view, robot, weigh, ship, nextOrder } = game
  const { parked, motion } = robot
  const { order, cost, pending, confirmed, completion, log, history } = view
  const latest = log.at(-1)
  const shipping = motion?.kind === 'ship'
  const canShip = confirmed !== null && !motion && !completion && !python.busy
  const scaleReading = pending ? `鉱石 ${pending.index} を計量中 ${pending.elapsedTicks}/${ticksPerWeigh} Tick`
    : latest ? `鉱石 ${latest.index} · ${latest.weight} kg · ${verdict(latest)}${motion?.retractAt !== undefined ? ' · アーム上昇中' : ''}` : '計量待機'
  const gateReading = shipping ? `鉱石 ${motion.index} を搬送中`
    : completion ? `鉱石 ${completion.shipped.index} · ${completion.shipped.weight} kg を出荷完了`
      : canShip ? `鉱石 ${confirmed} を出荷できます` : '出荷待機'

  return (
    <div className="weight-prototype">
      <header className="weight-topbar">
        <div className="weight-shell">
          <div className="weight-brand"><span className="weight-mark" aria-hidden="true">⟁</span>Brain Forge</div>
          <span className="weight-prototype-label">GAMEPLAY PROTOTYPE 02-C</span>
        </div>
      </header>
      <main className="weight-shell weight-main">
        <section className="weight-overview" aria-label="現在の注文と操作モード">
          <div className="weight-order">
            <div className="weight-order-line"><span>注文番号 <strong>{order.id}</strong></span>
              <span className="weight-order-status" data-complete={Boolean(completion)}>{completion ? '処理済み' : '受付中'}</span></div>
            <h1><strong>{order.requiredWeight}<small> kg</small></strong><span>以上で最も軽い鉱石を出荷</span></h1>
          </div>
          <div className="weight-mode">
            <span id="weight-mode-title">操作モード</span>
            <div role="group" aria-labelledby="weight-mode-title">
              <button type="button" aria-pressed={manual} onClick={() => { python.stop(); setManual(true) }}>手動</button>
              <button type="button" aria-pressed={!manual} onClick={() => setManual(false)}>Python</button>
            </div>
          </div>
        </section>

        <div className="weight-layout">
          <div className="weight-factory-column">
            <dl className="weight-metrics" aria-label="今回の計量コスト">
              <div><dt>計量回数</dt><dd>{cost.count}<small> 回</small></dd>
                <dd className="weight-metric-delta">{latest ? '直近 +1 回' : '直近 —'}</dd></div>
              <div><dt>今回の消費電力</dt><dd>{cost.power}<small> pt</small></dd>
                <dd className="weight-metric-delta">{latest ? `直近 +${powerPerWeigh} pt` : '直近 —'}</dd></div>
              <div><dt>今回の処理時間</dt><dd>{cost.ticks}<small> Tick</small></dd>
                <dd className="weight-metric-delta">{latest ? `直近 +${ticksPerWeigh} Tick` : '直近 —'}</dd></div>
            </dl>
            <section className="weight-panel weight-factory" aria-labelledby="factory-title">
              <div className="weight-panel-head"><h2 id="factory-title">ロボット計量倉庫</h2>
                <span className="weight-unit-cost">計量 1 回 / {powerPerWeigh} pt・{ticksPerWeigh} Tick</span></div>
              <CandidateSummary candidates={view.candidates} slots={view.slots} order={order} log={log} />
              <div className="weight-stations">
                <div><h3>計量ロボット</h3><p role="status">{scaleReading}</p></div>
                <div><h3>出荷ゲート</h3><p role="status">{gateReading}</p></div>
              </div>
              <WeightSearchGantry slots={view.slots} parked={parked} motion={motion} latest={latest}
                shipped={completion?.shipped} shippedCount={history.length} />
              <Warehouse view={view} motion={motion} weigh={weigh} manual={manual} />
              <MeasurementLog log={log} target={order.requiredWeight} />
            </section>
          </div>

          <aside className="weight-panel weight-console" aria-labelledby="console-title">
            <div className="weight-panel-head"><h2 id="console-title">探索コントロール</h2></div>
            {!manual && <PythonEditor code={code} report={python.report} n={view.slots.length} target={order.requiredWeight}
              canRun={!motion && !completion && !python.busy} busy={python.busy}
              onChange={setCode} onRun={() => python.start(code)} onStop={python.stop} />}
            <div className="weight-ship-actions">
              {completion ? (
                <button type="button" className="weight-primary" onClick={() => { nextOrder(); python.clearReport() }}>
                  次の注文を受ける <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button type="button" className="weight-primary" disabled={!canShip}
                  onClick={() => { if (confirmed !== null) ship(confirmed) }}>
                  <span>{shipping ? '出荷搬送中' : confirmed === null ? '出荷する' : `鉱石 ${confirmed} を出荷する`}</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
            {completion && <CostComparison completion={completion} />}
          </aside>
        </div>

        <section className="weight-panel weight-totals" aria-labelledby="total-title">
          <div className="weight-panel-head"><h2 id="total-title">工場の累計</h2>
            <span className="weight-unit-cost">出荷 1 件 / {shippingReward} クレジット</span></div>
          <dl>
            <div><dt>累計消費電力</dt><dd>{view.totalPower}<small> pt</small></dd></div>
            <div><dt>獲得クレジット</dt><dd>{view.credits}<small> クレジット</small></dd></div>
            <div><dt>処理済み注文数</dt><dd>{history.length}<small> 件</small></dd></div>
          </dl>
          {history.length > 0 && (
            <details className="weight-history">
              <summary>注文履歴</summary>
              <ul>{[...history].reverse().map(item => (
                <li key={item.order.id}>
                  <strong>{item.order.id}</strong><span>{item.order.requiredWeight} kg 以上</span>
                  <span>{item.actual.count} 回・{item.actual.power} pt</span>
                  <span>電力削減 {signed(item.savedPower)} pt</span>
                </li>
              ))}</ul>
            </details>
          )}
        </section>
      </main>
    </div>
  )
}
