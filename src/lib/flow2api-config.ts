function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

export function resolveFlow2ApiRuntimeBaseUrl(providerId: string, configuredBaseUrl?: string): string | undefined {
  if (getProviderKey(providerId) !== 'flow2api') return configuredBaseUrl
  return readTrimmedEnv('FLOW2API_INTERNAL_BASE_URL') || configuredBaseUrl
}

export function resolveWebGeminiRuntimeBaseUrl(providerId: string, configuredBaseUrl?: string): string | undefined {
  if (getProviderKey(providerId) !== 'web-gemini') return configuredBaseUrl
  return readTrimmedEnv('WEB_GEMINI_INTERNAL_BASE_URL') || configuredBaseUrl
}
