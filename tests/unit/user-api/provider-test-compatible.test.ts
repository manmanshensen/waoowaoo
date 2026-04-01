import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  instances: [] as Array<Record<string, unknown>>,
  create: vi.fn(async () => ({
    choices: [{ message: { content: 'pong' } }],
  })),
}))

const fetchMock = vi.hoisted(() =>
  vi.fn<typeof fetch>(async () => new Response('not-found', { status: 404 })),
)

vi.mock('openai', () => ({
  default: class OpenAI {
    constructor(options: Record<string, unknown>) {
      openAIState.instances.push(options)
    }
    chat = {
      completions: {
        create: openAIState.create,
      },
    }
  },
}))

import { testProviderConnection } from '@/lib/user-api/provider-test'

describe('provider test connection compatible probes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openAIState.instances = []
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.WEB_GEMINI_TEST_TIMEOUT_MS
  })

  it('asks user to configure llm when free probes are unsupported', async () => {
    const result = await testProviderConnection({
      apiType: 'openai-compatible',
      baseUrl: 'https://compat.example.com/v1',
      apiKey: 'compat-key',
    })

    expect(result.success).toBe(false)
    expect(result.steps[0]?.name).toBe('models')
    expect(result.steps[0]?.status).toBe('skip')
    expect(result.steps[1]?.name).toBe('credits')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps[2]).toEqual({
      name: 'textGen',
      status: 'fail',
      message: 'No free probe endpoint detected. Please configure an LLM model first, then retry / 未发现可用的免费探测接口，请先配置 LLM 模型后再测试',
    })
  })

  it('falls back to configured llm test when free probes are unsupported', async () => {
    const result = await testProviderConnection({
      apiType: 'openai-compatible',
      baseUrl: 'https://compat.example.com/v1',
      apiKey: 'compat-key',
      llmModel: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]?.status).toBe('skip')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps[2]).toEqual({
      name: 'textGen',
      status: 'pass',
      model: 'gpt-4.1-mini',
      message: 'Response: pong',
    })
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 20,
      temperature: 0,
    })
  })

  it('marks success when any free probe endpoint passes', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    })

    const result = await testProviderConnection({
      apiType: 'gemini-compatible',
      baseUrl: 'https://compat.example.com',
      apiKey: 'compat-key',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]).toMatchObject({
      name: 'models',
      status: 'pass',
      message: 'Found 2 models',
    })
    expect(result.steps[1]?.name).toBe('credits')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps.length).toBe(2)
  })

  it('supports flow2api as an openai-compatible probe target', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    })

    const result = await testProviderConnection({
      apiType: 'flow2api',
      baseUrl: 'http://localhost:38000',
      apiKey: 'han1234',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]).toMatchObject({
      name: 'models',
      status: 'pass',
      message: 'Found 1 models',
    })
  })

  it('uses longer probe timeout for web-gemini', async () => {
    const originalAbortTimeout = AbortSignal.timeout
    const abortTimeoutMock = vi.fn(() => new AbortController().signal)
    AbortSignal.timeout = abortTimeoutMock

    try {
      const result = await testProviderConnection({
        apiType: 'web-gemini',
        baseUrl: 'http://127.0.0.1:4000/v1',
        apiKey: 'compat-key',
        llmModel: 'gemini-web-proxy',
      })

      expect(result.success).toBe(true)
      expect(abortTimeoutMock).toHaveBeenCalledWith(90_000)
    } finally {
      AbortSignal.timeout = originalAbortTimeout
    }
  })
})
