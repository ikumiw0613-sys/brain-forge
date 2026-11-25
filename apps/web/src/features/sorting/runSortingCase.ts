import { judgeSorting, medianTime, repetitions, sortingInput } from './sortingCases'
import type { SortingCase } from './sortingCases'
import type { SortingCommand, SortingEvent, SortingFailure, SortingResult } from './sortingProtocol'

const loadingMs = 45_000
const executionMs = 10_000

export async function runSortingCase(testCase: SortingCase, code: string, signal: AbortSignal, onReady: () => void): Promise<SortingResult> {
  const result = await runSortingInput(sortingInput(testCase), code, signal, repetitions, onReady)
  return result.status === 'passed' ? { ...testCase, status: 'passed', ms: result.ms } : { ...testCase, ...result }
}

type SortingRun = { status: 'passed'; ms: number; output: number[] } | SortingFailure

export function runSortingInput(input: readonly number[], code: string, signal: AbortSignal, sampleCount: 1 | typeof repetitions = 1,
  onReady?: () => void): Promise<SortingRun> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve({ status: 'stopped', detail: '仕分けを中断しました。' })
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./sorting.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve({ status: 'exception', detail: 'Workerを起動できませんでした。' })
      return
    }
    let loading = true
    let finished = false
    let deadline = performance.now() + loadingMs
    let timer = window.setTimeout(timeout, loadingMs)

    function finish(result: SortingRun) {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      resolve(result)
    }
    function timeout() {
      finish({ status: 'timeout', detail: loading ? 'Pythonの準備時間が上限を超えました。' : '仕分けの実行時間が10秒を超えました。' })
    }
    function abort() {
      finish({ status: 'stopped', detail: '仕分けを中断しました。' })
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = event => finish({ status: 'exception', detail: event.message || 'Worker実行エラー' })
    worker.onmessageerror = () => finish({ status: 'exception', detail: 'Workerから結果を受信できませんでした。' })
    worker.onmessage = ({ data }: MessageEvent<SortingEvent>) => {
      if (finished) return
      if (performance.now() >= deadline) {
        timeout()
      } else if (data.type === 'ready' && loading) {
        loading = false
        window.clearTimeout(timer)
        deadline = performance.now() + executionMs
        timer = window.setTimeout(timeout, executionMs)
        onReady?.()
      } else if (data.type === 'failed') {
        finish({ status: data.reason, detail: data.detail })
      } else if (data.type === 'finished' && !loading) {
        const { samples } = data
        if (samples.length !== sampleCount || samples.some(({ ms }) => !Number.isFinite(ms) || ms < 0)) {
          finish({ status: 'exception', detail: '計測値を取得できませんでした。' })
          return
        }
        const outcomes = samples.map(({ output }) => judgeSorting(input, output))
        if (outcomes.includes('invalid-result')) {
          finish({ status: 'invalid-result', detail: '戻り値は整数だけを含むリストにしてください。' })
        } else if (outcomes.includes('wrong')) {
          finish({ status: 'wrong', detail: '要素または順序が昇順の正解と一致しません。' })
        } else {
          // The judge checks the type and contents of every sample before publishing any output.
          finish({ status: 'passed', ms: medianTime(samples.map(({ ms }) => ms)), output: samples[0].output as number[] })
        }
      }
    }
    try {
      worker.postMessage({ code, input, sampleCount } satisfies SortingCommand)
    } catch {
      finish({ status: 'exception', detail: 'Workerに仕分けデータを送信できませんでした。' })
    }
  })
}
