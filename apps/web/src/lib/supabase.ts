import { createClient } from '@supabase/supabase-js'

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
