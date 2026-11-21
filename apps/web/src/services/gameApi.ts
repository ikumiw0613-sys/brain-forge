import type { Session } from '@supabase/supabase-js'
import createOpenApiClient from 'openapi-fetch'
import type { components, paths } from '../../../../packages/contracts/openapi'
import { getSupabaseSession, refreshSupabaseSession } from '../lib/supabase'
import { apiBaseUrl } from './apiBaseUrl'

type Schemas = components['schemas']
type CreateAttemptBody = Schemas['CreateAttemptRequest']
type ScanBody = Schemas['ScanRequest']
type ScanResult = Schemas['ScanResponse']

export type ScanOperation = Readonly<{ attemptId: string; body: ScanBody }>

type ErrorKind =
  | 'authentication_required' | 'auth_unavailable' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'conflict' | 'validation' | 'server' | 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid_response'

export class GameApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly retryable: boolean
  readonly outcomeUnknown: boolean

  constructor(readonly kind: ErrorKind, options: {
    status?: number
    code?: string
    retryable?: boolean
    outcomeUnknown?: boolean
  } = {}) {
    super(`Game API request failed (${kind})`)
    this.name = 'GameApiError'
    this.status = options.status
    this.code = options.code
    this.retryable = options.retryable ?? false
    this.outcomeUnknown = options.outcomeUnknown ?? false
  }
}

const httpKinds: Partial<Record<number, ErrorKind>> = {
  401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'validation',
}
const knownErrorCodes = new Set([
  'invalid_access_token', 'auth_not_configured', 'database_not_configured', 'auth_unavailable',
  'invalid_auth_response', 'database_unavailable', 'stage_not_found', 'attempt_not_found',
  'action_id_conflict', 'step_conflict', 'already_scanned', 'attempt_finished',
])

type RequestOptions = { headers: { Authorization: string }; signal: AbortSignal }
type Result<T> = { data?: T; error?: unknown; response: Response }

export function createGameApi(options: { baseUrl?: string; fetcher?: (request: Request) => Promise<Response>; timeoutMs?: number } = {}) {
  const http = createOpenApiClient<paths>({
    baseUrl: options.baseUrl ?? apiBaseUrl,
    fetch: options.fetcher,
    cache: 'no-store',
    redirect: 'error',
  })
  const scans = new WeakMap<ScanOperation, { pending?: Promise<ScanResult> }>()

  async function execute<T>(
    send: (options: RequestOptions) => Promise<Result<T>>,
    operation: 'read' | 'create' | 'scan',
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const replaySafe = operation !== 'create'
    const mutates = operation !== 'read'
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 10_000)
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline
    let sent = false

    function sendWithSession(session: Session) {
      signal.throwIfAborted()
      sent = true
      return withSignal(send({ headers: { Authorization: `Bearer ${session.access_token}` }, signal }), signal)
    }

    try {
      signal.throwIfAborted()
      const session = await withSignal(getSupabaseSession(), signal).catch(() => {
        signal.throwIfAborted()
        throw new GameApiError('auth_unavailable', { retryable: true })
      })
      if (!session?.access_token) throw new GameApiError('authentication_required')

      let result = await sendWithSession(session)
      if (result.response.status === 401) {
        sent = false
        signal.throwIfAborted()
        const refreshed = await withSignal(refreshSupabaseSession(session), signal).catch(() => {
          signal.throwIfAborted()
          return null
        })
        if (refreshed?.access_token && refreshed.user.id === session.user.id && refreshed.access_token !== session.access_token) {
          result = await sendWithSession(refreshed)
        }
      }

      const { response, data, error } = result
      if (!response.ok) {
        const server = response.status >= 500
        throw new GameApiError(server ? 'server' : httpKinds[response.status] ?? 'http', {
          status: response.status,
          code: getErrorCode(error),
          retryable: server && replaySafe,
          outcomeUnknown: server && mutates,
        })
      }
      if (data == null) {
        throw new GameApiError('invalid_response', { status: response.status, retryable: replaySafe, outcomeUnknown: mutates })
      }
      return data
    } catch (error) {
      if (error instanceof GameApiError) throw error
      const kind = callerSignal?.aborted ? 'cancelled' : deadline.aborted ? 'timeout'
        : error instanceof SyntaxError ? 'invalid_response' : 'network'
      throw new GameApiError(kind, { retryable: kind !== 'cancelled' && (!sent || replaySafe), outcomeUnknown: sent && mutates })
    }
  }

  function createAttempt(body: CreateAttemptBody, signal?: AbortSignal) {
    const payload = { ...body }
    return execute(request => http.POST('/api/v1/attempts', { ...request, body: payload }), 'create', signal)
  }

  function getAttempt(attemptId: string, signal?: AbortSignal) {
    return execute(request => http.GET('/api/v1/attempts/{attempt_id}', {
      ...request, params: { path: { attempt_id: attemptId } },
    }), 'read', signal)
  }

  async function getProgress(signal?: AbortSignal): Promise<readonly Schemas['StageProgress'][]> {
    const rows: unknown = await execute(request => http.GET('/api/v1/me/progress', request), 'read', signal)
    if (!Array.isArray(rows) || !rows.every(isStageProgress)) {
      throw new GameApiError('invalid_response', { retryable: true })
    }
    return rows
  }

  function createScanOperation(attemptId: string, containerIndex: number, expectedStep: number): ScanOperation {
    const body: ScanBody = Object.freeze({ index: containerIndex, expected_step: expectedStep, action_id: crypto.randomUUID() })
    const operation = Object.freeze({ attemptId, body })
    scans.set(operation, {})
    return operation
  }

  function scanContainer(operation: ScanOperation, signal?: AbortSignal): Promise<ScanResult> {
    const state = scans.get(operation)
    if (!state) return Promise.reject(new GameApiError('validation'))

    state.pending ??= execute(request => http.POST('/api/v1/attempts/{attempt_id}/scans', {
      ...request, params: { path: { attempt_id: operation.attemptId } }, body: operation.body,
    }), 'scan', signal).finally(() => { state.pending = undefined })
    return state.pending
  }

  return { createAttempt, getAttempt, getProgress, createScanOperation, scanContainer }
}

export const gameApi = createGameApi()

function isStageProgress(row: unknown): row is Schemas['StageProgress'] {
  return typeof row === 'object' && row !== null &&
    'stage_id' in row && typeof row.stage_id === 'string' &&
    'clear_count' in row && typeof row.clear_count === 'number' &&
    'best_scans' in row && typeof row.best_scans === 'number'
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'detail' in error &&
    typeof error.detail === 'string' && knownErrorCodes.has(error.detail)) return error.detail
  return undefined
}

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
