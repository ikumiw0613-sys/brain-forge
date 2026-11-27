import { EventEmitter } from 'node:events'
import { request as httpRequest } from 'node:http'
import type { ClientRequest, IncomingMessage, RequestOptions, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { ViteDevServer } from 'vite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { benchmarkDistributions, sortingBenchmarkPath } from '../src/features/sorting/sortingBenchmarkProtocol'
import { sortingJudgeCaseLabels, sortingJudgePath } from '../src/features/sorting/sortingJudgeProtocol'
import { sortingJudgeProxy } from './sortingJudgeProxy'

vi.mock('node:http', { spy: true })

const token = 'proxy-test-secret'.repeat(3)
const body = JSON.stringify({ source_code: 'def sort_parts(a): return sorted(a)' })
const origin = 'http://localhost:5173'
const fetchHeaders = { host: 'localhost:5173', origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }
const report = {
  status: 'passed', passed_cases: 8, total_cases: 8,
  cases: Object.keys(sortingJudgeCaseLabels).map(name => ({ name, passed: true, reason: null })),
}

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>

function mount({ host = 'localhost', mode = 'development' } = {}) {
  const use = vi.fn<(middleware: Middleware) => void>()
  const configure = sortingJudgeProxy('unused-settings-directory').configureServer
  if (typeof configure !== 'function') throw new Error('Expected a Vite configureServer hook')
  configure.call({} as ThisParameterType<typeof configure>, {
    config: { mode, server: { host } }, middlewares: { use },
  } as unknown as ViteDevServer)
  return use.mock.calls[0]?.[0]
}

async function send(middleware: Middleware, {
  headers = fetchHeaders as IncomingMessage['headers'], remoteAddress = '::1',
  method = 'POST', url = sortingJudgePath, input = body,
} = {}) {
  const stream = Object.assign(Readable.from([Buffer.from(input)]), {
    socket: { localAddress: '::1', remoteAddress, localPort: 5173 }, method, url, headers,
  })
  const response = { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() }
  const next = vi.fn()
  await middleware(stream as unknown as IncomingMessage, response as unknown as ServerResponse, next)
  return { status: response.writeHead.mock.calls[0]?.[0], text: response.end.mock.calls[0]?.[0], next }
}

function mockApi(status: number, data: unknown, headers = {}) {
  const request = new EventEmitter()
  const send = vi.fn()
  vi.mocked(httpRequest).mockImplementation(((options: RequestOptions, receive: (reply: IncomingMessage) => void) => {
    const reply = Object.assign(Readable.from([Buffer.from(JSON.stringify(data))]), { statusCode: status, headers })
    return Object.assign(request, { end: (payload: Buffer) => { send(options, payload); receive(reply as unknown as IncomingMessage) } }) as unknown as ClientRequest
  }) as typeof httpRequest)
  return send
}

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'development')
  vi.stubEnv('JUDGE0_DEV_ENABLED', 'true')
  vi.stubEnv('JUDGE0_DEV_TOKEN', token)
  vi.mocked(httpRequest).mockReset()
})

afterEach(() => vi.unstubAllEnvs())

it('adds the configured Bearer token only to its fixed loopback request and relays only grading fields', async () => {
  const call = mockApi(200, { ...report, authorization: token, cases: report.cases.map(item => ({ ...item, extra: token })) }, {
    'set-cookie': `leak=${token}`,
  })
  const reply = await send(mount(), { headers: { ...fetchHeaders, authorization: 'Bearer browser-supplied', cookie: 'browser=1' } })
  expect(reply.status).toBe(200)
  expect(JSON.parse(reply.text)).toEqual(report)
  expect(reply.text).not.toContain(token)
  expect(call).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    hostname: '127.0.0.1', port: 8000, path: sortingJudgePath, agent: false, method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }), Buffer.from(body))
})

it('applies the same loopback and token rules to benchmark results', async () => {
  const benchmark = {
    algorithm_status: 'completed', correctness_passed: true, correctness: report,
    python_version: '3.11.2', judge0_language_id: 31,
    measurements: [100, 1000, 10000].flatMap(size => Object.keys(benchmarkDistributions).map(distribution => ({
      size, distribution, seed: 42, successful_runs: 5, requested_runs: 5, status: 'completed',
      median_ms: 1, min_ms: 0.5, max_ms: 1.5, judge0_cpu_ms: 20, error_message: null,
    }))),
  }
  const call = mockApi(200, { ...benchmark, secret: token })
  expect((await send(mount(), { url: sortingBenchmarkPath, remoteAddress: '192.0.2.1' })).status).toBe(403)
  const reply = await send(mount(), { url: sortingBenchmarkPath })
  expect(reply.status).toBe(200)
  expect(JSON.parse(reply.text)).toEqual(benchmark)
  expect(reply.text).not.toContain(token)
  expect(call).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    path: sortingBenchmarkPath, hostname: '127.0.0.1', headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
  }), Buffer.from(body))
})

it.each([
  { headers: { ...fetchHeaders, origin: 'https://elsewhere.example' } },
  { headers: { ...fetchHeaders, origin: undefined } },
  { headers: { ...fetchHeaders, 'sec-fetch-site': 'cross-site' } },
  { headers: { ...fetchHeaders, host: 'elsewhere.example:5173', origin: 'http://elsewhere.example:5173' } },
  { headers: { ...fetchHeaders, host: 'localhost:5678', origin: 'http://localhost:5678' } },
  { headers: { ...fetchHeaders, forwarded: 'for=192.0.2.1' } },
  { headers: { ...fetchHeaders, 'x-forwarded-for': '127.0.0.1' } },
  { remoteAddress: '192.0.2.1' },
])('blocks requests outside the direct same-origin loopback boundary (%#)', async options => {
  const reply = await send(mount(), options)
  expect(reply.status).toBe(403)
  expect(httpRequest).not.toHaveBeenCalled()
})

it('handles only the bounded JSON POST to the sorting route', async () => {
  const middleware = mount()
  expect((await send(middleware, { url: '/api/v1/dev/judge0/execute' })).next).toHaveBeenCalledOnce()
  expect((await send(middleware, { method: 'GET' })).status).toBe(405)
  expect((await send(middleware, { headers: { ...fetchHeaders, 'content-type': 'text/plain' } })).status).toBe(415)
  expect((await send(middleware, { input: 'a'.repeat(122_000) })).status).toBe(413)
  expect(httpRequest).not.toHaveBeenCalled()
})

it('does not forward requests when disabled, running in another mode, or listening beyond loopback', async () => {
  expect(mount({ host: '0.0.0.0' })).toBeUndefined()
  expect(mount({ mode: 'production' })).toBeUndefined()
  vi.stubEnv('APP_ENV', 'production')
  expect(await send(mount())).toMatchObject({ status: 503, text: '{"detail":"proxy_not_configured"}' })
  expect(httpRequest).not.toHaveBeenCalled()
})

it.each([
  [401, 401, 'authentication'], [302, 502, 'invalid_response'], [200, 502, 'invalid_response'],
])('replaces an upstream %i response with a safe error and does not follow redirects', async (upstream, status, detail) => {
  mockApi(upstream, { detail: token }, { location: 'http://elsewhere.example/' })
  const reply = await send(mount())
  expect(reply).toMatchObject({ status, text: JSON.stringify({ detail }) })
  expect(httpRequest).toHaveBeenCalledOnce()
})
