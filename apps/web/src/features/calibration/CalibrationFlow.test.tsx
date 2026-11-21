// @vitest-environment jsdom
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from '../../../../../packages/contracts/openapi'
import { App } from '../../App'
import { ConveyorPrototype } from '../conveyor/ConveyorPrototype'

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void

const api = vi.hoisted(() => ({
  fetcher: vi.fn<(request: Request) => Promise<Response>>(),
  ensure: vi.fn<() => Promise<Session>>(),
  getSession: vi.fn<() => Promise<Session | null>>(),
  configured: true,
  listeners: new Set<AuthListener>(),
}))

vi.mock('../../lib/supabase', () => {
  const client = {
    auth: {
      onAuthStateChange(listener: AuthListener) {
        api.listeners.add(listener)
        return { data: { subscription: { unsubscribe: () => { api.listeners.delete(listener) } } } }
      },
    },
  }
  return {
    ensureSupabaseSession: api.ensure,
    getSupabaseSession: api.getSession,
    refreshSupabaseSession: vi.fn(),
    supabase: { status: '接続未設定', get client() { return api.configured ? client : null } },
  }
})

vi.mock('../../services/gameApi', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/gameApi')>()
  return { ...original, gameApi: original.createGameApi({ baseUrl: 'http://game.example.test', fetcher: api.fetcher }) }
})

vi.mock('../../services/health', () => ({ checkApiHealth: async () => {} }))

type Schemas = components['schemas']
const attempt: Schemas['AttemptResponse'] = {
  id: 'c6cf8f34-8f39-4b61-9bdd-09b3c91c969d', stage_id: 'ST-001', status: 'in_progress', scans_used: 1,
  scans_remaining: 4, candidate_range: { lo: 8, hi: 15 }, scans: [{ index: 7, quality: 46 }],
}
const clear: Schemas['ScanResponse'] = {
  index: 8, quality: 72, status: 'cleared', candidate_range: { lo: 8, hi: 8 }, scans_used: 2, scans_remaining: 3,
}
const clearedProgress: Schemas['StageProgress'] = { stage_id: 'ST-001', clear_count: 1, best_scans: 2 }

function session(id: string): Session {
  return {
    access_token: `test-token-${id}`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '', is_anonymous: true },
  }
}

function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(settle => { resolve = settle })
  return { promise, resolve }
}

let container: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  api.configured = true
  api.listeners.clear()
  api.ensure.mockResolvedValue(session('guest'))
  api.getSession.mockResolvedValue(session('guest'))
  localStorage.clear()
  container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    window.dispatchEvent(new Event('pagehide'))
  })
  root = undefined
  container.remove()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function mount(screen: React.ReactNode, path: string) {
  window.history.replaceState(null, '', path)
  root = createRoot(container)
  await act(async () => { root?.render(<StrictMode>{screen}</StrictMode>) })
}

async function clickButton(label: string) {
  const target = Array.from(container.querySelectorAll('button')).find(button => button.textContent === label)
  if (!target) throw new Error(`Button not found: ${label}`)
  await act(async () => { target.click() })
}

const calibration = () => container.querySelector('[data-calibration]')?.textContent
const tick = () => container.querySelector('.conveyor-tick strong')?.textContent
const progressRequests = () => api.fetcher.mock.calls.map(([request]) => request)
  .filter(request => new URL(request.url).pathname === '/api/v1/me/progress')

describe('factory calibration', () => {
  it('shows loading and distinguishes a missing ST-001 record from another stage clear', async () => {
    const progress = deferredResponse()
    api.fetcher.mockReturnValueOnce(progress.promise)
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    expect(container.querySelector('#conveyor-calibration-title')?.textContent).toContain('検品ラインの校正')
    expect(calibration()).toBe('取得中')
    expect(progressRequests()[0].headers.get('Authorization')).toBe('Bearer test-token-guest')
    await act(async () => { progress.resolve(Response.json([{ ...clearedProgress, stage_id: 'ST-002' }])) })
    expect(calibration()).toBe('未校正')
  })

  it('shows a saved ST-001 clear and keeps the challenge link available', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json([clearedProgress]))
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    expect(calibration()).toBe('校正完了')
    const link = container.querySelector('.conveyor-calibration a')
    expect(link?.textContent).toBe('校正ミッションに挑戦')
    expect(link?.getAttribute('href')).toBe('/?from=factory')
  })

  it('reports retrieval failure, keeps the simulation operable and retries independently', async () => {
    api.fetcher.mockRejectedValueOnce(new Error('offline'))
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    expect(calibration()).toBe('状態を取得できません')
    await clickButton('開始')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(tick()).toBe('1')

    api.fetcher.mockResolvedValueOnce(Response.json([]))
    await clickButton('再取得')
    expect(calibration()).toBe('未校正')
    expect(tick()).toBe('1')
  })

  it('reports an invalid progress payload as retrieval failure', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json([{ ...clearedProgress, clear_count: '1' }]))
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    expect(calibration()).toBe('状態を取得できません')
  })

  it('runs the factory without Supabase configuration or a progress request', async () => {
    api.configured = false
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    expect(calibration()).toBe('状態を取得できません')
    expect(api.ensure).not.toHaveBeenCalled()
    expect(progressRequests()).toHaveLength(0)
    await clickButton('開始')
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(tick()).toBe('2')
  })

  it('ignores progress that arrives after the anonymous user changes', async () => {
    const oldProgress = deferredResponse()
    api.fetcher.mockReturnValueOnce(oldProgress.promise).mockResolvedValueOnce(Response.json([]))
    await mount(<ConveyorPrototype />, '/prototypes/conveyor/')
    const secondGuest = session('second-guest')
    api.ensure.mockResolvedValue(secondGuest)
    api.getSession.mockResolvedValue(secondGuest)
    await act(async () => { api.listeners.forEach(listener => listener('SIGNED_IN', secondGuest)) })
    expect(calibration()).toBe('未校正')
    expect(progressRequests()[0].signal.aborted).toBe(true)
    expect(progressRequests()[1].headers.get('Authorization')).toBe('Bearer test-token-second-guest')
    await act(async () => { oldProgress.resolve(Response.json([clearedProgress])) })
    expect(calibration()).toBe('未校正')
  })

  it('keeps direct ST-001 access and the ordinary mission UI', async () => {
    api.fetcher.mockResolvedValueOnce(Response.json(attempt, { status: 201 }))
    await mount(<App />, '/')
    expect(container.querySelector('h1')?.textContent).toBe('鉱石の検品ライン')
    expect(container.querySelectorAll('.container-control input')).toHaveLength(16)
    expect(container.querySelector('.calibration-context')).toBeNull()
  })

  it('links through a confirmed clear, stops factory timers on departure and fetches fresh progress on return', async () => {
    const scan = deferredResponse()
    let saved = false
    api.fetcher.mockImplementation(async request => {
      const path = new URL(request.url).pathname
      if (path === '/api/v1/me/progress') return Response.json(saved ? [clearedProgress] : [])
      if (path === '/api/v1/attempts') return Response.json(attempt, { status: 201 })
      if (path === `/api/v1/attempts/${attempt.id}/scans`) return scan.promise
      throw new Error(`Unexpected request: ${path}`)
    })
    window.history.replaceState(null, '', '/prototypes/conveyor/')
    await act(async () => { await import('../conveyor/main') })
    expect(calibration()).toBe('未校正')
    const missionPath = container.querySelector('.conveyor-calibration a')!.getAttribute('href')!
    await clickButton('開始')
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(tick()).toBe('2')
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    // JSDOM does not follow document links. Use their hrefs and exercise the browser lifecycle events.
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    expect(container.childElementCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await mount(<App />, missionPath)
    expect(container.querySelector('.calibration-context a')?.getAttribute('href')).toBe('/prototypes/conveyor/')
    await act(async () => { container.querySelectorAll<HTMLInputElement>('.container-control input')[8].click() })
    await clickButton('スキャンする')
    expect(container.querySelector('.game-result a')).toBeNull()
    await act(async () => {
      saved = true
      scan.resolve(Response.json(clear))
    })
    expect(container.querySelector('#result-title')?.textContent).toBe('ミッション成功')
    const back = container.querySelector('.game-result a')!
    expect(back.textContent).toBe('工場へ戻る')
    const returnPath = back.getAttribute('href')!

    await act(async () => { root?.unmount() })
    root = undefined
    window.history.replaceState(null, '', returnPath)
    await act(async () => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })) })
    expect(calibration()).toBe('校正完了')
    expect(progressRequests()).toHaveLength(2)
    expect(progressRequests()[1].headers.get('Authorization')).toBe('Bearer test-token-guest')
    expect(tick()).toBe('0')
    await clickButton('開始')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(tick()).toBe('1')
  })
})
