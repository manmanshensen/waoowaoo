import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'grsai',
    apiKey: 'grs-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { generateGrsaiImage } from '@/lib/providers/grsai/image'

describe('grsai image provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits nano banana draw task and returns async external id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 0,
        msg: 'success',
        data: {
          id: 'task-123',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateGrsaiImage({
      userId: 'user-1',
      prompt: 'a cat playing on grass',
      referenceImages: ['https://example.com/reference.png'],
      options: {
        provider: 'grsai',
        modelId: 'nano-banana-fast',
        modelKey: 'grsai::nano-banana-fast',
        aspectRatio: '16:9',
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'grsai')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, requestInit] = firstCall as unknown as [string, RequestInit]
    expect(url).toBe('https://grsai.dakka.com.cn/v1/draw/nano-banana')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers).toEqual({
      Authorization: 'Bearer grs-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(requestInit.body))).toEqual({
      model: 'nano-banana-fast',
      prompt: 'a cat playing on grass',
      aspectRatio: '16:9',
      urls: ['https://example.com/reference.png'],
      webHook: '-1',
    })
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-123',
      externalId: 'GRSAI:IMAGE:task-123',
    })
  })

  it('rejects imageSize on unsupported models', async () => {
    await expect(generateGrsaiImage({
      userId: 'user-1',
      prompt: 'a cat playing on grass',
      options: {
        provider: 'grsai',
        modelId: 'nano-banana-fast',
        modelKey: 'grsai::nano-banana-fast',
        resolution: '2K',
      },
    })).rejects.toThrow('GRSAI_IMAGE_SIZE_UNSUPPORTED_FOR_MODEL: nano-banana-fast')
  })

  it('ignores pass-through referenceImages in options when building request', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 0,
        msg: 'success',
        data: {
          id: 'task-456',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateGrsaiImage({
      userId: 'user-1',
      prompt: 'a cat playing on grass',
      referenceImages: ['https://example.com/reference.png'],
      options: {
        provider: 'grsai',
        modelId: 'nano-banana-fast',
        modelKey: 'grsai::nano-banana-fast',
        referenceImages: ['https://example.com/reference.png'],
      },
    })

    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-456',
      externalId: 'GRSAI:IMAGE:task-456',
    })
  })
})
