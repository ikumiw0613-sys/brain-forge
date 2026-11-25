import { judgeSorting, medianTime, repetitions, sortingInput } from './sortingCases'
import type { SortingCase } from './sortingCases'
import type { SortingCommand, SortingEvent, SortingResult } from './sortingProtocol'

const loadingMs = 45_000
const executionMs = 10_000

export function runSortingCase(testCase: SortingCase, code: string, signal: AbortSignal, onReady: () => void): Promise<SortingResult> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve({ ...testCase, status: 'stopped', detail: '試験を中断しました。' })
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./sorting.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve({ ...testCase, status: 'exception', detail: 'Workerを起動できませんでした。' })
      return
    }
    const input = sortingInput(testCase)
    let loading = true
    let deadline = performance.now() + loadingMs
    let timer = window.setTimeout(timeout, loadingMs)

    function finish(result: SortingResult) {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      resolve(result)
    }
    function timeout() {
      finish({ ...testCase, status: 'timeout', detail: loading ? 'Pythonの準備時間が上限を超えました。' : 'ケースの実行時間が10秒を超えました。' })
    }
    function abort() {
      finish({ ...testCase, status: 'stopped', detail: '試験を中断しました。' })
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = event => finish({ ...testCase, status: 'exception', detail: event.message || 'Worker実行エラー' })
    worker.onmessageerror = () => finish({ ...testCase, status: 'exception', detail: 'Workerから結果を受信できませんでした。' })
    worker.onmessage = ({ data }: MessageEvent<SortingEvent>) => {
      if (performance.now() >= deadline) {
        timeout()
      } else if (data.type === 'ready' && loading) {
        loading = false
        window.clearTimeout(timer)
        deadline = performance.now() + executionMs
        timer = window.setTimeout(timeout, executionMs)
        onReady()
      } else if (data.type === 'failed') {
        finish({ ...testCase, status: data.reason, detail: data.detail })
      } else if (data.type === 'finished' && !loading) {
        const { samples } = data
        if (samples.length !== repetitions || samples.some(({ ms }) => !Number.isFinite(ms) || ms < 0)) {
          finish({ ...testCase, status: 'exception', detail: '計測値を取得できませんでした。' })
          return
        }
        const outcomes = samples.map(({ output }) => judgeSorting(input, output))
        if (outcomes.includes('invalid-result')) {
          finish({ ...testCase, status: 'invalid-result', detail: '戻り値は整数だけを含むリストにしてください。' })
        } else if (outcomes.includes('wrong')) {
          finish({ ...testCase, status: 'wrong', detail: '要素または順序が昇順の正解と一致しません。' })
        } else {
          finish({ ...testCase, status: 'passed', ms: medianTime(samples.map(({ ms }) => ms)) })
        }
      }
    }
    try {
      worker.postMessage({ code, input } satisfies SortingCommand)
    } catch {
      finish({ ...testCase, status: 'exception', detail: 'Workerに試験データを送信できませんでした。' })
    }
  })
}
