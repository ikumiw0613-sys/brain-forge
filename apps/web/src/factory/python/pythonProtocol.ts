type Run = { runId: number }
type Request = Run & { requestId: number }

export type PythonCommand =
  | (Run & { type: 'run'; code: string; n: number; target: number })
  | (Request & { type: 'weighed'; weight: number })
  | (Request & { type: 'weighError'; message: string })

export type PythonEvent =
  | (Run & { type: 'ready' })
  | (Request & { type: 'weigh'; index: number })
  | (Run & { type: 'finished'; index: number })
  | (Run & { type: 'failed'; message: string; reason?: 'invalid-result' })
