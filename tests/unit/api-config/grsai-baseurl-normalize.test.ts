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

describe('api config grsai baseUrl normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes grsai root baseUrl to /v1', async () => {
    prismaState.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'grsai', name: 'GRSAI', baseUrl: 'https://grsai.dakka.com.cn', apiKey: 'enc:key' },
      ]),
      customModels: JSON.stringify([
        { provider: 'grsai', modelId: 'gemini-3.1-pro', modelKey: 'grsai::gemini-3.1-pro', name: 'Gemini 3.1 Pro', type: 'llm' },
      ]),
    })

    const config = await getProviderConfig('user-1', 'grsai')

    expect(config.baseUrl).toBe('https://grsai.dakka.com.cn/v1')
  })

  it('keeps grsai /v1 baseUrl unchanged', async () => {
    prismaState.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'grsai', name: 'GRSAI', baseUrl: 'https://grsai.dakka.com.cn/v1', apiKey: 'enc:key' },
      ]),
      customModels: JSON.stringify([
        { provider: 'grsai', modelId: 'gemini-3.1-pro', modelKey: 'grsai::gemini-3.1-pro', name: 'Gemini 3.1 Pro', type: 'llm' },
      ]),
    })

    const config = await getProviderConfig('user-1', 'grsai')

    expect(config.baseUrl).toBe('https://grsai.dakka.com.cn/v1')
  })
})
