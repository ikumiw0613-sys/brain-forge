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
let pendingRefresh: { accessToken: string; promise: Promise<Session | null> } | undefined

export async function getSupabaseSession(): Promise<Session | null> {
  const client = supabase.client
  if (!client) return null

  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

export async function refreshSupabaseSession(rejected: Session): Promise<Session | null> {
  const client = supabase.client
  const current = await getSupabaseSession()
  if (!client || !current || current.user.id !== rejected.user.id) return null
  if (current.access_token !== rejected.access_token) return current

  const accessToken = current.access_token
  if (pendingRefresh?.accessToken === accessToken) return pendingRefresh.promise

  const promise = client.auth.refreshSession()
    .then(({ data, error }) => {
      if (error) throw error
      return data.session?.user.id === rejected.user.id ? data.session : null
    }).finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = undefined
    })
  pendingRefresh = { accessToken, promise }
  return promise
}

export function ensureSupabaseSession(): Promise<Session> {
  const client = supabase.client
  if (!client) return Promise.reject(new Error('Supabase is not configured'))
  if (pendingSession) return pendingSession

  const restoreOrCreateSession = async () => {
    const current = await getSupabaseSession()
    if (current) return current

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
