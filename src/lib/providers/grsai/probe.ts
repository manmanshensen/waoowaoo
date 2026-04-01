import type { GrsaiProbeResult, GrsaiProbeStep } from './types'

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return `Authentication failed (${status})`
  if (status === 429) return `Rate limited (${status})`
  return `Provider error (${status})`
}

export async function probeGrsai(apiKey: string): Promise<GrsaiProbeResult> {
  const steps: GrsaiProbeStep[] = []
  try {
    const response = await fetch('https://grsai.dakka.com.cn/v1/draw/result', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'probe' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      steps.push({
        name: 'models',
        status: 'fail',
        message: classifyStatus(response.status),
        detail: detail.slice(0, 500),
      })
      steps.push({
        name: 'credits',
        status: 'skip',
        message: 'Not supported by GRSAI probe API',
      })
      return { success: false, steps }
    }

    const data = await response.json() as { code?: unknown; msg?: unknown }
    const code = typeof data.code === 'number' ? data.code : null
    const ok = code === 0 || code === -22
    steps.push({
      name: 'models',
      status: ok ? 'pass' : 'fail',
      message: ok ? 'Image result probe reachable' : `Provider error (${code ?? 'unknown'})`,
      detail: typeof data.msg === 'string' ? data.msg.slice(0, 500) : undefined,
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by GRSAI probe API',
    })
    return { success: ok, steps }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    steps.push({
      name: 'models',
      status: 'fail',
      message: `Network error: ${message}`,
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by GRSAI probe API',
    })
    return { success: false, steps }
  }
}
