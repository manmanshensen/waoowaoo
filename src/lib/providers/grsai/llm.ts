import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureGrsaiCatalogRegistered } from './catalog'
import type { GrsaiLlmMessage } from './types'

export interface GrsaiLlmCompletionParams {
  modelId: string
  messages: GrsaiLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  ensureGrsaiCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'grsai',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeGrsaiLlm(
  params: GrsaiLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)
  const baseURL = typeof params.baseUrl === 'string' && params.baseUrl.trim()
    ? params.baseUrl.trim().replace(/\/$/, '').replace(/\/v1$/i, '/v1')
    : 'https://grsai.dakka.com.cn/v1'
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL,
    timeout: 30_000,
  })
  const completion = await client.chat.completions.create({
    model: params.modelId,
    messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: params.temperature ?? 0.7,
  })
  return completion as OpenAI.Chat.Completions.ChatCompletion
}
