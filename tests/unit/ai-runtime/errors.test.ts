import { describe, expect, it } from 'vitest'
import { toAiRuntimeError } from '@/lib/ai-runtime/errors'

describe('toAiRuntimeError empty response mapping', () => {
  it('maps nested Gemini empty response signal to EMPTY_RESPONSE even when status is 429', () => {
    const upstreamError = new Error('Too Many Requests') as Error & {
      status?: number
      cause?: unknown
    }
    upstreamError.status = 429
    upstreamError.cause = {
      error: {
        message: 'received empty response from Gemini: no meaningful content in candidates (request id: x)',
        type: 'channel_error',
        code: 'channel:empty_response',
      },
      code: 429,
      status: 'Too Many Requests',
    }

    const runtimeError = toAiRuntimeError(upstreamError)
    expect(runtimeError.code).toBe('EMPTY_RESPONSE')
    expect(runtimeError.retryable).toBe(true)
  })

  it('keeps RATE_LIMIT when there is no empty response signal', () => {
    const runtimeError = toAiRuntimeError({
      status: 429,
      message: 'Too Many Requests',
    })
    expect(runtimeError.code).toBe('RATE_LIMIT')
    expect(runtimeError.retryable).toBe(true)
  })

  it('maps provider 503 unavailable to retryable runtime error', () => {
    const runtimeError = toAiRuntimeError({
      message:
        'got status: UNAVAILABLE. {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
    })

    expect(runtimeError.code).toBe('NETWORK_ERROR')
    expect(runtimeError.retryable).toBe(true)
  })
})
