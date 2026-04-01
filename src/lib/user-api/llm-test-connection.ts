import OpenAI from 'openai'
import { ApiError } from '@/lib/api-errors'
import { resolveFlow2ApiRuntimeBaseUrl, resolveWebGeminiRuntimeBaseUrl } from '@/lib/flow2api-config'

type SupportedProvider =
  | 'openrouter'
  | 'google'
  | 'anthropic'
  | 'openai'
  | 'bailian'
  | 'grsai'
  | 'siliconflow'
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'flow2api'
  | 'web-gemini'
  | 'custom'

type TestConnectionPayload = {
  provider?: string
  apiKey?: string
  baseUrl?: string
  region?: string
  model?: string
}

export type LlmConnectionTestResult = {
  provider: SupportedProvider
  message: string
  model?: string
  answer?: string
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const raw = process.env[name]
  if (typeof raw !== 'string') return undefined
  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function getProviderConnectionTimeoutMs(provider: SupportedProvider): number {
  if (provider === 'web-gemini') {
    return readPositiveIntegerEnv('WEB_GEMINI_TEST_TIMEOUT_MS') ?? 90_000
  }
  return 30_000
}

function normalizeProvider(payload: TestConnectionPayload): SupportedProvider {
  const provider = typeof payload.provider === 'string' ? payload.provider.trim().toLowerCase() : ''
  if (!provider) {
    if (typeof payload.baseUrl === 'string' && payload.baseUrl.trim()) return 'custom'
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数 provider' })
  }

  switch (provider) {
    case 'openrouter':
    case 'google':
    case 'anthropic':
    case 'openai':
    case 'openai-compatible':
    case 'gemini-compatible':
    case 'flow2api':
    case 'web-gemini':
    case 'bailian':
    case 'grsai':
    case 'siliconflow':
    case 'custom':
      return provider
    default:
      throw new ApiError('INVALID_PARAMS', { message: `不支持的渠道: ${provider}` })
  }
}

function requireApiKey(payload: TestConnectionPayload): string {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  if (!apiKey) {
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数 apiKey' })
  }
  return apiKey
}

function requireBaseUrl(payload: TestConnectionPayload): string {
  const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : ''
  if (!baseUrl) {
    throw new ApiError('INVALID_PARAMS', { message: '自定义渠道需要提供 baseUrl' })
  }
  return baseUrl
}

async function testGoogleAI(apiKey: string): Promise<void> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET' },
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI 认证失败: ${error}`)
  }
}

async function testOpenAICompatibleConnection(params: {
  apiKey: string
  baseURL?: string
  model?: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
}): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    timeout: params.timeoutMs ?? 30_000,
    defaultHeaders: params.defaultHeaders,
  })

  if (params.model) {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
      max_tokens: 10,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    return {
      model: response.model || params.model,
      answer,
    }
  }

  await client.models.list()
  return {}
}

async function testBailianProbe(apiKey: string): Promise<{ model?: string }> {
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bailian probe failed (${response.status}): ${error}`)
  }
  const data = await response.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(data.data) ? data.data.find((item) => typeof item.id === 'string')?.id : undefined
  return { model: firstModel }
}

async function testSiliconFlowProbe(apiKey: string): Promise<{ model?: string; answer?: string }> {
  const modelsResponse = await fetch('https://api.siliconflow.cn/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!modelsResponse.ok) {
    const error = await modelsResponse.text()
    throw new Error(`SiliconFlow models probe failed (${modelsResponse.status}): ${error}`)
  }

  const modelData = await modelsResponse.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(modelData.data) ? modelData.data.find((item) => typeof item.id === 'string')?.id : undefined

  const userInfoResponse = await fetch('https://api.siliconflow.cn/v1/user/info', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!userInfoResponse.ok) {
    const error = await userInfoResponse.text()
    throw new Error(`SiliconFlow user info probe failed (${userInfoResponse.status}): ${error}`)
  }
  const info = await userInfoResponse.json() as { balance?: unknown; data?: { balance?: unknown } }
  const rawBalance = info.balance ?? info.data?.balance
  const balance = typeof rawBalance === 'number'
    ? String(rawBalance)
    : typeof rawBalance === 'string' && rawBalance.trim()
      ? rawBalance.trim()
      : undefined

  return {
    model: firstModel,
    answer: typeof balance === 'string' ? `balance=${balance}` : 'userinfo_ok',
  }
}

export async function testLlmConnection(payload: TestConnectionPayload): Promise<LlmConnectionTestResult> {
  const provider = normalizeProvider(payload)
  const apiKey = requireApiKey(payload)
  const requestedModel = typeof payload.model === 'string' ? payload.model.trim() : ''

  switch (provider) {
    case 'openrouter': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'openrouter 连接成功', ...tested }
    }
    case 'google':
      await testGoogleAI(apiKey)
      return { provider, message: 'google 连接成功' }
    case 'anthropic': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: 'https://api.anthropic.com/v1',
        model: requestedModel || 'claude-3-haiku-20240307',
        defaultHeaders: { 'anthropic-version': '2023-06-01' },
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'anthropic 连接成功', ...tested }
    }
    case 'openai': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'openai 连接成功', ...tested }
    }
    case 'bailian': {
      const tested = await testBailianProbe(apiKey)
      return { provider, message: 'bailian 连接成功', ...tested }
    }
    case 'grsai': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: 'https://grsai.dakka.com.cn/v1',
        model: requestedModel || 'gemini-3.1-pro',
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'grsai 连接成功', ...tested }
    }
    case 'siliconflow': {
      const tested = await testSiliconFlowProbe(apiKey)
      return { provider, message: 'siliconflow 连接成功', ...tested }
    }
    case 'openai-compatible': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: requireBaseUrl(payload),
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'openai-compatible 连接成功', ...tested }
    }
    case 'gemini-compatible': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: requireBaseUrl(payload),
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'gemini-compatible 连接成功', ...tested }
    }
    case 'flow2api': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: resolveFlow2ApiRuntimeBaseUrl('flow2api', requireBaseUrl(payload)),
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'flow2api 连接成功', ...tested }
    }
    case 'web-gemini': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: resolveWebGeminiRuntimeBaseUrl('web-gemini', requireBaseUrl(payload)),
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'web-gemini 连接成功', ...tested }
    }
    case 'custom': {
      const tested = await testOpenAICompatibleConnection({
        apiKey,
        baseURL: requireBaseUrl(payload),
        model: requestedModel || undefined,
        timeoutMs: getProviderConnectionTimeoutMs(provider),
      })
      return { provider, message: 'custom 连接成功', ...tested }
    }
  }
}
