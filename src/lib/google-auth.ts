import { GoogleGenAI } from '@google/genai'

export function createGoogleGenAIClient(apiKey?: string | null): GoogleGenAI {
  const vertexProject = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  const vertexLocation = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'

  if (vertexProject) {
    return new GoogleGenAI({
      vertexai: true,
      project: vertexProject,
      location: vertexLocation,
    })
  }

  const normalizedApiKey = apiKey?.trim()
  if (!normalizedApiKey) {
    throw new Error('Please configure Google AI API Key')
  }

  return new GoogleGenAI({ apiKey: normalizedApiKey })
}
