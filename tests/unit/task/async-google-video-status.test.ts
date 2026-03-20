import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const googleState = vi.hoisted(() => ({
  getVideosOperation: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/google-auth', () => ({
  createGoogleGenAIClient: (...args: unknown[]) => googleState.createClient(...args),
}))

vi.mock('@google/genai', () => ({
  GenerateVideosOperation: class GenerateVideosOperation {
    name = ''
  },
}))

import { queryGoogleVideoStatus } from '@/lib/async-task-utils'

describe('queryGoogleVideoStatus', () => {
  const originalVertexProject = process.env.GOOGLE_VERTEX_PROJECT

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GOOGLE_VERTEX_PROJECT
    googleState.createClient.mockReturnValue({
      operations: {
        getVideosOperation: googleState.getVideosOperation,
      },
    })
  })

  afterEach(() => {
    if (originalVertexProject === undefined) {
      delete process.env.GOOGLE_VERTEX_PROJECT
    } else {
      process.env.GOOGLE_VERTEX_PROJECT = originalVertexProject
    }
  })

  it('returns a data url when veo response contains videoBytes', async () => {
    googleState.getVideosOperation.mockResolvedValueOnce({
      done: true,
      response: {
        generatedVideos: [
          {
            video: {
              videoAttributes: {
                mimeType: 'video/mp4',
                videoBytes: 'QUJDRA==',
              },
            },
          },
        ],
      },
    })

    const result = await queryGoogleVideoStatus('operations/veo-1', 'google-key')

    expect(result).toEqual({
      status: 'completed',
      videoUrl: 'data:video/mp4;base64,QUJDRA==',
    })
    expect(googleState.createClient).toHaveBeenCalledWith('google-key')
  })

  it('allows vertex mode without apiKey', async () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'vertex-project'
    googleState.getVideosOperation.mockResolvedValueOnce({
      done: false,
    })

    const result = await queryGoogleVideoStatus('operations/veo-vertex', '')

    expect(result).toEqual({ status: 'pending' })
    expect(googleState.createClient).toHaveBeenCalledWith('')
  })
})
