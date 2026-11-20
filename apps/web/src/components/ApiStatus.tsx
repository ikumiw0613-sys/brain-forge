import { useEffect, useState } from 'react'
import { checkApiHealth } from '../services/health'

const labels = { checking: '接続確認中', online: '正常接続', offline: '接続できません' }

export function ApiStatus() {
  const [status, setStatus] = useState<keyof typeof labels>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    checkApiHealth(controller.signal)
      .then(() => { if (active) setStatus('online') })
      .catch(() => { if (active) setStatus('offline') })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  return (
    <div className="service">
      <dt>バックエンド API <small>GET /api/v1/health</small></dt>
      <dd className="status-group">
        <span className={`status ${status}`} role="status">{labels[status]}</span>
        <button type="button" disabled={status === 'checking'} onClick={() => {
          setStatus('checking')
          setAttempt(value => value + 1)
        }}>再確認</button>
      </dd>
    </div>
  )
}
