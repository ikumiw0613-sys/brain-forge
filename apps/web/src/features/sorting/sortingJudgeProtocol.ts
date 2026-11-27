export const sortingJudgePath = '/api/v1/dev/judge0/sorting/judge'

export const sortingJudgeCaseLabels = {
  random: 'ランダム', reverse: '逆順', sorted: '昇順', duplicates: '重複多数',
  all_equal: '全要素同一', single: '1 要素', empty: '空配列', negative_and_zero: '負数とゼロ',
} as const

export const sortingJudgeReasonLabels = {
  wrong_length: '要素数が入力と一致しません。',
  wrong_elements: '要素または重複数が入力と一致しません。',
  wrong_order: '昇順に並んでいません。',
  invalid_return: '整数だけを含むリストを返してください。',
  invalid_output: '実行結果の形式を確認できませんでした。',
  python_exception: 'Python の実行中にエラーが発生しました。',
  time_limit_exceeded: 'Python の実行時間が上限を超えました。',
  memory_limit_exceeded: 'Python のメモリ使用量が上限を超えました。',
  judge_unavailable: 'Judge0 の実行結果を取得できませんでした。',
  judge_timeout: 'Judge0 の応答が待機時間の上限を超えました。',
  not_run: '採点が途中で終了しました。',
} as const

export const sortingJudgeErrorLabels = {
  proxy_not_configured: 'FastAPI の開発用 Judge0 設定を確認し、Vite を再起動してください。',
  proxy_forbidden: 'Vite が待ち受けるローカル URL から仕分け施設を開いてください。',
  api_unreachable: 'FastAPI に接続できません。pnpm.cmd dev:api で起動してください。',
  api_disabled: 'FastAPI の開発用採点 API が無効です。開発用の設定と起動コマンドを確認してください。',
  authentication: '開発用の認証に失敗しました。FastAPI と Vite の設定を確認し、両方を再起動してください。',
  busy: '別の実行が進行中です。しばらく待ってから再試行してください。',
  timeout: '採点の応答が待機時間の上限を超えました。しばらく待ってから再試行してください。',
  source_too_large: 'ソースコードを 10,000 文字以内にしてください。',
  invalid_source: '採点に送る Python コードを確認してください。',
  invalid_response: '採点 API から結果を読み取れませんでした。Vite と FastAPI の起動状態を確認してください。',
  network: '開発サーバーと通信できません。Vite の起動状態を確認して再試行してください。',
} as const

export type SortingJudgeError = keyof typeof sortingJudgeErrorLabels
type SortingJudgeReason = keyof typeof sortingJudgeReasonLabels
type SortingJudgeCase = { name: keyof typeof sortingJudgeCaseLabels; passed: boolean; reason: SortingJudgeReason | null }
export type SortingJudgeResult = {
  status: 'passed' | 'failed' | 'unavailable'
  passed_cases: number
  total_cases: number
  cases: SortingJudgeCase[]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasKey<T extends object>(labels: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(labels, key)
}

export function parseSortingJudgeError(value: unknown): SortingJudgeError | undefined {
  return isRecord(value) && hasKey(sortingJudgeErrorLabels, value.detail) ? value.detail : undefined
}

export function parseSortingJudgeResult(value: unknown): SortingJudgeResult | undefined {
  if (!isRecord(value)) return
  const { status, passed_cases, total_cases, cases } = value
  if ((status !== 'passed' && status !== 'failed' && status !== 'unavailable') ||
      !Array.isArray(cases) || total_cases !== cases.length || total_cases !== Object.keys(sortingJudgeCaseLabels).length) return

  const parsed: SortingJudgeCase[] = []
  for (const item of cases) {
    if (!isRecord(item)) return
    const { name, passed, reason } = item
    if (!hasKey(sortingJudgeCaseLabels, name) || typeof passed !== 'boolean' ||
        (passed ? reason !== null : !hasKey(sortingJudgeReasonLabels, reason))) return
    parsed.push({ name, passed, reason: reason as SortingJudgeReason | null })
  }

  if (new Set(parsed.map(item => item.name)).size !== total_cases) return
  const passedCount = parsed.filter(item => item.passed).length
  const unavailable = parsed.some(item => item.reason === 'judge_unavailable' || item.reason === 'judge_timeout')
  const outcome = unavailable ? 'unavailable' : passedCount === total_cases ? 'passed' : 'failed'
  if (passed_cases !== passedCount || status !== outcome) return
  return { status, passed_cases, total_cases, cases: parsed }
}
