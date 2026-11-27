import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import type { Plugin } from 'vite'
import { parseSortingJudgeResult, sortingJudgePath } from '../src/features/sorting/sortingJudgeProtocol.ts'
import type { SortingJudgeError } from '../src/features/sorting/sortingJudgeProtocol.ts'
import { parseSortingBenchmarkResult, sortingBenchmarkPath } from '../src/features/sorting/sortingBenchmarkProtocol.ts'

// Match FastAPI's request limit, including the longest JSON escape for a Unicode character.
const maxBodyBytes = 12 * 10_000 + 1024
const maxResultBytes = 8192
const timeoutMs = 50_000
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function readDevToken(apiRoot: string): string | undefined {
  const settings: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    try {
      for (const [key, value] of Object.entries(parseEnv(readFileSync(resolve(apiRoot, file), 'utf8')))) {
        if (value) settings[key.toUpperCase()] = value
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
    }
  }
  const token = process.env.JUDGE0_DEV_TOKEN || settings.JUDGE0_DEV_TOKEN
  const environment = process.env.APP_ENV || settings.APP_ENV
  const enabled = process.env.JUDGE0_DEV_ENABLED || settings.JUDGE0_DEV_ENABLED || ''
  if (environment === 'development' && /^(?:1|on|t|true|y|yes)$/i.test(enabled) && token && /^[\w-]{32,128}$/.test(token)) {
    return token
  }
}

function isDirectSameOrigin(request: IncomingMessage): boolean {
  const { localAddress, remoteAddress, localPort } = request.socket
  if (!localAddress || !remoteAddress || !localPort || !loopback.has(localAddress) || !loopback.has(remoteAddress)) return false
  const host = request.headers.host
  const hosts = [`localhost:${localPort}`, `127.0.0.1:${localPort}`, `[::1]:${localPort}`]
  return hosts.some(allowed => host === allowed) && request.headers.origin === `http://${host}` &&
    (request.headers['sec-fetch-site'] === undefined || request.headers['sec-fetch-site'] === 'same-origin') &&
    !Object.keys(request.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-'))
}

function sendJson(response: ServerResponse, status: number, data: object) {
  if (!response.destroyed) {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(JSON.stringify(data))
  }
}

function sendError(response: ServerResponse, status: number, detail: SortingJudgeError) {
  sendJson(response, status, { detail })
}

async function readLimited(message: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of message.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > limit) return
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, bytes)
}

function postToFastApi(path: string, body: Buffer, token: string, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const upstream = httpRequest({
      hostname: '127.0.0.1', port: 8000, path, method: 'POST', agent: false, signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, resolve)
    upstream.once('error', reject)
    upstream.end(body)
  })
}

const upstreamErrors: Partial<Record<number, SortingJudgeError>> = {
  401: 'authentication', 403: 'authentication', 404: 'api_disabled', 408: 'timeout', 413: 'source_too_large',
  415: 'invalid_source', 422: 'invalid_source', 429: 'busy', 504: 'timeout',
}

async function forwardJudge(path: string, body: Buffer, token: string, response: ServerResponse) {
  const benchmark = path === sortingBenchmarkPath
  const signal = AbortSignal.timeout(benchmark ? 120_000 : timeoutMs)
  let status: number
  let reply: Buffer | undefined
  try {
    const upstream = await postToFastApi(path, body, token, signal)
    status = upstream.statusCode ?? 502
    if (status !== 200 && status !== 503) {
      upstream.destroy()
      const detail = upstreamErrors[status]
      sendError(response, detail ? status : 502, detail ?? 'invalid_response')
      return
    }
    reply = await readLimited(upstream, maxResultBytes)
    if (!reply) upstream.destroy()
  } catch {
    sendError(response, signal.aborted ? 504 : 502, signal.aborted ? 'timeout' : 'api_unreachable')
    return
  }

  let result
  try {
    if (reply) {
      const value: unknown = JSON.parse(reply.toString('utf8'))
      result = benchmark ? parseSortingBenchmarkResult(value) : parseSortingJudgeResult(value)
    }
  } catch {
    // Only the validated result is relayed to the browser.
  }
  if (!result || (status === 503) !== (('algorithm_status' in result ? result.algorithm_status : result.status) === 'unavailable')) {
    sendError(response, 502, 'invalid_response')
    return
  }
  sendJson(response, status, result)
}

export function sortingJudgeProxy(apiRoot: string): Plugin {
  return {
    name: 'vite-plugin-brain-forge-sorting-judge',
    apply: 'serve',
    configureServer(server) {
      const { host, https, middlewareMode } = server.config.server
      if (server.config.mode !== 'development' || middlewareMode || https ||
          (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1')) return
      const token = readDevToken(apiRoot)
      server.middlewares.use(async (request, response, next) => {
        const path = request.url
        if (path !== sortingJudgePath && path !== sortingBenchmarkPath) return next()
        if (!isDirectSameOrigin(request)) return sendError(response, 403, 'proxy_forbidden')
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST')
          return sendError(response, 405, 'invalid_source')
        }
        if (!token) return sendError(response, 503, 'proxy_not_configured')
        if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          return sendError(response, 415, 'invalid_source')
        }
        let body: Buffer | undefined
        try {
          body = await readLimited(request, maxBodyBytes)
        } catch {
          return sendError(response, 400, 'invalid_source')
        }
        if (!body) {
          response.setHeader('Connection', 'close')
          request.resume()
          return sendError(response, 413, 'source_too_large')
        }
        await forwardJudge(path, body, token, response)
      })
    },
  }
}
