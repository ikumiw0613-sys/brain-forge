import { useCallback, useEffect, useRef, useState } from 'react'

const version = 1
const saveDelayMs = 350
const storageKey = (facilityId: string) => `brain-forge:python-draft:${facilityId}`

function loadDraft(facilityId: string): string | undefined {
  try {
    const saved = window.localStorage.getItem(storageKey(facilityId))
    if (saved === null) return
    const data: unknown = JSON.parse(saved)
    if (typeof data === 'object' && data !== null &&
      'version' in data && data.version === version &&
      'facilityId' in data && data.facilityId === facilityId &&
      'code' in data && typeof data.code === 'string') return data.code
  } catch {
    // The editor can start with the default when storage is unavailable or invalid.
  }
}

function saveDraft(facilityId: string, code: string) {
  try {
    window.localStorage.setItem(storageKey(facilityId), JSON.stringify({ version, facilityId, code }))
    return true
  } catch {
    return false
  }
}

export function usePythonDraft(facilityId: string, initialCode: string) {
  const [code, setCode] = useState(() => loadDraft(facilityId) ?? initialCode)
  const pending = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (pending.current !== null && saveDraft(facilityId, pending.current)) pending.current = null
  }, [facilityId])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const edit = useCallback((nextCode: string) => {
    setCode(nextCode)
    if (pending.current === nextCode) return
    pending.current = nextCode
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, saveDelayMs)
  }, [flush])

  return [code, edit] as const
}
