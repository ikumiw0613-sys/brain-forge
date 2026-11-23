import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { assessSearchResult } from '../weight-search/engine'
import { usePythonSearch } from '../weight-search/usePythonSearch'
import { benchmarkConditions, createBenchmark, getBenchmarkResult, measureBenchmark, produceBenchmarkPart } from './benchmarkEngine'

type Trial = {
  code: string
  model: ReturnType<typeof createBenchmark>
  status: 'running' | 'completed' | 'failed' | 'stopped'
  error?: string
}

export function useBenchmark() {
  const current = useRef<Trial | null>(null)
  const [displayed, setDisplayed] = useState<Trial | null>(null)

  function commit(trial: Trial, publish = true) {
    current.current = trial
    if (publish) setDisplayed(trial)
  }

  const python = usePythonSearch({
    beginAttempt() {
      const trial = current.current
      if (trial?.status !== 'running') return
      const { search } = trial.model
      return { n: search.weights.length, target: search.order.requiredWeight }
    },
    assess(index) {
      return assessSearchResult(current.current!.model.search, index)
    },
    weigh(index, onComplete) {
      const trial = current.current
      if (trial?.status !== 'running') return false
      const model = measureBenchmark(trial.model, index)
      if (model === trial.model) return false
      const capped = model.line.tick === benchmarkConditions.ticks
      // Let React stop the Worker after this callback returns, even if a measurement is cut short.
      const publish = capped || Math.floor(model.line.tick / 32) !== Math.floor(trial.model.line.tick / 32)
      commit({ ...trial, model, status: capped ? 'completed' : 'running' }, publish)
      if (!capped) onComplete?.(model.search.log.at(-1)!)
      return true
    },
    cancelWeigh() {},
    flushMeasurements() {},
  })

  const handleResult = useEffectEvent(() => {
    const trial = current.current
    if (trial?.status === 'completed') {
      python.stop()
      return
    }
    if (trial?.status !== 'running') return
    const { report } = python
    if (report.status === 'failed') {
      commit({ ...trial, status: 'failed', error: report.message })
    } else if (report.status === 'finished') {
      const model = produceBenchmarkPart(trial.model, report.index)
      if (model === trial.model) {
        commit({ ...trial, status: 'failed',
          error: `${trial.model.search.order.id}：製造に必要な部品を計量で確認できませんでした。` })
      } else {
        const capped = model.line.tick === benchmarkConditions.ticks
        commit({ ...trial, model, status: capped ? 'completed' : 'running' })
        if (!capped) python.start(trial.code)
      }
    }
  })

  useEffect(() => {
    handleResult()
  }, [python.report, displayed?.status])

  const status: Trial['status'] | 'idle' = displayed?.status ?? 'idle'
  return {
    status,
    error: displayed?.error,
    code: displayed?.code,
    result: displayed ? getBenchmarkResult(displayed.model) : null,
    start(code: string) {
      if (!code.trim() || current.current?.status === 'running') return
      commit({ code, model: createBenchmark(), status: 'running' })
      python.start(code)
    },
    stop() {
      const trial = current.current
      if (trial?.status !== 'running') return
      commit({ ...trial, status: 'stopped' })
      python.stop()
    },
  }
}
