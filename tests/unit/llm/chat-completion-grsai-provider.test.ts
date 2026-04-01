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
    id: 'chatcmpl_grsai_mock',
    object: 'chat.completion',
    created: 1,
    model: 'gemini-3.1-pro',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'grsai-ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
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

const llmLoggerInfoMock = vi.hoisted(() => vi.fn())
const llmLoggerWarnMock = vi.hoisted(() => vi.fn())
const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
}))

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
  _ulogError: vi.fn(),
  _ulogWarn: vi.fn(),
  completionUsageSummary: vi.fn(() => ({ promptTokens: 1, completionTokens: 1 })),
  isRetryableError: vi.fn(() => false),
  llmLogger: {
    info: llmLoggerInfoMock,
    warn: llmLoggerWarnMock,
  },
  logLlmRawInput: logLlmRawInputMock,
  logLlmRawOutput: logLlmRawOutputMock,
  recordCompletionUsage: recordCompletionUsageMock,
  resolveLlmRuntimeModel: resolveLlmRuntimeModelMock,
}))

import { chatCompletion } from '@/lib/llm/chat-completion'

describe('llm chatCompletion grsai official provider branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns completion from grsai official provider without falling through to compat checks', async () => {
    const result = await chatCompletion(
      'user-1',
      'grsai::gemini-3.1-pro',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
    )

    expect(completeGrsaiLlmMock).toHaveBeenCalledWith({
      modelId: 'gemini-3.1-pro',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'gr-key',
      baseUrl: 'https://grsai.dakka.com.cn',
      temperature: 0.2,
    })
    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(completeBailianLlmMock).not.toHaveBeenCalled()
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(result.choices[0]?.message?.content).toBe('grsai-ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })

  it('retries and fails with EMPTY_RESPONSE when grsai returns empty text', async () => {
    completeGrsaiLlmMock.mockResolvedValue({
      id: 'chatcmpl_grsai_empty',
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
        prompt_tokens: 1,
        completion_tokens: 0,
        total_tokens: 1,
      },
    })

    await expect(
      chatCompletion(
        'user-1',
        'grsai::gemini-3.1-pro',
        [{ role: 'user', content: 'hello' }],
        { maxRetries: 2 },
      ),
    ).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      retryable: true,
    })

    expect(completeGrsaiLlmMock).toHaveBeenCalledTimes(3)
  })
})
