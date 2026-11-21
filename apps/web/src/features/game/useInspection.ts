import { useCallback, useEffect, useRef, useState } from 'react'
import type { components } from '../../../../../packages/contracts/openapi'
import { ensureSupabaseSession, supabase } from '../../lib/supabase'
import { apiBaseUrl } from '../../services/apiBaseUrl'
import { gameApi, GameApiError } from '../../services/gameApi'
import type { ScanOperation } from '../../services/gameApi'

type Attempt = components['schemas']['AttemptResponse']
export type Inspection = components['schemas']['InspectionResult']
type Active = { userId: string; attempt: Attempt }
type ScanJob = { kind: 'scan'; active: Active; operation: ScanOperation; replay: boolean; uncertain?: boolean }
type Job = { kind: 'open' } | { kind: 'restart'; active: Active } | ScanJob |
  { kind: 'sync'; active: Active; confirm?: ScanJob }
type Issue = { text: string; retry: Job; unknown?: 'scan' | 'create' }
type Busy = 'initializing' | 'loading' | 'scanning'
type State = {
  active?: Active
  selected: number | null
  busy?: Busy
  issue?: Issue
  notice?: string
}
type Result = { active: Active; issue?: Issue; notice?: string }

const initialState: State = { selected: null, busy: 'initializing' }
const unknownScanText = '検品結果を確認できませんでした。サーバーで処理が完了している可能性があります。'

export function useInspection(stageId: string) {
  const [state, setState] = useState<State>(initialState)
  const [sessionVersion, setSessionVersion] = useState(0)
  const pending = useRef<AbortController | null>(null)
  const owner = useRef<string | undefined>(undefined)

  const run = useCallback((job: Job) => {
    if (pending.current) return false
    const controller = new AbortController()
    const { signal } = controller
    pending.current = controller
    const busy = job.kind === 'open' ? 'initializing' : job.kind === 'scan' ? 'scanning' : 'loading'
    setState(previous => ({ ...previous, busy, issue: undefined, notice: undefined }))

    void (async () => {
      try {
        const { user } = await ensureSupabaseSession()
        signal.throwIfAborted()
        owner.current = user.id

        let result: Result
        if (job.kind === 'open' || job.active.userId !== user.id) {
          setState(previous => ({ selected: previous.active ? null : previous.selected, busy: 'loading' }))
          result = { active: { userId: user.id, attempt: await restoreAttempt(stageId, user.id, signal) } }
        } else {
          result = await runAttemptJob(stageId, job, signal)
        }

        signal.throwIfAborted()
        setState(previous => ({
          ...result,
          selected: !previous.active || previous.active.attempt.id === result.active.attempt.id ? previous.selected : null,
        }))
      } catch (error) {
        if (!signal.aborted) setState(previous => ({ ...previous, busy: undefined, issue: getIssue(error, job) }))
      } finally {
        if (pending.current === controller) pending.current = null
      }
    })()
    return true
  }, [stageId])

  useEffect(() => {
    const subscription = supabase.client?.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || owner.current === undefined || owner.current === session?.user.id) return
      owner.current = undefined
      pending.current?.abort()
      pending.current = null
      setState(initialState)
      setSessionVersion(version => version + 1)
    }).data.subscription
    run({ kind: 'open' })
    return () => {
      subscription?.unsubscribe()
      pending.current?.abort()
      pending.current = null
      owner.current = undefined
    }
  }, [run, sessionVersion])

  const { active, selected, busy, issue, notice } = state
  const attempt = active?.attempt
  const selectedInspection = attempt?.scans.find(scan => scan.index + 1 === selected)

  function scanSelected(): boolean {
    if (pending.current || busy || issue || !active || attempt?.status !== 'in_progress' || selected === null || selectedInspection) return false
    const operation = gameApi.createScanOperation(attempt.id, selected - 1, attempt.scans_used)
    return run({ kind: 'scan', active, operation, replay: false })
  }

  return {
    attempt, selected, selectedInspection, busy, issue, notice, scanSelected,
    selectContainer: (number: number) => { if (!pending.current && !busy) setState(previous => ({ ...previous, selected: number })) },
    restart: () => { if (active && attempt?.status !== 'in_progress' && !busy && !issue) run({ kind: 'restart', active }) },
    retry: () => issue ? run(issue.retry) : false,
    sync: () => {
      if (active) run({ kind: 'sync', active, confirm: issue?.unknown === 'scan' && issue.retry.kind === 'scan' ? issue.retry : undefined })
    },
  }
}

async function runAttemptJob(stageId: string, job: Exclude<Job, { kind: 'open' }>, signal: AbortSignal): Promise<Result> {
  const { userId, attempt } = job.active
  if (job.kind === 'restart') {
    const next = toAttempt(await gameApi.createAttempt({ stage_id: stageId, previous_attempt_id: attempt.id }, signal))
    signal.throwIfAborted()
    saveAttempt(storageKey(stageId, userId), next.id)
    return { active: { userId, attempt: next } }
  }

  if (job.kind === 'scan') {
    try {
      const { index, quality, candidate_range, scans_used, scans_remaining, status } = await gameApi.scanContainer(job.operation, signal)
      if (!job.replay && index === job.operation.body.index && scans_used === attempt.scans_used + 1) {
        return { active: { userId, attempt: {
          ...attempt, candidate_range, scans_used, scans_remaining, status, scans: [...attempt.scans, { index, quality }],
        } } }
      }
    } catch (error) {
      if (!(error instanceof GameApiError) ||
        (error.kind !== 'conflict' && error.code !== 'already_scanned' && error.code !== 'attempt_finished')) throw error
    }
  }

  const current = toAttempt(await gameApi.getAttempt(attempt.id, signal))
  const active = { userId, attempt: current }
  if (job.kind === 'sync' && job.confirm && current.status === 'in_progress' &&
    current.scans_used <= job.confirm.operation.body.expected_step) {
    return { active, issue: { text: unknownScanText, unknown: 'scan', retry: { ...job.confirm, active } } }
  }
  return { active, notice: '最新の挑戦状態を取得しました。' }
}

async function restoreAttempt(stageId: string, userId: string, signal: AbortSignal): Promise<Attempt> {
  const key = storageKey(stageId, userId)
  const restore = async () => {
    signal.throwIfAborted()
    const saved = readAttempt(key)
    if (saved) {
      try {
        const attempt = toAttempt(await gameApi.getAttempt(saved, signal))
        if (attempt.stage_id === stageId) return attempt
      } catch (error) {
        if (!(error instanceof GameApiError) || (error.kind !== 'not_found' && error.kind !== 'forbidden')) throw error
      }
      saveAttempt(key, null)
    }
    const attempt = toAttempt(await gameApi.createAttempt({ stage_id: stageId }, signal))
    signal.throwIfAborted()
    saveAttempt(key, attempt.id)
    return attempt
  }
  return navigator.locks ? navigator.locks.request(key, { signal }, restore) : restore()
}

function toAttempt(response: Awaited<ReturnType<typeof gameApi.getAttempt>>): Attempt {
  return { ...response, scans: Array.from(response.scans) }
}

function storageKey(stageId: string, userId: string) {
  return `brain-forge:attempt:${apiBaseUrl}:${stageId}:${userId}`
}

function readAttempt(key: string): string | null {
  try {
    const id = localStorage.getItem(key)
    return id && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id : null
  } catch {
    return null
  }
}

function saveAttempt(key: string, id: string | null) {
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    // Storage can be disabled while play in the current page remains available.
  }
}

function getIssue(error: unknown, job: Job): Issue {
  const apiError = error instanceof GameApiError ? error : undefined
  if (job.kind !== 'open' && (apiError?.kind === 'forbidden' || apiError?.kind === 'not_found')) {
    return { text: 'この挑戦を取得できません。挑戦を読み込み直してください。', retry: { kind: 'open' } }
  }
  if (job.kind === 'sync' && job.confirm) return { text: unknownScanText, unknown: 'scan', retry: job.confirm }
  if (job.kind === 'scan' && (apiError?.outcomeUnknown || job.uncertain)) {
    return { text: unknownScanText, unknown: 'scan', retry: { ...job, replay: true, uncertain: true } }
  }
  const retry = job.kind === 'scan' ? { ...job, replay: true } : job
  if (apiError?.outcomeUnknown) {
    return { text: '挑戦が作成されたか確認できませんでした。新しく開始すると、別の挑戦が作成される場合があります。', unknown: 'create', retry }
  }
  if (apiError?.code === 'auth_not_configured' || apiError?.code === 'database_not_configured') {
    return { text: 'ゲーム API の認証とデータベース接続の設定を確認してください。', retry }
  }
  if (!apiError || apiError.kind === 'authentication_required' || apiError.kind === 'unauthorized' || apiError.kind === 'auth_unavailable') {
    return { text: '認証を確認できませんでした。Supabase の接続と匿名サインインの設定を確認してください。', retry }
  }
  return { text: 'ゲーム API との通信に失敗しました。再試行してください。', retry }
}
