import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { toFetchableUrl } from '@/lib/storage/utils'
import { ensureGrsaiCatalogRegistered } from './catalog'
import type { GrsaiGenerateRequestOptions } from './types'

export interface GrsaiImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: GrsaiGenerateRequestOptions
}

interface GrsaiSubmitBody {
  model: string
  prompt: string
  aspectRatio?: string
  imageSize?: string
  urls?: string[]
  webHook: '-1'
  shutProgress?: boolean
}

interface GrsaiSubmitResponse {
  code?: number
  msg?: string
  data?: {
    id?: string
  }
}

const GRSAI_SUBMIT_ENDPOINT = 'https://grsai.dakka.com.cn/v1/draw/nano-banana'
const GRSAI_BASE_ASPECT_RATIOS = new Set(['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'])
const GRSAI_EXTENDED_ASPECT_RATIO_MODELS = new Set(['nano-banana-2', 'nano-banana-2-cl', 'nano-banana-2-4k-cl'])
const GRSAI_IMAGE_SIZE_MODELS = new Set([
  'nano-banana-2',
  'nano-banana-2-cl',
  'nano-banana-2-4k-cl',
  'nano-banana-pro',
  'nano-banana-pro-vt',
  'nano-banana-pro-cl',
  'nano-banana-pro-vip',
  'nano-banana-pro-4k-vip',
])
const GRSAI_MODEL_IMAGE_SIZE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'nano-banana-2': ['1K', '2K', '4K'],
  'nano-banana-2-cl': ['1K', '2K'],
  'nano-banana-2-4k-cl': ['4K'],
  'nano-banana-pro': ['1K', '2K', '4K'],
  'nano-banana-pro-vt': ['1K', '2K', '4K'],
  'nano-banana-pro-cl': ['1K', '2K', '4K'],
  'nano-banana-pro-vip': ['1K', '2K'],
  'nano-banana-pro-4k-vip': ['4K'],
}

function assertRegistered(modelId: string): void {
  ensureGrsaiCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'grsai',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeImageSize(value: unknown): string | undefined {
  const raw = readTrimmedString(value)
  if (!raw) return undefined
  return raw.toUpperCase()
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function assertNoUnsupportedOptions(options: GrsaiGenerateRequestOptions): void {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'referenceImages',
    'aspectRatio',
    'resolution',
    'imageSize',
    'shutProgress',
    'size',
    'outputFormat',
    'keepOriginalAspectRatio',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`GRSAI_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function resolveAllowedAspectRatios(modelId: string): Set<string> {
  const ratios = new Set(GRSAI_BASE_ASPECT_RATIOS)
  if (GRSAI_EXTENDED_ASPECT_RATIO_MODELS.has(modelId)) {
    ratios.add('1:4')
    ratios.add('4:1')
    ratios.add('1:8')
    ratios.add('8:1')
  }
  return ratios
}

function buildSubmitBody(params: GrsaiImageGenerateParams): GrsaiSubmitBody {
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('GRSAI_IMAGE_MODEL_ID_REQUIRED')
  }

  const prompt = readTrimmedString(params.prompt)
  if (!prompt) {
    throw new Error('GRSAI_IMAGE_PROMPT_REQUIRED')
  }

  const aspectRatio = readTrimmedString(params.options.aspectRatio)
  if (aspectRatio) {
    const allowedAspectRatios = resolveAllowedAspectRatios(modelId)
    if (!allowedAspectRatios.has(aspectRatio)) {
      throw new Error(`GRSAI_IMAGE_ASPECT_RATIO_UNSUPPORTED: ${modelId}/${aspectRatio}`)
    }
  }

  const imageSize = normalizeImageSize(params.options.imageSize ?? params.options.resolution)
  if (imageSize) {
    if (!GRSAI_IMAGE_SIZE_MODELS.has(modelId)) {
      throw new Error(`GRSAI_IMAGE_SIZE_UNSUPPORTED_FOR_MODEL: ${modelId}`)
    }
    const allowedImageSizes = GRSAI_MODEL_IMAGE_SIZE_OPTIONS[modelId] || []
    if (!allowedImageSizes.includes(imageSize)) {
      throw new Error(`GRSAI_IMAGE_SIZE_INVALID: ${modelId}/${imageSize}`)
    }
  }

  const urls = Array.isArray(params.referenceImages)
    ? params.referenceImages
      .map((value) => readTrimmedString(value))
      .filter(Boolean)
      .map((value) => value.startsWith('http://') || value.startsWith('https://') ? toFetchableUrl(value) : value)
    : []

  const body: GrsaiSubmitBody = {
    model: modelId,
    prompt,
    webHook: '-1',
  }
  if (aspectRatio) {
    body.aspectRatio = aspectRatio
  }
  if (imageSize) {
    body.imageSize = imageSize
  }
  if (urls.length > 0) {
    body.urls = urls
  }
  const shutProgress = readOptionalBoolean(params.options.shutProgress)
  if (typeof shutProgress === 'boolean') {
    body.shutProgress = shutProgress
  }

  return body
}

async function parseSubmitResponse(response: Response): Promise<GrsaiSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('GRSAI_IMAGE_RESPONSE_INVALID')
    }
    return parsed as GrsaiSubmitResponse
  } catch {
    throw new Error('GRSAI_IMAGE_RESPONSE_INVALID_JSON')
  }
}

export async function generateGrsaiImage(params: GrsaiImageGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  assertNoUnsupportedOptions(params.options)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const body = buildSubmitBody(params)
  const response = await fetch(GRSAI_SUBMIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await parseSubmitResponse(response)

  if (!response.ok) {
    throw new Error(`GRSAI_IMAGE_SUBMIT_FAILED(${response.status}): ${readTrimmedString(data.msg) || 'unknown error'}`)
  }

  if (typeof data.code === 'number' && data.code !== 0) {
    throw new Error(`GRSAI_IMAGE_SUBMIT_FAILED(${data.code}): ${readTrimmedString(data.msg) || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.data?.id)
  if (!taskId) {
    throw new Error('GRSAI_IMAGE_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `GRSAI:IMAGE:${taskId}`,
  }
}
