import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLlmRuntimeModelMock = vi.hoisted(() =>
  vi.fn(async () => ({
    provider: 'grsai',
    modelId: 'gemini-3.1-pro',
    modelKey: 'grsai::gemini-3.1-pro',
  })),
)

const completeBailianLlmMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('bailian should not be called')
  }),
)

const completeGrsaiLlmMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_stream_grsai_mock',
    object: 'chat.completion',
    created: 1,
    model: 'gemini-3.1-pro',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'stream-grsai-ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 2,
      completion_tokens: 2,
      total_tokens: 4,
    },
  })),
)

const completeSiliconFlowLlmMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('siliconflow should not be called')
  }),
)

const runOpenAICompatChatCompletionMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('openai-compat should not be called')
  }),
)

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'grsai',
    name: 'GRSAI',
    apiKey: 'gr-key',
    baseUrl: 'https://grsai.dakka.com.cn',
    gatewayRoute: 'official' as const,
  })),
)

const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/model-gateway', () => ({
  resolveModelGatewayRoute: vi.fn(() => 'official'),
  runOpenAICompatChatCompletion: runOpenAICompatChatCompletionMock,
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getProviderKey: vi.fn((providerId: string) => providerId),
}))

vi.mock('@/lib/providers/bailian', () => ({
  completeBailianLlm: completeBailianLlmMock,
}))

vi.mock('@/lib/providers/grsai', () => ({
  completeGrsaiLlm: completeGrsaiLlmMock,
}))

vi.mock('@/lib/providers/siliconflow', () => ({
  completeSiliconFlowLlm: completeSiliconFlowLlmMock,
}))

vi.mock('@/lib/llm/runtime-shared', () => ({
  completionUsageSummary: vi.fn(() => ({ promptTokens: 2, completionTokens: 2 })),
  llmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  logLlmRawInput: logLlmRawInputMock,
  logLlmRawOutput: logLlmRawOutputMock,
  recordCompletionUsage: recordCompletionUsageMock,
  resolveLlmRuntimeModel: resolveLlmRuntimeModelMock,
}))

import { chatCompletionStream } from '@/lib/llm/chat-stream'

describe('llm chatCompletionStream grsai official provider branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams from grsai completion result and exits early', async () => {
    const onChunk = vi.fn()
    const onComplete = vi.fn()

    const completion = await chatCompletionStream(
      'user-1',
      'grsai::gemini-3.1-pro',
      [{ role: 'user', content: 'hello' }],
      {},
      {
        onChunk,
        onComplete,
      },
    )

    expect(completeGrsaiLlmMock).toHaveBeenCalledWith({
      modelId: 'gemini-3.1-pro',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'gr-key',
      baseUrl: 'https://grsai.dakka.com.cn',
      temperature: 0.7,
    })
    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(completeBailianLlmMock).not.toHaveBeenCalled()
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledWith('stream-grsai-ok', undefined)
    expect(onChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'text',
        delta: 'stream-grsai-ok',
      }),
    )
    expect(completion.choices[0]?.message?.content).toBe('stream-grsai-ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })

  it('throws EMPTY_RESPONSE when grsai returns empty text', async () => {
    completeGrsaiLlmMock.mockResolvedValueOnce({
      id: 'chatcmpl_stream_grsai_empty',
      object: 'chat.completion',
      created: 1,
      model: 'gemini-3.1-pro',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 2,
        completion_tokens: 0,
        total_tokens: 2,
      },
    })

    await expect(
      chatCompletionStream(
        'user-1',
        'grsai::gemini-3.1-pro',
        [{ role: 'user', content: 'hello' }],
      ),
    ).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      retryable: true,
    })
  })
})
