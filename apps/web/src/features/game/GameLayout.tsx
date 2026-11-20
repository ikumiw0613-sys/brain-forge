import { FactoryView } from '../../renderers/FactoryView'
import { useInspection } from './useInspection'
import type { Inspection } from './useInspection'

type Stage = {
  id: string
  title: string
  mission: string
  containerNumbers: readonly number[]
  scanLimit: number
}

export function GameLayout({ stage, readQuality }: {
  stage: Stage
  readQuality: (containerNumber: number) => number | undefined
}) {
  const { selectedNumber, selectContainer, inspections, scanSelectedContainer } = useInspection(stage.scanLimit, readQuality)

  return (
    <main className="page-width stage">
      <header className="stage-title">
        <span className="stage-code">{stage.id}</span>
        <h1>{stage.title}</h1>
      </header>

      <div className="game-grid">
        <FactoryView
          containerNumbers={stage.containerNumbers}
          selectedNumber={selectedNumber}
          inspectedNumbers={inspections.map(inspection => inspection.containerNumber)}
          onSelect={selectContainer}
        />
        <MissionPanel
          mission={stage.mission}
          selectedNumber={selectedNumber}
          scansRemaining={stage.scanLimit - inspections.length}
          lastInspection={inspections.at(-1)}
          selectedInspection={inspections.find(inspection => inspection.containerNumber === selectedNumber)}
          onScan={scanSelectedContainer}
        />
      </div>

      <InspectionLog inspections={inspections} />
    </main>
  )
}

function MissionPanel({ mission, selectedNumber, scansRemaining, lastInspection, selectedInspection, onScan }: {
  mission: string
  selectedNumber: number | null
  scansRemaining: number
  lastInspection: Inspection | undefined
  selectedInspection: Inspection | undefined
  onScan: () => void
}) {
  let factoryStatus = '検品準備完了'
  let disabledReason: string | undefined

  if (scansRemaining === 0) {
    factoryStatus = '検品上限に到達'
    disabledReason = 'スキャン回数の上限に達しました。'
  } else if (selectedNumber === null) {
    factoryStatus = '待機中'
    disabledReason = '検品するコンテナを選択してください。'
  } else if (selectedInspection) {
    factoryStatus = '検品済み'
    disabledReason = 'このコンテナは検品済みです。'
  }

  return (
    <aside className="panel mission" aria-labelledby="mission-title">
      <h2 className="panel-heading" id="mission-title">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="M10 1v5m0 8v5M1 10h5m8 0h5" />
          <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
        </svg>
        ミッション
      </h2>
      <p className="mission-objective">{mission}</p>
      <div className="scan-controls">
        <dl className="scan-selection">
          <dt>選択中のコンテナ</dt>
          <dd>
            {selectedNumber === null ? '未選択' : `${selectedNumber}番`}
            {selectedInspection && <small>品質 {selectedInspection.quality}</small>}
          </dd>
        </dl>
        <button
          className="scan-button"
          type="button"
          aria-disabled={disabledReason !== undefined}
          aria-describedby={disabledReason ? 'scan-hint' : undefined}
          onClick={disabledReason ? undefined : onScan}
        >
          スキャンする
        </button>
        {disabledReason && <p className="scan-hint" id="scan-hint">{disabledReason}</p>}
      </div>
      <dl className="mission-readings">
        <div className="scan-reading">
          <dt>残りスキャン回数</dt>
          <dd><strong>{scansRemaining}</strong> 回</dd>
        </div>
        <div>
          <dt>最後の検品結果</dt>
          <dd>
            <span role="status">
              {lastInspection ? `${lastInspection.containerNumber}番・品質 ${lastInspection.quality}` : '未検品'}
            </span>
          </dd>
        </div>
        <div>
          <dt>工場の状態</dt>
          <dd className="factory-status">{factoryStatus}</dd>
        </div>
      </dl>
    </aside>
  )
}

function InspectionLog({ inspections }: { inspections: readonly Inspection[] }) {
  return (
    <section className="panel inspection-log" aria-labelledby="log-title">
      <h2 className="panel-heading" id="log-title">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 2.5h8.5L16 6v11.5H4zM12 2.5V7h4M7 10h6m-6 3h6" />
        </svg>
        検品ログ
      </h2>
      {inspections.length === 0 ? (
        <p className="log-empty">まだ検品していません。コンテナを選択してください。</p>
      ) : (
        <ol className="log-entries">
          {inspections.map(({ containerNumber, quality }) => (
            <li key={containerNumber}>
              <span>コンテナ {containerNumber}番</span>
              <strong>品質 {quality}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
