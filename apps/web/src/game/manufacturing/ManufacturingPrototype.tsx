import { conveyorSpeeds } from '../../features/game/conveyor'
import type { FactoryRuntime } from '../../features/factory/useFactoryRuntime'
import { dashboardWindowTicks, getManufacturingDashboard, productionTicks } from '../../factory/manufacturing/engine'
import type { MachineStatus } from '../../factory/manufacturing/engine'
import '../../features/weight-search/weightSearch.css'
import './manufacturing.css'

const labels: Record<MachineStatus, string> = {
  WAITING: '部品待ち', RECEIVED: '部品受取', PROCESSING: '製造中', COMPLETED: '出荷完了',
}
export function ManufacturingPrototype({ runtime }: { runtime: FactoryRuntime }) {
  const { line, speed, setSpeed } = runtime
  const { line: state, search, started, lastDelivery } = line
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
        <div className="manufacturing-title"><div><p>製造ライン</p><h1>製造工場</h1></div><span data-running={state.running}>{state.running ? '● 稼働中' : started ? '● 一時停止中' : '● 停止中'}</span></div>
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
              <g transform="translate(73 75)" className="manufacturing-label"><text>部品搬入口</text><text y="25">{state.status === 'WAITING' ? `倉庫からの到着待ち · ${state.waiting} Tick` : '搬入完了'}</text></g>
              <g transform="translate(690 90)" className="manufacturing-label"><text>製品出荷口</text><text y="25">{state.completed} 個</text></g>
              <g transform="translate(340 350)" className="manufacturing-label"><text>{labels[state.status]}</text><text y="25">{state.progress} / {productionTicks} Tick</text></g>
            </svg>
            <div className="manufacturing-progress"><span>{labels[state.status]}</span><progress max={productionTicks} value={state.progress} aria-label="製造進捗" /><strong>{state.progress} / {productionTicks} Tick</strong></div>
          </section>
          <aside className="manufacturing-panel manufacturing-controls">
            <div className="manufacturing-panel-heading"><h2>稼働設定</h2></div>
            <p>部品倉庫への依頼：{search.order.id} · {search.order.requiredWeight} kg 以上</p>
            <p>直近の受取：{lastDelivery ? `${lastDelivery.orderId} · 棚 ${lastDelivery.index} · ${lastDelivery.weight} kg` : 'まだ届いていません'}</p>
            <p><a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/?view=warehouse`}>部品倉庫へ</a></p>
            {(line.report.status === 'failed' || (line.report.status === 'finished' && !line.report.verified)) &&
              <p role="alert">倉庫で部品を確定できませんでした。部品倉庫で探索結果を確認してください。</p>}
            <label>再生速度<select aria-label="再生速度" value={speed} onChange={event => {
              const value = conveyorSpeeds.find(option => option === Number(event.target.value))
              if (value) setSpeed(value)
            }}>{conveyorSpeeds.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
            <div className="manufacturing-buttons">
              <button type="button" className="manufacturing-primary" onClick={line.toggle}>
                {state.running ? '一時停止' : started ? '再開' : '開始'}</button>
              <button type="button" onClick={line.reset}>リセット</button>
            </div>
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
      </main>
      </div>
    </div>
  )
}
