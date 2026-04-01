import { afterEach, describe, expect, it } from 'vitest'
import { resolveFlow2ApiRuntimeBaseUrl, resolveWebGeminiRuntimeBaseUrl } from '@/lib/flow2api-config'

describe('flow2api runtime base url', () => {
  const originalEnv = process.env.FLOW2API_INTERNAL_BASE_URL
  const originalWebGeminiEnv = process.env.WEB_GEMINI_INTERNAL_BASE_URL

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FLOW2API_INTERNAL_BASE_URL
    } else {
      process.env.FLOW2API_INTERNAL_BASE_URL = originalEnv
    }

    if (originalWebGeminiEnv === undefined) {
      delete process.env.WEB_GEMINI_INTERNAL_BASE_URL
      return
    }
    process.env.WEB_GEMINI_INTERNAL_BASE_URL = originalWebGeminiEnv
  })

  it('keeps configured base url for non-flow2api providers', () => {
    process.env.FLOW2API_INTERNAL_BASE_URL = 'http://host.docker.internal:38000/v1'
    expect(resolveFlow2ApiRuntimeBaseUrl('openai-compatible:test', 'http://localhost:38000/v1'))
      .toBe('http://localhost:38000/v1')
  })

  it('prefers docker internal base url for flow2api provider', () => {
    process.env.FLOW2API_INTERNAL_BASE_URL = 'http://host.docker.internal:38000/v1'
    expect(resolveFlow2ApiRuntimeBaseUrl('flow2api', 'http://localhost:38000/v1'))
      .toBe('http://host.docker.internal:38000/v1')
  })

  it('keeps configured base url for non-web-gemini providers', () => {
    process.env.WEB_GEMINI_INTERNAL_BASE_URL = 'http://host.docker.internal:4000/v1'
    expect(resolveWebGeminiRuntimeBaseUrl('openai-compatible:test', 'http://localhost:4000/v1'))
      .toBe('http://localhost:4000/v1')
  })

  it('prefers docker internal base url for web-gemini provider', () => {
    process.env.WEB_GEMINI_INTERNAL_BASE_URL = 'http://host.docker.internal:4000/v1'
    expect(resolveWebGeminiRuntimeBaseUrl('web-gemini', 'http://127.0.0.1:4000/v1'))
      .toBe('http://host.docker.internal:4000/v1')
  })
})
