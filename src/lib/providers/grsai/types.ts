export type GrsaiProviderKey = 'grsai'

export interface GrsaiGenerateRequestOptions {
  provider: string
  modelId: string
  modelKey: string
  [key: string]: unknown
}

export interface GrsaiLlmMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface GrsaiProbeStep {
  name: 'models' | 'credits'
  status: 'pass' | 'fail' | 'skip'
  message: string
  detail?: string
}

export interface GrsaiProbeResult {
  success: boolean
  steps: GrsaiProbeStep[]
}
