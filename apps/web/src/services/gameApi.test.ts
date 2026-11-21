import type { Session } from '@supabase/supabase-js'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSupabaseSession } from '../lib/supabase'
import { createGameApi } from './gameApi'
import { checkApiHealth } from './health'

const sdk = vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://auth.example.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_mock')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  return { getSession: vi.fn(), refreshSession: vi.fn(), signInAnonymously: vi.fn() }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: sdk }) }))

const attemptId = '141b041b-2d7d-432e-8d3c-9393024abb93'
const attempt = {
  id: attemptId, stage_id: 'ST-001', status: 'in_progress',
  candidate_range: { lo: 0, hi: 15 }, scans_used: 0, scans_remaining: 5, scans: [],
} as const
const scan = {
  index: 7, quality: 46, status: 'in_progress',
  candidate_range: { lo: 8, hi: 15 }, scans_used: 1, scans_remaining: 4,
} as const

function makeSession(token = 'fixture-token', userId = 'fixture-player'): Session {
  return {
    access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer',
    user: { id: userId, aud: 'authenticated', created_at: '2026-01-01', app_metadata: {}, user_metadata: {}, is_anonymous: true },
  }
}

const authResult = (session: Session | null) => ({ data: { session }, error: null })

function setup(timeoutMs?: number) {
  const fetcher = vi.fn<(request: Request) => Promise<Response>>()
  return { api: createGameApi({ fetcher, timeoutMs }), fetcher }
}

beforeEach(() => {
  vi.resetAllMocks()
  sdk.getSession.mockResolvedValue(authResult(makeSession()))
})

afterAll(() => { vi.unstubAllEnvs() })

describe('game API contract and authentication', () => {
  it('creates a challenge with the active token and a typed retry body', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json(attempt, { status: 201 }))
    const body = { stage_id: 'ST-001', previous_attempt_id: attemptId }

    await expect(api.createAttempt(body)).resolves.toEqual(attempt)
    const request = fetcher.mock.calls[0][0]
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.test/api/v1/attempts')
    expect(request.redirect).toBe('error')
    expect(request.headers.get('Authorization')).toBe('Bearer fixture-token')
    expect(await request.json()).toEqual(body)
  })

  it('gets the challenge and progress using the latest token on each call', async () => {
    const { api, fetcher } = setup()
    const progress = [{ stage_id: 'ST-001', best_scans: 3, clear_count: 2 }]
    fetcher.mockResolvedValueOnce(Response.json(attempt)).mockResolvedValueOnce(Response.json(progress))
    sdk.getSession.mockResolvedValueOnce(authResult(makeSession('first-token')))
      .mockResolvedValueOnce(authResult(makeSession('updated-token')))

    await expect(api.getAttempt(attemptId)).resolves.toEqual(attempt)
    await expect(api.getProgress()).resolves.toEqual(progress)
    expect(fetcher.mock.calls.map(([request]) => [request.method, new URL(request.url).pathname, request.headers.get('Authorization')])).toEqual([
      ['GET', `/api/v1/attempts/${attemptId}`, 'Bearer first-token'],
      ['GET', '/api/v1/me/progress', 'Bearer updated-token'],
    ])
  })

  it('keeps protected requests and anonymous account creation separate when signed out', async () => {
    const { api, fetcher } = setup()
    sdk.getSession.mockResolvedValue(authResult(null))

    await expect(api.getProgress()).rejects.toMatchObject({ kind: 'authentication_required', outcomeUnknown: false })
    expect(fetcher).not.toHaveBeenCalled()
    expect(sdk.signInAnonymously).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 and preserves the entire scan body', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({ detail: 'invalid_access_token' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(scan))
    sdk.refreshSession.mockResolvedValue(authResult(makeSession('refreshed-token')))
    const operation = api.createScanOperation(attemptId, 7, 0)

    await expect(api.scanContainer(operation)).resolves.toEqual(scan)
    expect(sdk.refreshSession).toHaveBeenCalledTimes(1)
    const [first, second] = fetcher.mock.calls.map(([request]) => request)
    expect(first.headers.get('Authorization')).toBe('Bearer fixture-token')
    expect(second.headers.get('Authorization')).toBe('Bearer refreshed-token')
    expect(await first.json()).toEqual(await second.json())
  })

  it('stops after a second 401', async () => {
    const { api, fetcher } = setup()
    fetcher.mockImplementation(async () => Response.json({ detail: 'invalid_access_token' }, { status: 401 }))
    sdk.refreshSession.mockResolvedValue(authResult(makeSession('refreshed-token')))

    await expect(api.getAttempt(attemptId)).rejects.toMatchObject({ kind: 'unauthorized', status: 401, retryable: false })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sdk.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('can use an already refreshed session after receiving a 401', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json([]))
    sdk.getSession.mockResolvedValueOnce(authResult(makeSession()))
      .mockResolvedValueOnce(authResult(makeSession('updated-token')))

    await expect(api.getProgress()).resolves.toEqual([])
    expect(fetcher.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer updated-token')
    expect(sdk.refreshSession).not.toHaveBeenCalled()
  })

  it('returns unauthorized without resending when refreshing the session fails', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json({}, { status: 401 }))
    sdk.refreshSession.mockRejectedValue(new Error('internal auth diagnostic'))

    await expect(api.getProgress()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the request bound to the original user when the session changes', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json({}, { status: 401 }))
    sdk.getSession.mockResolvedValueOnce(authResult(makeSession()))
      .mockResolvedValueOnce(authResult(makeSession('other-token', 'other-player')))

    await expect(api.getProgress()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(sdk.refreshSession).not.toHaveBeenCalled()
  })

  it('still restores an existing session and shares anonymous sign-in across callers', async () => {
    await expect(ensureSupabaseSession()).resolves.toMatchObject({ access_token: 'fixture-token' })
    expect(sdk.signInAnonymously).not.toHaveBeenCalled()

    sdk.getSession.mockResolvedValue(authResult(null))
    sdk.signInAnonymously.mockResolvedValue(authResult(makeSession('anonymous-token')))
    const first = ensureSupabaseSession()
    expect(ensureSupabaseSession()).toBe(first)
    await expect(first).resolves.toMatchObject({ access_token: 'anonymous-token' })
    expect(sdk.signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('preserves the public health check without an auth lookup or bearer token', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'ok', service: 'brain-forge-api' }))
    try {
      await expect(checkApiHealth(new AbortController().signal)).resolves.toBeUndefined()
      const [url, init] = fetcher.mock.calls[0]
      expect(url).toBe('https://api.example.test/api/v1/health')
      expect(new Headers(init?.headers).has('Authorization')).toBe(false)
      expect(sdk.getSession).not.toHaveBeenCalled()
    } finally {
      fetcher.mockRestore()
    }
  })
})

describe('scan operations', () => {
  it('coalesces duplicate submissions and rejects a modified copy of an operation', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json(scan))
    const operation = api.createScanOperation(attemptId, 7, 0)
    const pending = api.scanContainer(operation)

    expect(api.scanContainer(operation)).toBe(pending)
    await expect(api.scanContainer({ ...operation, body: { ...operation.body, index: 8 } }))
      .rejects.toMatchObject({ kind: 'validation' })
    await expect(pending).resolves.toEqual(scan)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const request = fetcher.mock.calls[0][0]
    expect(request.url).toBe(`https://api.example.test/api/v1/attempts/${attemptId}/scans`)
    expect(request.method).toBe('POST')
    expect(await request.json()).toEqual({ index: 7, expected_step: 0, action_id: operation.body.action_id })
    expect(Object.isFrozen(operation.body)).toBe(true)
    expect(api.createScanOperation(attemptId, 7, 0).body.action_id).not.toBe(operation.body.action_id)
  })

  it('keeps the same scan payload after a timeout with an unknown outcome', async () => {
    const { api, fetcher } = setup(30)
    fetcher.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(Response.json(scan))
    const operation = api.createScanOperation(attemptId, 7, 0)

    await expect(api.scanContainer(operation)).rejects.toMatchObject({ kind: 'timeout', retryable: true, outcomeUnknown: true })
    await expect(api.scanContainer(operation)).resolves.toEqual(scan)
    const payloads = await Promise.all(fetcher.mock.calls.map(([request]) => request.json()))
    expect(payloads).toEqual([operation.body, operation.body])
  })
})

describe('error classification', () => {
  it.each([
    [403, 'forbidden', false], [404, 'not_found', false], [409, 'conflict', false],
    [422, 'validation', false], [500, 'server', true], [503, 'server', true],
  ])('classifies HTTP %i as %s', async (status, kind, retryable) => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json({ detail: 'internal fixture details' }, { status }))

    await expect(api.getAttempt(attemptId)).rejects.toMatchObject({ status, kind, retryable, code: undefined })
  })

  it('exposes only recognized conflict codes', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(Response.json({ detail: 'step_conflict' }, { status: 409 }))
    await expect(api.scanContainer(api.createScanOperation(attemptId, 7, 0)))
      .rejects.toMatchObject({ kind: 'conflict', code: 'step_conflict', retryable: false, outcomeUnknown: false })
  })

  it('classifies network failures and marks an uncertain challenge creation as unsafe to repeat', async () => {
    const { api, fetcher } = setup()
    fetcher.mockRejectedValue(new TypeError('internal network diagnostic'))

    await expect(api.getProgress()).rejects.toMatchObject({ kind: 'network', status: undefined, retryable: true })
    await expect(api.createAttempt({ stage_id: 'ST-001' })).rejects.toMatchObject({
      kind: 'network', retryable: false, outcomeUnknown: true, message: 'Game API request failed (network)',
    })
  })

  it('classifies an invalid response and allows cancelling before dispatch', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(new Response('<html>invalid</html>', { status: 200 }))
    await expect(api.getAttempt(attemptId)).rejects.toMatchObject({ kind: 'invalid_response' })
    await expect(api.getProgress(AbortSignal.abort())).rejects.toMatchObject({ kind: 'cancelled', outcomeUnknown: false })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
