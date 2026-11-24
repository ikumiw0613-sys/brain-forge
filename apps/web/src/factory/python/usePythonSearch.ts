import { useEffect, useRef, useState } from 'react'
import type { PythonWeighingPort } from './PythonWeighingPort'
import type { PythonCommand, PythonEvent } from './pythonProtocol'

export const pythonLimits = { loadingMs: 45_000, executionMs: 1_800_000, idleMs: 10_000, measurements: 1024 } as const

export type PythonReport =
  | { status: 'idle' | 'loading' | 'running' | 'stopped' }
  | { status: 'failed'; message: string; reason?: 'invalid-result' | 'timeout' }
  | ({ status: 'finished'; index: number } & ReturnType<PythonWeighingPort['assess']>)

type WeighRequest = Extract<PythonEvent, { type: 'weigh' }>

type ActiveRun = {
  id: number
  worker: Worker
  n: number
  loading: boolean
  deadline: number
  wakeDeadline: number
  timer?: number
  lastRequest: number
  measurements: number
  weighing: boolean
  deferredMeasurement?: WeighRequest
  pausedAt?: number
}

function dispose(run: ActiveRun) {
  window.clearTimeout(run.timer)
  run.worker.onmessage = null
  run.worker.onerror = null
  run.worker.onmessageerror = null
  run.worker.terminate()
}

export function createPythonWorker() {
  return new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
}

export function usePythonSearch(game: PythonWeighingPort, createWorker = createPythonWorker) {
  const [report, setReport] = useState<PythonReport>({ status: 'idle' })
  const active = useRef<ActiveRun | null>(null)
  const runSequence = useRef(0)
  const measurementPaused = useRef(false)

  useEffect(() => () => {
    if (active.current) dispose(active.current)
    active.current = null
  }, [])

  function finish(run: ActiveRun, result: PythonReport) {
    if (active.current !== run) return
    active.current = null
    dispose(run)
    if (run.weighing) game.cancelWeigh()
    game.flushMeasurements()
    setReport(result)
  }

  function timeOut(run: ActiveRun) {
    finish(run, {
      status: 'failed',
      reason: 'timeout',
      message: run.loading ? 'Pyodideの読み込みがタイムアウトしました。' : 'Pythonの実行がタイムアウトしました。',
    })
  }

  function armTimer(run: ActiveRun) {
    window.clearTimeout(run.timer)
    const now = performance.now()
    run.wakeDeadline = run.loading ? run.deadline : Math.min(run.deadline, now + pythonLimits.idleMs)
    run.timer = window.setTimeout(() => timeOut(run), Math.max(0, run.wakeDeadline - now))
  }

  function updateMeasurementTimer(run: ActiveRun) {
    if (measurementPaused.current) {
      run.pausedAt ??= performance.now()
      window.clearTimeout(run.timer)
    } else {
      if (run.pausedAt !== undefined) run.deadline += performance.now() - run.pausedAt
      run.pausedAt = undefined
      armTimer(run)
    }
  }

  function send(run: ActiveRun, command: PythonCommand) {
    try {
      run.worker.postMessage(command)
    } catch {
      finish(run, { status: 'failed', message: 'Python Workerにメッセージを送信できませんでした。' })
    }
  }

  function requestMeasurement(run: ActiveRun, request: WeighRequest) {
    const { index, requestId } = request
    if (!Number.isSafeInteger(requestId) || requestId <= run.lastRequest) return
    run.lastRequest = requestId
    const reject = (message: string) => send(run, { type: 'weighError', runId: run.id, requestId, message })
    if (!Number.isInteger(index) || index < 0 || index >= run.n) {
      reject(`weigh(index) には 0〜${run.n - 1} の整数を指定してください。`)
      return
    }
    if (run.weighing || run.deferredMeasurement) {
      reject('計量機は動作中です。前の weigh() を await してから呼び出してください。')
      return
    }
    if (run.measurements >= pythonLimits.measurements) {
      reject(`1回の実行で計量できる上限は ${pythonLimits.measurements} 回です。`)
      return
    }
    if (measurementPaused.current) {
      run.deferredMeasurement = request
      updateMeasurementTimer(run)
      return
    }
    startMeasurement(run, request)
  }

  function startMeasurement(run: ActiveRun, { index, requestId }: WeighRequest) {
    run.weighing = true
    const accepted = game.weigh(index, ({ weight }) => {
      if (active.current !== run) return
      run.weighing = false
      if (performance.now() >= run.wakeDeadline) {
        timeOut(run)
        return
      }
      armTimer(run)
      send(run, { type: 'weighed', runId: run.id, requestId, weight })
    })
    if (!accepted) {
      run.weighing = false
      send(run, { type: 'weighError', runId: run.id, requestId, message: '現在の注文で計量を開始できませんでした。' })
      return
    }
    run.measurements++
    if (run.weighing) updateMeasurementTimer(run)
  }

  function start(code: string) {
    if (active.current) return
    let worker: Worker
    try {
      worker = createWorker()
    } catch {
      setReport({ status: 'failed', message: 'Python Workerを起動できませんでした。' })
      return
    }
    const inputs = game.beginAttempt()
    if (!inputs) {
      worker.terminate()
      setReport({ status: 'failed', message: '計量完了を待つか、次の注文を受けてから実行してください。' })
      return
    }
    const id = ++runSequence.current
    const run: ActiveRun = {
      id, worker, n: inputs.n, loading: true, deadline: performance.now() + pythonLimits.loadingMs,
      wakeDeadline: 0, lastRequest: 0, measurements: 0, weighing: false,
    }
    active.current = run
    setReport({ status: 'loading' })
    armTimer(run)

    worker.onmessage = ({ data }: MessageEvent<PythonEvent>) => {
      if (!data || active.current !== run || data.runId !== run.id) return
      if (run.pausedAt === undefined && performance.now() >= run.wakeDeadline) {
        timeOut(run)
        return
      }
      if (data.type === 'failed') {
        finish(run, { status: 'failed', message: data.message, reason: data.reason })
      } else if (data.type === 'ready' && run.loading) {
        run.loading = false
        run.deadline = performance.now() + pythonLimits.executionMs
        armTimer(run)
        setReport({ status: 'running' })
      } else if (data.type === 'weigh' && !run.loading) {
        requestMeasurement(run, data)
      } else if (data.type === 'finished' && !run.loading) {
        const { index } = data
        if (run.weighing || run.deferredMeasurement) {
          finish(run, { status: 'failed', message: '計量の完了を await してから結果を返してください。' })
        } else if (!Number.isInteger(index) || index < 0 || index > run.n) {
          finish(run, { status: 'failed', reason: 'invalid-result', message: `result には 0〜${run.n} の整数を指定してください。` })
        } else {
          finish(run, { status: 'finished', index, ...game.assess(index) })
        }
      }
    }
    worker.onerror = event => {
      finish(run, { status: 'failed', message: event.message || 'Python Workerでエラーが発生しました。' })
    }
    worker.onmessageerror = () => {
      finish(run, { status: 'failed', message: 'Python Workerからのメッセージを受信できませんでした。' })
    }
    send(run, { type: 'run', runId: id, code, ...inputs })
  }

  return {
    report,
    busy: report.status === 'loading' || report.status === 'running',
    start,
    stop() {
      if (active.current) finish(active.current, { status: 'stopped' })
    },
    clearReport() { setReport({ status: 'idle' }) },
    setMeasurementPaused(paused: boolean) {
      if (measurementPaused.current === paused) return
      measurementPaused.current = paused
      const run = active.current
      if (!run || (!run.weighing && !run.deferredMeasurement)) return
      updateMeasurementTimer(run)
      if (!paused && run.deferredMeasurement) {
        const request = run.deferredMeasurement
        run.deferredMeasurement = undefined
        startMeasurement(run, request)
      }
    },
  }
}
