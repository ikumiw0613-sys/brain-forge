/// <reference lib="webworker" />
import { loadPython } from '../../factory/python/loadPython'
import { repetitions } from './sortingCases'
import type { SortingCommand, SortingEvent } from './sortingProtocol'

const worker = self as unknown as DedicatedWorkerGlobalScope
const send = (event: SortingEvent) => worker.postMessage(event)

worker.onmessage = async ({ data: { code, input } }: MessageEvent<SortingCommand>) => {
  worker.onmessage = null
  try {
    const python = await loadPython()
    send({ type: 'ready' })
    const globals = python.toPy({})
    const parts = python.toPy(input)
    // Keep the timer and bridge in a namespace separate from the player's definitions.
    const measure = python.runPython(`
from time import perf_counter

def _measure(sort_parts, parts, clock=perf_counter, kind=type, array=list, integer=int, every=all):
    items = parts.copy()
    start = clock()
    result = sort_parts(items)
    ms = (clock() - start) * 1000
    if kind(result) is not array or not every(kind(item) is integer for item in result):
        return None
    return (ms, result)

_measure
`)
    try {
      const value: unknown = await python.runPythonAsync(code, { globals, filename: 'sorting.py', dedent: false })
      if (value instanceof python.ffi.PyProxy) value.destroy()
      const sort = globals.get('sort_parts')
      try {
        if (typeof sort !== 'function') {
          send({ type: 'failed', reason: 'invalid-result', detail: '関数 sort_parts(a) を定義してください。' })
          return
        }
        const samples = []
        for (let index = 0; index < repetitions; index++) {
          const sample = measure(sort, parts)
          if (sample == null) {
            send({ type: 'failed', reason: 'invalid-result', detail: '整数だけを含む Python の list を返してください。' })
            return
          }
          try {
            const [ms, output] = sample.toJs({ create_pyproxies: false })
            samples.push({ ms, output })
          } finally { sample.destroy() }
        }
        send({ type: 'finished', samples })
      } finally {
        if (sort instanceof python.ffi.PyProxy) sort.destroy()
      }
    } finally {
      measure.destroy()
      parts.destroy()
      globals.destroy()
    }
  } catch (error) {
    send({ type: 'failed', reason: 'exception', detail: String(error).slice(0, 4000) })
  }
}
