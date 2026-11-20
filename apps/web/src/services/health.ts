const baseUrl = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:8000')
  .replace(/\/+$/, '')

export async function checkApiHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    signal, cache: 'no-store', headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Health request failed')

  const data: unknown = await response.json()
  if (
    typeof data !== 'object' || data === null ||
    !('status' in data) || data.status !== 'ok' ||
    !('service' in data) || data.service !== 'brain-forge-api'
  ) throw new Error('Unexpected health response')
}
