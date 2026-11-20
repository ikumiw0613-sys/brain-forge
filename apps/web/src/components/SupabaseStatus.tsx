import { useEffect, useState } from 'react'
import { ensureSupabaseSession, supabase } from '../lib/supabase'

const labels = {
  checking: '認証確認中',
  anonymous: '匿名認証済み',
  signedIn: '認証済み',
  failed: '認証に失敗しました',
}

export function SupabaseStatus() {
  const [status, setStatus] = useState<keyof typeof labels>('checking')
  const [attempt, setAttempt] = useState(0)
  const configured = Boolean(supabase.client)

  useEffect(() => {
    if (!configured) return
    let active = true
    ensureSupabaseSession()
      .then(session => {
        if (active) setStatus(session.user.is_anonymous ? 'anonymous' : 'signedIn')
      })
      .catch(() => {
        if (active) setStatus('failed')
      })
    return () => { active = false }
  }, [configured, attempt])

  const appearance = status === 'failed' ? 'offline' : status === 'checking' ? 'checking' : 'online'

  return (
    <div className="service">
      <dt>Supabase <small>Auth</small></dt>
      <dd className="status-group">
        <span className={`status ${configured ? appearance : 'pending'}`} role="status">
          {configured ? labels[status] : supabase.status}
        </span>
        {configured && status === 'failed' && (
          <button type="button" onClick={() => {
            setStatus('checking')
            setAttempt(value => value + 1)
          }}>認証を再試行</button>
        )}
      </dd>
    </div>
  )
}
