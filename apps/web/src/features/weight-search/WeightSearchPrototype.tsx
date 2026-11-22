import { useState } from 'react'
import type { Measurement, WeightSearchView } from './engine'
import { powerPerWeigh, shippingReward, ticksPerWeigh } from './engine'
import { initialPythonCode, PythonEditor } from './PythonEditor'
import { usePythonSearch } from './usePythonSearch'
import { useWeightSearch } from './useWeightSearch'
import { WeightSearchLine } from './WeightSearchLine'
import './weightSearch.css'

const slotNumber = (index: number) => String(index + 1).padStart(2, '0')
const verdict = (result: Measurement) => result.qualifies ? '条件を満たす' : '必要重量未満'
const signed = (value: number) => value > 0 ? `+${value}` : String(value)

function OreIcon() {
  return (
    <svg className="weight-ore" viewBox="0 0 48 38" fill="none" aria-hidden="true">
      <path d="M5 29l13-8 25 6-15 9z" fill="#080f18" opacity=".7" />
      <path d="m7 22 9-14 15-4 10 10-2 12-13 7-14-5z" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.2" />
      <path d="m7 22 13-5 6 16-14-5z" fill="currentColor" fillOpacity=".28" />
      <path d="m16 8 15-4-11 13-13 5zM20 17l11-13 10 10-13 5z" fill="currentColor" fillOpacity=".68" />
      <path d="m28 19 13-5-2 12-13 7z" fill="#0b151f" fillOpacity=".4" />
      <path d="m7 22 13-5 8 2 13-5m-21 3 6 16" stroke="currentColor" strokeWidth="1" strokeOpacity=".7" />
    </svg>
  )
}

function Warehouse({ view, weigh, manual }: { view: WeightSearchView; weigh: (index: number) => void; manual: boolean }) {
  const unavailable = !manual || Boolean(view.pending || view.completion)
  return (
    <section className="weight-warehouse" aria-labelledby="warehouse-title">
      <div className="weight-subhead">
        <h3 id="warehouse-title">鉱石倉庫</h3>
        <span className="weight-sort">軽い <span aria-hidden="true">⟶</span> 重い</span>
      </div>
      <div className="weight-slots">
        {view.slots.map(({ index, measurement, candidate }) => {
          const active = view.pending?.index === index
          const label = measurement ? `${measurement.weight} kg、${verdict(measurement)}` : '未計量'
          return (
            <button key={index} type="button" aria-disabled={unavailable}
              aria-label={`鉱石 ${slotNumber(index)}、${label}${candidate ? '、探索候補' : ''}`}
              onClick={() => { if (!unavailable) weigh(index) }}
              data-candidate={candidate} data-active={active}
              data-result={measurement ? (measurement.qualifies ? 'pass' : 'light') : undefined}>
              <span className="weight-slot-number">{slotNumber(index)}</span>
              <OreIcon />
              <span className="weight-slot-reading">{measurement ? `${measurement.weight} kg` : '—'}</span>
            </button>
          )
        })}
      </div>
      <p className="weight-help">{manual
        ? '鉱石を選ぶと計量できます。計量済みの重量は下のログでも確認でき、再計量にも同じコストがかかります。'
        : 'Pythonの await weigh(index) で計量します。index 0 は倉庫の鉱石 01 に対応します。'}</p>
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

function MeasurementLog({ log }: { log: WeightSearchView['log'] }) {
  return (
    <section className="weight-log" aria-labelledby="log-title">
      <div className="weight-subhead"><h3 id="log-title">計量ログ</h3><span>{log.length} 件</span></div>
      {log.length > 0 ? (
        <ol reversed start={log.length} tabIndex={0} aria-label="計量ログ（新しい順）">
          {[...log].reverse().map((entry, index) => (
            <li key={log.length - index}>
              <span className="weight-log-seq">{String(log.length - index).padStart(2, '0')}</span>
              <span>鉱石 {slotNumber(entry.index)}</span><strong>{entry.weight} kg</strong>
              <span data-qualifies={entry.qualifies}>{verdict(entry)}</span>
            </li>
          ))}
        </ol>
      ) : <p>計量結果がここに表示されます。</p>}
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
  const { view, weigh, ship, nextOrder } = game
  const { order, cost, candidates, pending, confirmed, completion, log, history } = view
  const latest = log.at(-1)
  const candidateCount = candidates.last - candidates.first + 1
  const range = candidates.first === candidates.last ? slotNumber(candidates.first)
    : `${slotNumber(candidates.first)}–${slotNumber(candidates.last)}`
  const canShip = confirmed !== null && !pending && !completion && !python.busy
  const scaleReading = pending ? `鉱石 ${slotNumber(pending.index)} を計量中 ${pending.elapsedTicks}/${ticksPerWeigh} Tick`
    : latest ? `鉱石 ${slotNumber(latest.index)} · ${latest.weight} kg · ${verdict(latest)}` : '計量待機'
  const gateReading = completion ? `鉱石 ${slotNumber(completion.shipped.index)} · ${completion.shipped.weight} kg を出荷完了`
    : canShip ? `鉱石 ${slotNumber(confirmed)} を出荷できます` : '出荷待機'

  return (
    <div className="weight-prototype">
      <header className="weight-topbar">
        <div className="weight-shell">
          <div className="weight-brand"><span className="weight-mark" aria-hidden="true">⟁</span>Brain Forge</div>
          <span className="weight-prototype-label">GAMEPLAY PROTOTYPE 02-A</span>
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
              <div><dt>計量回数</dt><dd>{cost.count}<small> 回</small></dd></div>
              <div><dt>今回の消費電力</dt><dd>{cost.power}<small> pt</small></dd></div>
              <div><dt>今回の処理時間</dt><dd>{cost.ticks}<small> Tick</small></dd></div>
            </dl>
            <section className="weight-panel weight-factory" aria-labelledby="factory-title">
              <div className="weight-panel-head"><h2 id="factory-title">重量探索ライン</h2>
                <span className="weight-unit-cost">計量 1 回 / {powerPerWeigh} pt・{ticksPerWeigh} Tick</span></div>
              <Warehouse view={view} weigh={weigh} manual={manual} />
              <div className="weight-stations">
                <div><h3>計量機</h3><p role="status">{scaleReading}</p></div>
                <div><h3>出荷ゲート</h3><p role="status">{gateReading}</p></div>
              </div>
              <WeightSearchLine pending={pending} latest={latest} measurementCount={cost.count}
                shipped={completion?.shipped} shippedCount={history.length} />
              <MeasurementLog log={log} />
            </section>
          </div>

          <aside className="weight-panel weight-console" aria-labelledby="console-title">
            <div className="weight-panel-head"><h2 id="console-title">探索コントロール</h2></div>
            {!manual && <PythonEditor code={code} report={python.report} n={view.slots.length} target={order.requiredWeight}
              canRun={!pending && !completion && !python.busy} busy={python.busy}
              onChange={setCode} onRun={() => python.start(code)} onStop={python.stop} />}
            <section className="weight-search-status" aria-labelledby="candidate-title">
              <div className="weight-subhead"><h3 id="candidate-title">探索候補範囲</h3><span>{candidateCount} 個</span></div>
              <div className="weight-range" aria-live="polite">鉱石 <strong>{range}</strong></div>
              <div className="weight-range-track" aria-hidden="true">
                {view.slots.map(({ index, candidate }) => <span key={index} data-candidate={candidate} />)}
              </div>
              <p>{completion ? '出荷報酬を獲得しました。' : confirmed !== null
                ? '条件を満たす最も軽い位置が確定しました。'
                : candidateCount === 1 ? '候補の鉱石を計量して、必要重量を満たすことを確認します。'
                  : '重量順を手がかりに、条件を満たし始める位置を絞ります。'}</p>
              {completion ? (
                <button type="button" className="weight-primary" onClick={() => { nextOrder(); python.clearReport() }}>
                  次の注文を受ける <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button type="button" className="weight-primary" disabled={!canShip}
                  onClick={() => { if (confirmed !== null) ship(confirmed) }}>
                  <span>{confirmed === null ? '出荷する' : `鉱石 ${slotNumber(confirmed)} を出荷する`}</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </section>
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
