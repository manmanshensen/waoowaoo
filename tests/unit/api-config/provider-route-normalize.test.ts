import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaState = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaState,
}))

vi.mock('@/lib/crypto-utils', () => ({
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))

import { getProviderConfig } from '@/lib/api-config'

describe('api config stored provider route normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes legacy web-gemini official route to openai-compat at read time', async () => {
    prismaState.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'web-gemini', name: 'Web Gemini', baseUrl: 'http://127.0.0.1:4000/v1', apiKey: 'enc:key', gatewayRoute: 'official' },
      ]),
      customModels: JSON.stringify([
        { provider: 'web-gemini', modelId: 'gemini-web-proxy', modelKey: 'web-gemini::gemini-web-proxy', name: 'Web Gemini Chat', type: 'llm' },
      ]),
    })

    const config = await getProviderConfig('user-1', 'web-gemini')

    expect(config.gatewayRoute).toBe('openai-compat')
  })

  it('normalizes gemini-compatible openai-official apiMode to gemini-sdk at read time', async () => {
    prismaState.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'gemini-compatible:gm-1', name: 'Gemini A', baseUrl: 'https://gm.example/v1', apiKey: 'enc:key', apiMode: 'openai-official', gatewayRoute: 'official' },
      ]),
      customModels: JSON.stringify([
        { provider: 'gemini-compatible:gm-1', modelId: 'gemini-2.5-pro', modelKey: 'gemini-compatible:gm-1::gemini-2.5-pro', name: 'Gemini 2.5 Pro', type: 'llm' },
      ]),
    })

    const config = await getProviderConfig('user-1', 'gemini-compatible:gm-1')

    expect(config.apiMode).toBe('gemini-sdk')
    expect(config.gatewayRoute).toBe('official')
  })
})
