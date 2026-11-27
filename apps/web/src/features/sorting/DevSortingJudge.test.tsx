// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DevSortingJudge from './DevSortingJudge'
import { sortingJudgeCaseLabels, sortingJudgePath } from './sortingJudgeProtocol'
import type { SortingJudgeResult } from './sortingJudgeProtocol'

const source = 'def sort_parts(a): return sorted(a)'
function report(status: SortingJudgeResult['status'] = 'passed', reasons: Record<string, string> = {}) {
  const cases = Object.keys(sortingJudgeCaseLabels).map(name => ({ name, passed: !(name in reasons), reason: reasons[name] ?? null }))
  return { status, passed_cases: cases.filter(item => item.passed).length, total_cases: cases.length, cases }
}

let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn<typeof fetch>()
const button = () => container.querySelector<HTMLButtonElement>('button')!
const status = () => container.querySelector('[role="status"]')?.textContent
const judge = () => act(async () => button().click())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetchMock.mockReset())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<DevSortingJudge code={source} />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('displays all eight successes and sends only the draft to the same-origin endpoint', async () => {
  fetchMock.mockResolvedValue(json(report()))
  await judge()
  expect(status()).toBe('採点成功 · 8/8 ケース合格')
  expect(container.querySelectorAll('tbody tr')).toHaveLength(8)
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(sortingJudgePath, expect.objectContaining({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', mode: 'same-origin',
    body: JSON.stringify({ source_code: source }),
  }))
})

it('shows wrong answers and Python exceptions with their reasons', async () => {
  fetchMock.mockResolvedValue(json(report('failed', { reverse: 'wrong_order', duplicates: 'python_exception' })))
  await judge()
  expect(status()).toBe('採点失敗 · 6/8 ケース合格')
  expect(container.textContent).toContain('逆順不合格昇順に並んでいません。')
  expect(container.textContent).toContain('重複多数不合格Python の実行中にエラーが発生しました。')
})

it.each([
  { reason: 'judge_unavailable', outcome: 'unavailable' as const, http: 503, heading: '通信エラー · Judge0 を利用できません' },
  { reason: 'judge_timeout', outcome: 'unavailable' as const, http: 503, heading: '採点タイムアウト' },
  { reason: 'time_limit_exceeded', outcome: 'failed' as const, http: 200, heading: 'Python の実行時間切れ' },
])('preserves partial results and distinguishes $reason from an incorrect answer', async ({ reason, outcome, http, heading }) => {
  const reasons = Object.fromEntries(Object.keys(sortingJudgeCaseLabels).slice(1).map((name, index) => [name, index ? 'not_run' : reason]))
  fetchMock.mockResolvedValue(json(report(outcome, reasons), http))
  await judge()
  expect(status()).toBe(`${heading} · 1/8 ケース合格`)
  expect(container.textContent).toContain('重複多数未実行採点が途中で終了しました。')
  if (outcome === 'unavailable') expect(container.textContent).toContain('Tailscale の接続を確認')
})

it.each([
  { detail: 'api_unreachable', http: 502, heading: '通信エラー', message: 'FastAPI に接続できません' },
  { detail: 'authentication', http: 401, heading: '認証エラー', message: '開発用の認証に失敗しました' },
  { detail: 'timeout', http: 504, heading: '採点タイムアウト', message: '待機時間の上限を超えました' },
])('recovers after $detail', async ({ detail, http, heading, message }) => {
  fetchMock.mockResolvedValueOnce(json({ detail }, http)).mockResolvedValueOnce(json(report()))
  await judge()
  expect(status()).toBe(heading)
  expect(container.textContent).toContain(message)
  expect(button().disabled).toBe(false)
  await judge()
  expect(status()).toBe('採点成功 · 8/8 ケース合格')
})

it('recovers after a rejected request without displaying internal error text', async () => {
  fetchMock.mockRejectedValueOnce(new Error('private transport details')).mockResolvedValueOnce(json(report()))
  await judge()
  expect(status()).toBe('通信エラー')
  expect(container.textContent).not.toContain('private transport details')
  await judge()
  expect(status()).toBe('採点成功 · 8/8 ケース合格')
})
