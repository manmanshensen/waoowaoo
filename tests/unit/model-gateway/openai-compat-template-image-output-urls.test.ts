import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

import { generateImageViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-image'

describe('openai-compat template image output urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all image urls when outputUrlsPath contains multiple values', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { url: 'https://cdn.test/1.png' },
        { url: 'https://cdn.test/2.png' },
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/1.png',
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
  })

  it('keeps single-url output compatible when outputUrlsPath has only one image', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/only.png' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/only.png',
    })
  })

  it('extracts image url from markdown image content', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: '![Generated Image](https://cdn.test/markdown.png)',
          },
        },
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'flow2api',
      modelId: 'gemini-3.1-flash-image-landscape',
      modelKey: 'flow2api::gemini-3.1-flash-image-landscape',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/chat/completions',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: false,
          },
        },
        response: {
          outputUrlPath: '$.choices[0].message.content',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/markdown.png',
    })
  })
})
