import { useEffect, useRef, useState } from 'react'
import { FactoryView } from '../../renderers/FactoryView'
import { useInspection } from './useInspection'
import type { Inspection } from './useInspection'

type Stage = {
  id: string
  title: string
  mission: string
  containerNumbers: readonly number[]
}

const scanEffectDuration = 420

export function GameLayout({ stage }: { stage: Stage }) {
  const game = useInspection(stage.id)
  const inspections = game.attempt?.scans ?? []
  const range = game.attempt?.candidate_range
  const candidateRange = range && { first: range.lo + 1, last: range.hi + 1 }
  const finished = game.attempt && game.attempt.status !== 'in_progress'
  const [animating, setAnimating] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => { window.clearTimeout(timer.current) }, [])

  function finishEffect() {
    window.clearTimeout(timer.current)
    setAnimating(false)
  }

  function startEffect() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    window.clearTimeout(timer.current)
    setAnimating(true)
    timer.current = window.setTimeout(() => setAnimating(false), scanEffectDuration)
  }

  return (
    <main className="page-width stage">
      <header className="stage-title">
        <span className="stage-code">{stage.id}</span>
        <h1>{stage.title}</h1>
      </header>

      <div className="game-grid">
        <FactoryView
          containerNumbers={stage.containerNumbers}
          selectedNumber={game.selected}
          inspectedNumbers={inspections.map(inspection => inspection.index + 1)}
          candidateRange={candidateRange}
          locked={Boolean(game.busy || game.issue || animating || finished)}
          scanning={animating}
          gateOpen={game.attempt?.status === 'cleared'}
          onSelect={game.selectContainer}
        />
        <MissionPanel
          mission={stage.mission}
          game={game}
          animating={animating}
          onScan={() => { if (!animating && game.scanSelected()) startEffect() }}
          onRetry={() => { if (game.retry() && game.issue?.retry.kind === 'scan') startEffect() }}
          onSkip={finishEffect}
        />
      </div>

      <InspectionLog inspections={inspections} />
    </main>
  )
}

const busyStatus = { initializing: '初期化中', loading: '挑戦を読み込み中', scanning: '検品処理中' }

function MissionPanel({ mission, game, animating, onScan, onRetry, onSkip }: {
  mission: string
  game: ReturnType<typeof useInspection>
  animating: boolean
  onScan: () => void
  onRetry: () => void
  onSkip: () => void
}) {
  const { attempt, selected, selectedInspection, busy, issue, notice } = game
  const lastInspection = attempt?.scans.at(-1)
  const range = attempt?.candidate_range
  const rangeText = range && (range.lo === range.hi ? `${range.lo + 1}番` : `${range.lo + 1}〜${range.hi + 1}番`)
  const finished = attempt && attempt.status !== 'in_progress'
  const succeeded = attempt?.status === 'cleared'
  let factoryStatus = 'プレイ可能'
  let disabledReason: string | undefined

  if (busy) {
    factoryStatus = busyStatus[busy]
  } else if (issue) {
    factoryStatus = issue.unknown ? '結果を確認できません' : '通信エラー'
  } else if (finished) {
    factoryStatus = succeeded ? 'クリア' : '失敗'
  } else if (animating) {
    factoryStatus = 'スキャン演出中'
  } else if (selected === null) {
    disabledReason = '検品するコンテナを選択してください。'
  } else if (selectedInspection) {
    disabledReason = 'このコンテナは検品済みです。'
  }
  const scanDisabled = Boolean(!attempt || busy || issue || finished || animating || disabledReason)

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
      {issue && (
        <div className="game-feedback">
          <p role="alert">{issue.text}</p>
          <div className="game-actions">
            <button type="button" onClick={onRetry} disabled={animating}>
              {issue.unknown === 'scan' ? '同じ検品を再送' : issue.unknown === 'create' ? '新しく開始する' : '再試行'}
            </button>
            {issue.unknown === 'scan' && <button type="button" onClick={game.sync} disabled={animating}>状態を確認</button>}
          </div>
        </div>
      )}
      {notice && <p className="game-feedback" role="status">{notice}</p>}
      {finished && (
        <section className="game-result" aria-labelledby="result-title">
          <h3 id="result-title">{succeeded ? 'ミッション成功' : 'ミッション失敗'}</h3>
          <p>{succeeded ? `${rangeText}に確定し、出荷ゲートが開きました。` : '検品回数を使い切り、候補が複数残りました。'}</p>
          <p>検品回数 {attempt.scans_used} 回</p>
          <button type="button" onClick={game.restart} disabled={Boolean(busy || issue || animating)}>もう一度挑戦する</button>
        </section>
      )}
      {(!finished || animating) && (
        <div className="scan-controls">
          {!finished && (
            <>
              <dl className="scan-selection">
                <dt>選択中のコンテナ</dt>
                <dd>
                  {selected === null ? '未選択' : `${selected}番`}
                  {selectedInspection && <small>品質 {selectedInspection.quality}</small>}
                </dd>
              </dl>
              <button
                className="scan-button"
                type="button"
                aria-disabled={scanDisabled}
                aria-describedby={disabledReason ? 'scan-hint' : undefined}
                onClick={scanDisabled ? undefined : onScan}
              >
                {busy === 'scanning' ? 'スキャン中…' : 'スキャンする'}
              </button>
              {disabledReason && <p className="scan-hint" id="scan-hint">{disabledReason}</p>}
            </>
          )}
          {animating && <button className="scan-skip" type="button" onClick={onSkip}>演出をスキップ</button>}
        </div>
      )}
      <dl className="mission-readings">
        <div className="scan-reading">
          <dt>残りスキャン回数</dt>
          <dd>{attempt ? <><strong>{attempt.scans_remaining}</strong> 回</> : '—'}</dd>
        </div>
        <div>
          <dt>候補範囲</dt>
          <dd className="candidate-reading">{rangeText ?? '—'}</dd>
        </div>
        <div>
          <dt>最後の検品結果</dt>
          <dd>
            <span role="status">
              {lastInspection ? `${lastInspection.index + 1}番・品質 ${lastInspection.quality}` : '未検品'}
            </span>
          </dd>
        </div>
        <div>
          <dt>工場の状態</dt>
          <dd><span className="factory-status" role="status">{factoryStatus}</span></dd>
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
          {inspections.map(({ index, quality }) => (
            <li key={index}>
              <span>コンテナ {index + 1}番</span>
              <strong>品質 {quality}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
