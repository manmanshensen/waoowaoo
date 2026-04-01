import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'grsai',
    apiKey: 'grs-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(async () => []),
}))

vi.mock('@/lib/async-submit', () => ({
  queryFalStatus: vi.fn(),
}))

vi.mock('@/lib/async-task-utils', () => ({
  queryGeminiBatchStatus: vi.fn(),
  queryGoogleVideoStatus: vi.fn(),
  querySeedanceVideoStatus: vi.fn(),
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll grsai task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns pending when task is running', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 0,
        msg: 'success',
        data: {
          status: 'running',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('GRSAI:IMAGE:task-running', 'user-1')

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'grsai')
    expect(result).toEqual({ status: 'pending' })
  })

  it('returns completed with image url when task succeeded', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 0,
        msg: 'success',
        data: {
          status: 'succeeded',
          results: [
            { url: 'https://image.example/result.png' },
          ],
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('GRSAI:IMAGE:task-success', 'user-1')

    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://image.example/result.png',
      imageUrl: 'https://image.example/result.png',
    })
  })
})
