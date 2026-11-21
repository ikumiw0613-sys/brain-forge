import { useEffect, useState } from 'react'
import { ensureSupabaseSession, supabase } from '../../lib/supabase'
import { gameApi } from '../../services/gameApi'
import { st001 } from '../stages/st001'
import { calibrationMissionPath } from './navigation'

const labels = {
  loading: '取得中',
  uncalibrated: '未校正',
  calibrated: '校正完了',
  failed: '状態を取得できません',
}

export function CalibrationPanel() {
  const [status, setStatus] = useState<keyof typeof labels>('loading')
  const [request, setRequest] = useState(0)
  const client = supabase.client
  const visibleStatus = client ? status : 'failed'

  useEffect(() => {
    if (!client) return

    const controller = new AbortController()
    const { signal } = controller
    let owner: string | undefined
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || owner === undefined || owner === session?.user.id) return
      owner = undefined
      controller.abort()
      setStatus('loading')
      setRequest(previous => previous + 1)
    })

    async function loadProgress() {
      try {
        const { user } = await ensureSupabaseSession()
        signal.throwIfAborted()
        owner = user.id
        const progress = await gameApi.getProgress(signal)
        signal.throwIfAborted()
        setStatus(progress.some(stage => stage.stage_id === st001.id && stage.clear_count > 0) ? 'calibrated' : 'uncalibrated')
      } catch {
        if (!signal.aborted) setStatus('failed')
      }
    }

    void loadProgress()
    return () => {
      controller.abort()
      subscription.unsubscribe()
    }
  }, [client, request])

  return (
    <section className="panel conveyor-calibration" aria-labelledby="conveyor-calibration-title">
      <div className="conveyor-calibration-copy">
        <h2 className="panel-heading" id="conveyor-calibration-title">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="5.5" /><path d="M10 1.5v5m0 7v5m-8.5-8.5h5m7 0h5" />
          </svg>
          検品ラインの校正
        </h2>
        <p>品質70以上になる最初のサンプルを特定します。</p>
      </div>
      <div className="conveyor-calibration-actions">
        <span className="factory-status" role="status" data-calibration={visibleStatus}>{labels[visibleStatus]}</span>
        {client && visibleStatus === 'failed' && (
          <div className="game-actions">
            <button type="button" onClick={() => {
              setStatus('loading')
              setRequest(previous => previous + 1)
            }}>再取得</button>
          </div>
        )}
        <a className="scan-button calibration-link" href={calibrationMissionPath}>校正ミッションに挑戦</a>
      </div>
    </section>
  )
}
