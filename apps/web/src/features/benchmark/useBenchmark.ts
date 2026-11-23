import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { assessSearchResult } from '../../factory/warehouse/engine'
import { usePythonSearch } from '../../factory/python/usePythonSearch'
import { createBenchmark, getBenchmarkResult, measureBenchmark, produceBenchmarkPart } from './benchmarkEngine'
import { emptyTally } from './benchmarkStats'
import type { BenchmarkJob, BenchmarkTally, CaseResult } from './benchmarkStats'

type Batch = {
  jobs: readonly BenchmarkJob[]
  index: number
  model: ReturnType<typeof createBenchmark>
  tally: BenchmarkTally
  results: readonly CaseResult[]
  status: 'running' | CaseResult['status']
}

function startCase(job: BenchmarkJob) {
  return { model: createBenchmark(job.conditions.seed, job.conditions.warehouseSize), tally: emptyTally }
}

export function useBenchmark() {
  const current = useRef<Batch | null>(null)
  const [displayed, setDisplayed] = useState<Batch | null>(null)

  function commit(batch: Batch, publish = true) {
    current.current = batch
    if (publish) setDisplayed(batch)
  }

  const python = usePythonSearch({
    beginAttempt() {
      const batch = current.current
      if (batch?.status !== 'running') return
      const { search } = batch.model
      return { n: search.weights.length, target: search.order.requiredWeight }
    },
    assess(index) {
      return assessSearchResult(current.current!.model.search, index)
    },
    weigh(index, onComplete) {
      const batch = current.current
      if (batch?.status !== 'running') return false
      const limit = batch.jobs[batch.index].conditions.ticks
      const model = measureBenchmark(batch.model, index, limit)
      if (model === batch.model) return false
      const capped = model.line.tick === limit
      const publish = capped || Math.floor(model.line.tick / 32) !== Math.floor(batch.model.line.tick / 32)
      commit({ ...batch, model }, publish)
      // The effect closes the Worker at the cap, including a measurement cut short by the last Tick.
      if (!capped) onComplete?.(model.search.log.at(-1)!)
      return true
    },
    cancelWeigh() {},
    flushMeasurements() {},
  })

  function closeCase(batch: Batch, status: CaseResult['status'], issue?: CaseResult['issue']) {
    const job = batch.jobs[batch.index]
    const tally = issue ? { ...batch.tally, [issue.kind]: batch.tally[issue.kind] + 1 } : batch.tally
    const results = [...batch.results, { job, status, tally, result: getBenchmarkResult(batch.model), issue }]
    const index = batch.index + 1
    if (status === 'stopped' || index === batch.jobs.length) {
      commit({ ...batch, results, tally, status: status === 'stopped' || results.every(entry => entry.status === 'completed') ? status : 'failed' })
      return
    }

    const next = batch.jobs[index]
    commit({ ...batch, index, results, ...startCase(next) })
    python.start(next.code)
  }

  const handleResult = useEffectEvent(() => {
    const batch = current.current
    if (batch?.status !== 'running') return
    const { conditions, code } = batch.jobs[batch.index]
    if (batch.model.line.tick === conditions.ticks) {
      python.stop()
      closeCase(batch, 'completed')
      return
    }
    const { report } = python
    const order = batch.model.search.order.id
    if (report.status === 'failed') {
      closeCase(batch, 'failed', { kind: report.reason ?? 'exception', detail: `${order} · ${report.message}` })
    } else if (report.status === 'finished') {
      if (!report.correct) {
        closeCase(batch, 'failed', { kind: 'wrong', detail: `${order} · index ${report.index} は最初に条件を満たす位置と一致しません。` })
        return
      }
      const tally = { ...batch.tally, correct: batch.tally.correct + 1 }
      const model = produceBenchmarkPart(batch.model, report.index, conditions.ticks)
      if (model === batch.model) {
        closeCase({ ...batch, tally }, 'failed', { kind: 'unverified', detail: `${order} · 製造に必要な部品を計量で確認できませんでした。` })
      } else if (model.line.tick === conditions.ticks) {
        closeCase({ ...batch, model, tally }, 'completed')
      } else {
        commit({ ...batch, model, tally })
        python.start(code)
      }
    }
  })

  useEffect(() => {
    handleResult()
  }, [python.report, displayed])

  const status: Batch['status'] | 'idle' = displayed?.status ?? 'idle'
  return {
    status,
    job: displayed?.jobs[displayed.index],
    caseNumber: displayed ? displayed.index + 1 : 0,
    caseCount: displayed?.jobs.length ?? 0,
    result: displayed ? getBenchmarkResult(displayed.model) : null,
    results: displayed?.results ?? [],
    start(jobs: readonly BenchmarkJob[]) {
      if (!jobs.length || jobs.some(job => !job.code.trim()) || current.current?.status === 'running') return
      commit({ jobs, index: 0, results: [], status: 'running', ...startCase(jobs[0]) })
      python.start(jobs[0].code)
    },
    stop() {
      const batch = current.current
      if (batch?.status !== 'running') return
      python.stop()
      closeCase(batch, 'stopped')
    },
  }
}
