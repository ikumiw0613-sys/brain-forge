import { createPythonWorker } from '../../factory/python/usePythonSearch'
import type { PythonPrepareCommand } from '../../factory/python/pythonProtocol'

const prepare: PythonPrepareCommand = { type: 'prepare' }

export function prepareBenchmarkWorkers(pool: Worker[], count: number) {
  while (pool.length < count) {
    let worker: Worker | undefined
    try {
      const spare = createPythonWorker()
      worker = spare
      spare.onerror = () => {
        const index = pool.indexOf(spare)
        if (index < 0) return
        pool.splice(index, 1)
        spare.onerror = null
        spare.terminate()
      }
      spare.postMessage(prepare)
      pool.push(spare)
    } catch {
      worker?.terminate()
      // A speculative startup failure leaves the normal on-demand path available.
      break
    }
  }
}

export function closeBenchmarkWorkers(pool: Worker[]) {
  for (const worker of pool.splice(0)) {
    worker.onerror = null
    worker.terminate()
  }
}
