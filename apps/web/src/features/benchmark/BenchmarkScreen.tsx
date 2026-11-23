import { useState } from 'react'
import { productionTicks, productRevenue } from '../../factory/manufacturing/engine'
import { powerPerWeigh, ticksPerWeigh } from '../weight-search/engine'
import { benchmarkConditions } from './benchmarkEngine'
import { useBenchmark } from './useBenchmark'
import './benchmark.css'

const statusLabels = {
  idle: '試験前', running: '試験中', completed: '完了', failed: '失敗', stopped: '中断',
}
const format = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })

export function BenchmarkScreen({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const benchmark = useBenchmark()
  const { result, status } = benchmark
  const running = status === 'running'
  return (
    <div className="manufacturing benchmark">
      <header className="manufacturing-header"><div>
        <strong>Brain Forge</strong>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/?view=warehouse`}>部品倉庫へ</a>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/`}>工場マップ</a>
      </div></header>
      <main className="manufacturing-main">
        <div className="manufacturing-title"><h1>アルゴリズム性能試験</h1></div>
        <div className="benchmark-layout">
          <section className="manufacturing-panel" aria-labelledby="benchmark-code">
            <div className="manufacturing-panel-heading"><h2 id="benchmark-code">試験用Python</h2></div>
            <div className="benchmark-controls">
              <p>部品倉庫の下書きから始めます。開始時のコードを使い、試験中の編集は次回の試験に反映します。</p>
              <label htmlFor="benchmark-python">実行するPythonコード</label>
              <textarea id="benchmark-python" value={code} onChange={event => setCode(event.target.value)} spellCheck={false} />
              <div className="manufacturing-buttons">
                <button type="button" className="manufacturing-primary" disabled={running || !code.trim()} onClick={() => benchmark.start(code)}>試験開始</button>
                <button type="button" disabled={!running} onClick={benchmark.stop}>中断</button>
              </div>
              {benchmark.code !== undefined && benchmark.code !== code && <details>
                <summary>今回の試験に使ったコード</summary>
                <pre>{benchmark.code}</pre>
              </details>}
              <p>試験は本番工場と並行して実行します。この画面を離れると試験を終了します。</p>
            </div>
          </section>
          <section className="manufacturing-panel" aria-labelledby="benchmark-result">
            <div className="manufacturing-panel-heading"><h2 id="benchmark-result">試験結果</h2><span role="status">{statusLabels[status]}</span></div>
            <div className="benchmark-controls">
              <p><strong>{benchmarkConditions.id}</strong> · seed {benchmarkConditions.seed}</p>
              <p>{benchmarkConditions.warehouseSize} 部品 · {format(benchmarkConditions.ticks)} Tick</p>
              <p>計量 {ticksPerWeigh} Tick・{powerPerWeigh} pt / 回 · 製造 {productionTicks} Tick・{productRevenue} Cr / 個</p>
              {benchmark.error && <pre className="benchmark-error" role="alert">{benchmark.error}</pre>}
              <dl className="benchmark-metrics">
                <div><dt>計測Tick</dt><dd>{format(result?.ticks ?? 0)} Tick</dd></div>
                <div><dt>完成製品数</dt><dd>{format(result?.completed ?? 0)} 個</dd></div>
                <div><dt>確定売上</dt><dd>{format(result?.revenue ?? 0)} Cr</dd></div>
                <div><dt>生産効率</dt><dd>{format(result?.revenueRate ?? 0)} Cr/100 Tick</dd></div>
                <div><dt>計量回数</dt><dd>{format(result?.measurements ?? 0)} 回</dd></div>
                <div><dt>消費電力</dt><dd>{format(result?.power ?? 0)} pt</dd></div>
              </dl>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
