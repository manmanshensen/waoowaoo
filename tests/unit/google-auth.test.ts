import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const googleGenAIState = vi.hoisted(() => ({
  ctor: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    constructor(config: unknown) {
      googleGenAIState.ctor(config)
    }
  },
}))

import { createGoogleGenAIClient } from '@/lib/google-auth'

describe('createGoogleGenAIClient', () => {
  const originalVertexProject = process.env.GOOGLE_VERTEX_PROJECT
  const originalVertexLocation = process.env.GOOGLE_VERTEX_LOCATION

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GOOGLE_VERTEX_PROJECT
    delete process.env.GOOGLE_VERTEX_LOCATION
  })

  afterEach(() => {
    if (originalVertexProject === undefined) {
      delete process.env.GOOGLE_VERTEX_PROJECT
    } else {
      process.env.GOOGLE_VERTEX_PROJECT = originalVertexProject
    }

    if (originalVertexLocation === undefined) {
      delete process.env.GOOGLE_VERTEX_LOCATION
    } else {
      process.env.GOOGLE_VERTEX_LOCATION = originalVertexLocation
    }
  })

  it('uses apiKey mode by default', () => {
    createGoogleGenAIClient('google-key')

    expect(googleGenAIState.ctor).toHaveBeenCalledWith({ apiKey: 'google-key' })
  })

  it('uses vertex mode when project env is configured', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'vertex-project'
    process.env.GOOGLE_VERTEX_LOCATION = 'asia-east1'

    createGoogleGenAIClient('')

    expect(googleGenAIState.ctor).toHaveBeenCalledWith({
      vertexai: true,
      project: 'vertex-project',
      location: 'asia-east1',
    })
  })
})
