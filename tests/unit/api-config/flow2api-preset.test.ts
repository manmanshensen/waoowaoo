import { describe, expect, it } from 'vitest'
import { PRESET_MODELS, PRESET_PROVIDERS } from '@/app/[locale]/profile/components/api-config/types'

describe('api-config flow2api preset', () => {
  it('includes local flow2api preset provider with default baseUrl', () => {
    const provider = PRESET_PROVIDERS.find((entry) => entry.id === 'flow2api')
    expect(provider).toBeDefined()
    expect(provider?.baseUrl).toBe('http://localhost:38000/v1')
    expect(provider?.gatewayRoute).toBe('openai-compat')
  })

  it('includes default flow2api image preset model with compat template', () => {
    const model = PRESET_MODELS.find(
      (entry) => entry.provider === 'flow2api' && entry.modelId === 'gemini-3.1-flash-image-landscape',
    )

    expect(model).toBeDefined()
    expect(model?.type).toBe('image')
    expect(model?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/chat/completions',
      },
      response: {
        outputUrlPath: '$.choices[0].message.content',
      },
    })
  })

  it('includes web-gemini preset provider and default local baseUrl', () => {
    const provider = PRESET_PROVIDERS.find((entry) => entry.id === 'web-gemini')
    expect(provider).toBeDefined()
    expect(provider?.baseUrl).toBe('http://127.0.0.1:4000/v1')
    expect(provider?.gatewayRoute).toBe('openai-compat')
  })

  it('includes web-gemini preset chat and image models', () => {
    const llmModel = PRESET_MODELS.find(
      (entry) => entry.provider === 'web-gemini' && entry.modelId === 'gemini-web-proxy',
    )
    const imageModel = PRESET_MODELS.find(
      (entry) => entry.provider === 'web-gemini' && entry.modelId === 'gemini-image-web-proxy',
    )

    expect(llmModel).toMatchObject({
      type: 'llm',
      llmProtocol: 'chat-completions',
    })
    expect(imageModel).toMatchObject({
      type: 'image',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
      },
    })
  })
})
