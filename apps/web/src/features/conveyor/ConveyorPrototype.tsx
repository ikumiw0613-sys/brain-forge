import { ConveyorView } from '../../renderers/ConveyorView'
import { conveyorSpeeds, getConveyorTickMs } from '../game/conveyor'
import { inspectionDuration, productionInterval, scannerPosition, shippingCapacity, shippingWindow } from '../game/factory'
import { useConveyor } from './useConveyor'
import './prototype.css'

export function ConveyorPrototype() {
  const conveyor = useConveyor()
  const { items, running, speed, tick, producedCount, shippedCount, inspectedCount, minerStatus, recentShipments } = conveyor.state
  const action = running ? '一時停止' : conveyor.hasStarted ? '再開' : '開始'
  const status = running ? '運転中' : conveyor.hasStarted ? '一時停止中' : '停止中'
  const lastShipment = recentShipments.at(-1)
  const measuredTicks = Math.min(tick, shippingWindow)
  const shippingRate = measuredTicks === 0 ? '—' : (recentShipments.length / measuredTicks).toFixed(2)
  const scannerItem = items.find(item => item.position === scannerPosition)
  const scannerStatus = scannerItem?.inspectionStatus === 'inspecting' ? '検品中'
    : scannerItem?.inspectionStatus === 'passed' ? '検品完了' : '待機'
  const waitingCount = items.filter(item => item.position < scannerPosition && item.inspectionStatus === 'pending').length

  return (
    <div className="conveyor-prototype">
      <header className="site-header">
        <div className="page-width brand">
          <span className="insignia" aria-hidden="true"><i /><i /><i /></span>
          Brain Forge
        </div>
      </header>

      <main className="page-width stage">
        <header className="stage-title">
          <span className="stage-code">Prototype 03</span>
          <h1>コンベア搬送システム</h1>
        </header>

        <div className="conveyor-layout">
          <ConveyorView
            items={items}
            nextItems={conveyor.nextItems}
            minerStatus={minerStatus}
            scannerItem={scannerItem}
            shippedId={lastShipment?.tick === tick ? lastShipment.id : undefined}
            shippedCount={shippedCount}
            running={running}
            progressAt={conveyor.progressAt}
          />

          <section className="panel mission conveyor-controls" aria-labelledby="conveyor-controls-title">
            <h2 className="panel-heading" id="conveyor-controls-title">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" />
                <path d="M7 3v4m6 1v4m-4 1v4" strokeWidth="2.5" />
              </svg>
              操作パネル
            </h2>

            <dl className="mission-readings">
              <div>
                <dt>運転状態</dt>
                <dd><span className="factory-status" role="status" data-running={running}>{status}</span></dd>
              </div>
              <div className="conveyor-tick">
                <dt>現在の Tick</dt>
                <dd><strong>{tick}</strong></dd>
              </div>
              <div><dt>生産数</dt><dd>{producedCount} 個</dd></div>
              <div><dt>出荷数</dt><dd>{shippedCount} 個</dd></div>
              <div><dt>コンベア上のコンテナ</dt><dd>{items.length} 個</dd></div>
              <div><dt>生産間隔</dt><dd>{productionInterval} Tick</dd></div>
              <div><dt>ゲートの処理能力</dt><dd>最大 {shippingCapacity} 個 / Tick</dd></div>
              <div>
                <dt>出荷ペース<br />直近 {measuredTicks || shippingWindow} Tick</dt>
                <dd>{shippingRate} 個 / Tick</dd>
              </div>
            </dl>

            <div className="conveyor-operation">
              <fieldset className="conveyor-speed">
                <legend>搬送速度</legend>
                <div className="conveyor-speed-options">
                  {conveyorSpeeds.map(option => (
                    <label key={option}>
                      <input type="radio" name="conveyor-speed" checked={speed === option} onChange={() => conveyor.setSpeed(option)} />
                      <span>{option}倍</span>
                    </label>
                  ))}
                </div>
                <p>1 Tick = {getConveyorTickMs(speed)} ms</p>
              </fieldset>

              <div className="conveyor-commands">
                <button type="button" className="scan-button conveyor-run" onClick={conveyor.toggleRunning}>{action}</button>
                <div className="game-actions">
                  <button type="button" onClick={conveyor.reset}>リセット</button>
                </div>
              </div>
            </div>

            <section className="conveyor-inspection" aria-labelledby="conveyor-inspection-title">
              <h3 className="panel-heading" id="conveyor-inspection-title">自動検品</h3>
              <dl className="mission-readings">
                <div><dt>検品機の状態</dt><dd>{scannerStatus}</dd></div>
                <div><dt>検品対象</dt><dd>{scannerItem?.id ?? '—'}</dd></div>
                <div><dt>検品進捗</dt><dd>{scannerItem ? `${scannerItem.inspectionTicks}/${inspectionDuration}` : '—'}</dd></div>
                <div><dt>検品完了数</dt><dd>{inspectedCount} 個</dd></div>
                <div><dt>検品待ち</dt><dd>{waitingCount} 個</dd></div>
              </dl>
            </section>
          </section>
        </div>
      </main>
    </div>
  )
}
