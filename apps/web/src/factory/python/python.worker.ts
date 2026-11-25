/// <reference lib="webworker" />
import { loadPython } from './loadPython'
import type { PythonCommand, PythonEvent, PythonPrepareCommand } from './pythonProtocol'

const worker = self as unknown as DedicatedWorkerGlobalScope
const send = (event: PythonEvent) => worker.postMessage(event)
const waiting = new Map<number, { resolve: (weight: number) => void; reject: (error: Error) => void }>()
let runId: number | undefined
let requestId = 0
let prepared: ReturnType<typeof loadPython> | undefined

async function execute({ code, n, target, runId }: Extract<PythonCommand, { type: 'run' }>) {
  try {
    const pyodide = await (prepared ?? loadPython())
    function requestWeight(index: number) {
      return new Promise<number>((resolve, reject) => {
        const id = ++requestId
        waiting.set(id, { resolve, reject })
        send({ type: 'weigh', runId, requestId: id, index })
      })
    }
    const globals = pyodide.toPy({ n, target, _request_weight: requestWeight })
    try {
      pyodide.runPython(`
def _bind_weigh(request, size):
    async def weigh(index):
        if type(index) is not int or not 0 <= index < size:
            raise ValueError(f"weigh(index) には 0〜{size - 1} の整数を指定してください。")
        return await request(index)
    return weigh

weigh = _bind_weigh(_request_weight, n)
del _bind_weigh, _request_weight
`, { globals })
      send({ type: 'ready', runId })
      const value: unknown = await pyodide.runPythonAsync(code, { globals, filename: 'search.py', dedent: false })
      if (value instanceof pyodide.ffi.PyProxy) value.destroy()
      if (!globals.has('result')) {
        send({ type: 'failed', runId, reason: 'invalid-result', message: '探索結果を result に代入してください。' })
        return
      }
      const index: unknown = pyodide.runPython('result if type(result) is int else None', { globals })
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > n) {
        send({ type: 'failed', runId, reason: 'invalid-result', message: `result には 0〜${n} の整数を指定してください。` })
        return
      }
      send({ type: 'finished', runId, index })
    } finally {
      globals.destroy()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send({ type: 'failed', runId, message: message.slice(0, 4000) })
  }
}

worker.onmessage = ({ data }: MessageEvent<PythonCommand | PythonPrepareCommand>) => {
  if (data.type === 'prepare') {
    if (runId !== undefined || prepared) return
    prepared = loadPython()
    // A run may arrive after initialization fails. Report the failure when it starts.
    void prepared.catch(() => {})
    return
  }
  if (data.type === 'run') {
    if (runId !== undefined) return
    runId = data.runId
    void execute(data)
    return
  }
  if (data.runId !== runId) return
  const request = waiting.get(data.requestId)
  if (!request) return
  waiting.delete(data.requestId)
  if (data.type === 'weighed') request.resolve(data.weight)
  else request.reject(new Error(data.message))
}
