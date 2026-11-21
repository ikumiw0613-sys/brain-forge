// @vitest-environment jsdom
import type { Session } from '@supabase/supabase-js'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from '../../../../../packages/contracts/openapi'
import { st001 } from '../stages/st001'
import { GameLayout } from './GameLayout'

const api = vi.hoisted(() => ({
  fetcher: vi.fn<(request: Request) => Promise<Response>>(),
  ensure: vi.fn<() => Promise<Session>>(),
  getSession: vi.fn<() => Promise<Session>>(),
  authChange: undefined as ((event: string, session: Session | null) => void) | undefined,
}))

vi.mock('../../lib/supabase', () => ({
  ensureSupabaseSession: api.ensure,
  getSupabaseSession: api.getSession,
  refreshSupabaseSession: vi.fn(),
  supabase: {
    client: {
      auth: {
        onAuthStateChange: (callback: typeof api.authChange) => {
          api.authChange = callback
          return { data: { subscription: { unsubscribe: () => { if (api.authChange === callback) api.authChange = undefined } } } }
        },
      },
    },
  },
}))

vi.mock('../../services/gameApi', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/gameApi')>()
  return { ...original, gameApi: original.createGameApi({ baseUrl: 'http://game.example.test', fetcher: api.fetcher }) }
})

type Schemas = components['schemas']
const firstId = 'c6cf8f34-8f39-4b61-9bdd-09b3c91c969d'
const nextId = '320a1f8d-e3b5-43af-8e64-490ee34bef47'
const emptyAttempt: Schemas['AttemptResponse'] = {
  id: firstId, stage_id: 'ST-001', status: 'in_progress', scans_used: 0, scans_remaining: 5,
  candidate_range: { lo: 0, hi: 15 }, scans: [],
}
const scan: Schemas['ScanResponse'] = {
  index: 7, quality: 46, scans_used: 1, scans_remaining: 4, status: 'in_progress', candidate_range: { lo: 8, hi: 15 },
}
const inspected: Schemas['AttemptResponse'] = {
  ...emptyAttempt, scans_used: scan.scans_used, scans_remaining: scan.scans_remaining,
  candidate_range: scan.candidate_range, scans: [{ index: scan.index, quality: scan.quality }],
}
const cleared: Schemas['AttemptResponse'] = {
  ...inspected, status: 'cleared', scans_used: 2, scans_remaining: 3, candidate_range: { lo: 8, hi: 8 },
  scans: [...inspected.scans, { index: 8, quality: 72 }],
}

function session(id: string): Session {
  return {
    access_token: `test-token-${id}`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '', is_anonymous: true },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

let container: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  localStorage.clear()
  api.ensure.mockResolvedValue(session('first-player'))
  api.getSession.mockResolvedValue(session('first-player'))
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(async () => {
  await unmount()
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount() {
  root = createRoot(container)
  await act(async () => { root?.render(<StrictMode><GameLayout stage={st001} /></StrictMode>) })
}

async function unmount() {
  await act(async () => { root?.unmount() })
  root = undefined
}

function text(selector: string) {
  return container.querySelector(selector)?.textContent ?? ''
}

function button(label: string) {
  const match = Array.from(container.querySelectorAll('button')).find(element => element.textContent?.trim() === label)
  if (!match) throw new Error(`Button not found: ${label}`)
  return match
}

async function click(label: string) {
  await act(async () => { button(label).click() })
}

async function select(number: number) {
  await act(async () => { container.querySelectorAll<HTMLInputElement>('input[type=radio]')[number - 1].click() })
}

function requestAt(index: number) {
  return api.fetcher.mock.calls[index][0]
}

describe('attempt lifecycle', () => {
  it('waits for authentication before creating the challenge and displays only public initial state', async () => {
    const auth = deferred<Session>()
    api.ensure.mockReturnValue(auth.promise)
    const response = deferred<Response>()
    api.fetcher.mockReturnValue(response.promise)
    await mount()
    expect(text('.factory-status')).toBe('初期化中')
    expect(api.fetcher).not.toHaveBeenCalled()
    await act(async () => { auth.resolve(session('first-player')) })
    expect(text('.factory-status')).toBe('挑戦を読み込み中')
    expect(api.fetcher).toHaveBeenCalledTimes(1)
    expect(requestAt(0).method).toBe('POST')
    expect(new URL(requestAt(0).url).pathname).toBe('/api/v1/attempts')
    expect(await requestAt(0).json()).toEqual({ stage_id: 'ST-001' })
    await act(async () => { response.resolve(Response.json(emptyAttempt, { status: 201 })) })
    expect(text('.factory-status')).toBe('プレイ可能')
    expect(text('.candidate-reading')).toBe('1〜16番')
    expect(text('.scan-reading strong')).toBe('5')
    expect(container.querySelectorAll('input[type=radio]')).toHaveLength(16)
    expect(container.textContent).not.toMatch(/品質\s+\d+/)
  })

  it('restores the stored attempt and its inspections when the screen is mounted again', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 }))
      .mockResolvedValueOnce(Response.json(inspected))
    await mount()
    await unmount()
    await mount()

    expect(requestAt(1).method).toBe('GET')
    expect(requestAt(1).url).toContain(`/attempts/${firstId}`)
    expect(text('.candidate-reading')).toBe('9〜16番')
    expect(text('.scan-reading strong')).toBe('4')
    expect(text('.log-entries')).toContain('品質 46')
  })

  it.each([403, 404])('recovers from an inaccessible saved attempt (HTTP %i)', async status => {
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 }))
      .mockResolvedValueOnce(Response.json({}, { status }))
      .mockResolvedValueOnce(Response.json({ ...emptyAttempt, id: nextId }, { status: 201 }))
    await mount()
    await unmount()
    await mount()
    expect(requestAt(1).method).toBe('GET')
    expect(requestAt(2).method).toBe('POST')
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!))).toEqual([nextId])
    expect(text('.factory-status')).toBe('プレイ可能')
  })

  it('switches accounts without reusing the previous user’s saved attempt', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ ...emptyAttempt, id: nextId }, { status: 201 }))
    await mount()
    api.ensure.mockResolvedValue(session('other-player'))
    api.getSession.mockResolvedValue(session('other-player'))
    await act(async () => { api.authChange?.('SIGNED_IN', session('other-player')) })

    expect(api.fetcher).toHaveBeenCalledTimes(2)
    expect(requestAt(1).method).toBe('POST')
    expect(requestAt(1).headers.get('Authorization')).toBe('Bearer test-token-other-player')
    expect(localStorage.length).toBe(2)
  })
})

describe('inspection and recovery', () => {
  it('deduplicates scans, keeps an in-flight scan locked after skipping, and shows only returned quality', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const response = deferred<Response>()
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 })).mockReturnValueOnce(response.promise)
    await mount()
    await select(8)
    await act(async () => {
      const scanButton = button('スキャンする')
      scanButton.click()
      scanButton.click()
    })
    expect(api.fetcher).toHaveBeenCalledTimes(2)
    expect(await requestAt(1).json()).toMatchObject({ index: 7, expected_step: 0, action_id: expect.any(String) })
    expect(text('.factory-status')).toBe('検品処理中')
    expect(container.querySelector('.scan-trace')).not.toBeNull()
    expect(container.textContent).not.toMatch(/品質\s+\d+/)

    await click('演出をスキップ')
    expect(container.querySelector('.scan-trace')).toBeNull()
    expect(button('スキャン中…').getAttribute('aria-disabled')).toBe('true')
    expect(container.querySelectorAll('input:disabled')).toHaveLength(16)
    await act(async () => { response.resolve(Response.json(scan)) })
    expect(text('.log-entries')).toContain('コンテナ 8番品質 46')
    expect(text('.scan-reading strong')).toBe('4')
    expect(text('.candidate-reading')).toBe('9〜16番')
    expect(text('.mission-readings')).toContain('8番・品質 46')
    expect(container.querySelectorAll('.container-control.excluded')).toHaveLength(8)
    expect(container.querySelector('input[aria-label*="検品済み"]')).not.toBeNull()
  })

  it('preserves the operation after timeout, even when a status check does not yet show the result', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 }))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(Response.json(emptyAttempt))
      .mockResolvedValueOnce(Response.json(scan))
      .mockResolvedValueOnce(Response.json(inspected))
    await mount()
    await select(8)
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal)
    await click('スキャンする')
    expect(text('.factory-status')).toBe('検品処理中')
    await act(async () => { deadline.abort(new DOMException('timed out', 'TimeoutError')) })
    expect(text('[role=alert]')).toContain('処理が完了している可能性')
    expect(text('.scan-reading strong')).toBe('5')
    await click('状態を確認')
    expect(requestAt(2).method).toBe('GET')
    expect(text('[role=alert]')).toContain('処理が完了している可能性')

    await click('同じ検品を再送')
    expect(await requestAt(3).json()).toEqual(await requestAt(1).json())
    expect(requestAt(4).method).toBe('GET')
    expect(text('.scan-reading strong')).toBe('4')
    expect(container.querySelectorAll('.log-entries li')).toHaveLength(1)
  })

  it('synchronizes after a stale step without applying another scan or showing an animation in reduced-motion mode', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(emptyAttempt, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ detail: 'step_conflict' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(inspected))
    await mount()
    await select(8)
    await click('スキャンする')
    expect(api.fetcher).toHaveBeenCalledTimes(3)
    expect(requestAt(2).method).toBe('GET')
    expect(text('.game-feedback')).toBe('最新の挑戦状態を取得しました。')
    expect(text('.candidate-reading')).toBe('9〜16番')
    expect(container.querySelector('.scan-skip')).toBeNull()
  })
})

describe('terminal results', () => {
  it('uses the server’s clear result to open the gate, display scans used, and start a fresh challenge', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(inspected, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        index: 8, quality: 72, status: cleared.status, candidate_range: cleared.candidate_range,
        scans_used: cleared.scans_used, scans_remaining: cleared.scans_remaining,
      }))
      .mockResolvedValueOnce(Response.json({ ...emptyAttempt, id: nextId }, { status: 201 }))
    await mount()
    await select(9)
    await click('スキャンする')
    expect(text('#result-title')).toBe('ミッション成功')
    expect(text('.game-result')).toContain('検品回数 2 回')
    expect(text('.factory-scene')).toContain('出荷ゲート（開）')
    expect(text('.candidate-reading')).toBe('9番')
    expect(container.querySelector('.scan-button')).toBeNull()
    expect(container.querySelectorAll('input:disabled')).toHaveLength(16)

    await click('もう一度挑戦する')
    expect(await requestAt(2).json()).toEqual({ stage_id: 'ST-001', previous_attempt_id: firstId })
    expect(text('#result-title')).toBe('')
    expect(text('.scan-reading strong')).toBe('5')
    expect(text('.factory-scene')).not.toContain('出荷ゲート（開）')
  })

  it('shows a server failure at zero remaining scans and offers restart', async () => {
    const almostFinished = {
      ...emptyAttempt, scans_used: 4, scans_remaining: 1, candidate_range: { lo: 4, hi: 15 },
      scans: Array.from({ length: 4 }, (_, index) => ({ index, quality: 8 + index })),
    }
    api.fetcher.mockResolvedValueOnce(Response.json(almostFinished, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        index: 4, quality: 24, status: 'failed', candidate_range: { lo: 5, hi: 15 }, scans_used: 5, scans_remaining: 0,
      }))
    await mount()
    await select(5)
    await click('スキャンする')
    expect(text('#result-title')).toBe('ミッション失敗')
    expect(text('.scan-reading strong')).toBe('0')
    expect(text('.candidate-reading')).toBe('6〜16番')
    expect(button('もう一度挑戦する').disabled).toBe(false)
    expect(text('.factory-scene')).not.toContain('出荷ゲート（開）')
  })
})
