import { registerOfficialModel } from '@/lib/providers/official/model-registry'
import type { OfficialModelModality } from '@/lib/providers/official/model-registry'

const GRSAI_CATALOG: Readonly<Record<OfficialModelModality, readonly string[]>> = {
  llm: [
    'nano-banana-fast',
    'nano-banana',
    'gemini-3.1-pro',
    'gemini-3-pro',
    'gemini-2.5-pro',
  ],
  image: [
    'nano-banana-2',
    'nano-banana-2-cl',
    'nano-banana-2-4k-cl',
    'nano-banana-fast',
    'nano-banana',
    'nano-banana-pro',
    'nano-banana-pro-vt',
    'nano-banana-pro-cl',
    'nano-banana-pro-vip',
    'nano-banana-pro-4k-vip',
  ],
  video: [],
  audio: [],
}

let initialized = false

export function ensureGrsaiCatalogRegistered(): void {
  if (initialized) return
  initialized = true
  for (const modality of Object.keys(GRSAI_CATALOG) as OfficialModelModality[]) {
    for (const modelId of GRSAI_CATALOG[modality]) {
      registerOfficialModel({ provider: 'grsai', modality, modelId })
    }
  }
}

export function listGrsaiCatalogModels(modality: OfficialModelModality): readonly string[] {
  ensureGrsaiCatalogRegistered()
  return GRSAI_CATALOG[modality]
}
