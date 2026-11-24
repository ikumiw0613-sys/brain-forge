import type { BenchmarkConditions, getBenchmarkResult } from './benchmarkEngine'
import { benchmarkDistributionLabel } from './benchmarkDistributions'

export type BenchmarkJob = { variant: 'A' | 'B'; code: string; conditions: BenchmarkConditions }
export type BenchmarkIssue = 'wrong' | 'unverified' | 'invalid-result' | 'exception' | 'timeout'
export type BenchmarkTally = Record<BenchmarkIssue | 'correct', number>
export const emptyTally: BenchmarkTally = { correct: 0, wrong: 0, unverified: 0, 'invalid-result': 0, exception: 0, timeout: 0 }

export type CaseResult = {
  job: BenchmarkJob
  status: 'completed' | 'failed' | 'stopped'
  result: ReturnType<typeof getBenchmarkResult>
  tally: BenchmarkTally
  issue?: { kind: BenchmarkIssue; detail: string }
}

export function correctness(tally: BenchmarkTally) {
  const attempts = tally.correct + tally.wrong + tally['invalid-result'] + tally.exception + tally.timeout
  return attempts ? tally.correct * 100 / attempts : null
}

export const resultMetrics = [
  ['ticks', '計測Tick'],
  ['completed', '完成製品数'],
  ['revenue', '確定売上 (Cr)'],
  ['revenueRate', '生産効率 (Cr/100 Tick)'],
  ['measurements', '計量回数'],
  ['power', '消費電力 (pt)'],
  ['correct', '正答'],
  ['wrong', '誤答'],
  ['accuracy', '正答率 (%)'],
  ['unverified', '計量で未確認'],
  ['invalid-result', '不正な戻り値'],
  ['exception', '実行エラー'],
  ['timeout', 'タイムアウト'],
] as const

export function metricValues({ result, tally }: CaseResult) {
  return { ...result, ...tally, accuracy: correctness(tally) }
}

export function summarize(values: readonly (number | null)[]) {
  const measured = values.filter((value): value is number => value !== null)
  if (!measured.length) return null
  return {
    average: measured.reduce((sum, value) => sum + value, 0) / measured.length,
    min: Math.min(...measured),
    max: Math.max(...measured),
  }
}

export function summarizeBenchmarkGroups(cases: readonly CaseResult[]) {
  const groups = new Map<string, CaseResult[]>()
  for (const entry of cases) {
    const { variant, conditions } = entry.job
    const label = `${benchmarkDistributionLabel(conditions.distribution)} · ${conditions.warehouseSize}部品 · ${conditions.ticks} Tick · ${variant}`
    const group = groups.get(label) ?? []
    group.push(entry)
    groups.set(label, group)
  }
  return Array.from(groups, ([label, group]) => {
    const completed = group.filter(entry => entry.status === 'completed')
    const evaluated = group.filter(entry => entry.status !== 'stopped')
    return {
      label,
      done: completed.length,
      total: group.length,
      efficiency: summarize(completed.map(entry => entry.result.revenueRate))?.average ?? null,
      measurements: summarize(completed.map(entry => entry.result.measurements))?.average ?? null,
      accuracy: summarize(evaluated.map(entry => correctness(entry.tally)))?.average ?? null,
      values: evaluated.map(metricValues),
    }
  })
}
