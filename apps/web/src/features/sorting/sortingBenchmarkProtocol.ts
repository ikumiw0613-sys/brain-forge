import { hasKey, isRecord, parseSortingJudgeResult } from './sortingJudgeProtocol.ts'
import type { SortingJudgeResult } from './sortingJudgeProtocol.ts'

export const sortingBenchmarkPath = '/api/v1/dev/judge0/sorting/benchmark'
export const benchmarkDistributions = { random: 'ランダム', reverse: '逆順', sorted: '昇順', duplicates: '重複多数' }
export const measurementLabels = {
  completed: '完了', time_limit: 'タイムアウト・測定不成立', runtime_error: '実行エラー・測定不成立',
  incorrect: '結果不正・測定不成立', invalidated: '測定無効',
  unavailable: '通信エラー・測定不成立', not_run: '未測定',
}
export const measurementErrors = {
  case_time_limit: 'ケースの測定時間を超えました。',
  request_time_limit: '応答または測定全体の時間制限を超えました。',
  larger_case_skipped: '同じ分布の小さい入力がタイムアウトしました。',
  wrong_output: '並び順・要素数・重複数のいずれかが不正です。',
  invalid_return: '整数だけを含むリストを返してください。',
  python_exception: 'Python 実行エラーが発生しました。',
  memory_limit_exceeded: 'メモリ制限を超えました。',
  invalid_output: '測定結果を検証できませんでした。',
  judge_unavailable: 'Judge0 に接続できないか、実行結果を取得できませんでした。',
  correctness_required: '正当性判定を通過していません。',
  request_stopped: '先行ケースの結果により測定を終了しました。',
  later_case_incorrect: '後続ケースの結果に不正が見つかりました。',
}
export const algorithmLabels = {
  completed: '測定完了', partial: '一部の測定が不成立', incorrect: '正当性の確認に失敗',
  unavailable: '接続エラー・測定結果の取得失敗', time_limit: 'タイムアウト・一部または全件が測定不成立',
}

type Measurement = {
  size: number
  distribution: keyof typeof benchmarkDistributions
  seed: number
  successful_runs: number
  requested_runs: number
  median_ms: number | null
  min_ms: number | null
  max_ms: number | null
  judge0_cpu_ms: number | null
  status: keyof typeof measurementLabels
  error_message: keyof typeof measurementErrors | null
}

export type SortingBenchmarkResult = {
  algorithm_status: keyof typeof algorithmLabels
  correctness_passed: boolean
  correctness: SortingJudgeResult
  python_version: string | null
  judge0_language_id: number
  measurements: Measurement[]
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isTime(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function parseMeasurement(value: unknown): Measurement | undefined {
  if (!isRecord(value)) return
  const { size, distribution, seed, successful_runs, requested_runs, median_ms, min_ms, max_ms, judge0_cpu_ms,
    status, error_message } = value
  if (!isInteger(size) || ![100, 1000, 10000].includes(size) || !hasKey(benchmarkDistributions, distribution) ||
      !isInteger(seed) || requested_runs !== 5 || !isInteger(successful_runs) || successful_runs < 0 ||
      successful_runs > requested_runs || !hasKey(measurementLabels, status) ||
      (error_message !== null && !hasKey(measurementErrors, error_message)) ||
      !isTime(median_ms) || !isTime(min_ms) || !isTime(max_ms) || !isTime(judge0_cpu_ms)) return
  if (status === 'completed') {
    if (successful_runs !== requested_runs || error_message !== null ||
        median_ms === null || min_ms === null || max_ms === null ||
        min_ms > median_ms || median_ms > max_ms) return
  } else if (median_ms !== null || min_ms !== null || max_ms !== null || error_message === null) return
  return { size, distribution, seed, successful_runs, requested_runs, median_ms, min_ms, max_ms, judge0_cpu_ms, status, error_message }
}

export function parseSortingBenchmarkResult(value: unknown): SortingBenchmarkResult | undefined {
  if (!isRecord(value)) return
  const { algorithm_status, correctness_passed, python_version, judge0_language_id, measurements } = value
  const correctness = parseSortingJudgeResult(value.correctness)
  if (!hasKey(algorithmLabels, algorithm_status) || !correctness || correctness_passed !== (correctness.status === 'passed') ||
      (python_version !== null && (typeof python_version !== 'string' || !/^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(python_version))) ||
      !isInteger(judge0_language_id) || judge0_language_id < 1 || !Array.isArray(measurements) || measurements.length !== 12) return
  const parsed: Measurement[] = []
  for (const item of measurements) {
    const measurement = parseMeasurement(item)
    if (!measurement || (!correctness_passed && measurement.status !== 'not_run') ||
        (measurement.status === 'completed' && algorithm_status === 'incorrect')) return
    parsed.push(measurement)
  }
  if (new Set(parsed.map(item => `${item.size}-${item.distribution}`)).size !== parsed.length) return
  return { algorithm_status, correctness_passed, correctness, python_version, judge0_language_id, measurements: parsed }
}
