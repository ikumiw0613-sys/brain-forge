import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'

function configureSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return { client: null, status: '接続未設定' }
  if (!key.startsWith('sb_publishable_')) return { client: null, status: '設定エラー' }
  try {
    return { client: createClient(url, key), status: '設定済み' }
  } catch {
    return { client: null, status: '設定エラー' }
  }
}

export const supabase = configureSupabase()

let pendingSession: Promise<Session> | undefined

export function ensureSupabaseSession(): Promise<Session> {
  const client = supabase.client
  if (!client) return Promise.reject(new Error('Supabase is not configured'))
  if (pendingSession) return pendingSession

  const restoreOrCreateSession = async () => {
    const current = await client.auth.getSession()
    if (current.error) throw current.error
    if (current.data.session) return current.data.session

    const anonymous = await client.auth.signInAnonymously()
    if (anonymous.error) throw anonymous.error
    if (!anonymous.data.session) throw new Error('Supabase did not return a session')
    return anonymous.data.session
  }

  const locks = navigator.locks
  const session = locks
    ? locks.request('brain-forge-anonymous-session', restoreOrCreateSession)
    : restoreOrCreateSession()
  pendingSession = Promise.resolve(session).finally(() => { pendingSession = undefined })

  return pendingSession
}
