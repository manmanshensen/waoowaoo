import sharp from 'sharp'
import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getArtStylePrompt } from '@/lib/constants'
import { createScopedLogger } from '@/lib/logging/core'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import { assertTaskActive, resolveImageSourceFromGeneration, uploadImageSourceToCos, getProjectModels } from '../utils'
import { OutboundImageNormalizeError, normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { collectPanelReferenceImages, findCharacterByName, parsePanelCharacterReferences, resolveNovelData } from './image-task-handler-shared'
import { toFetchableUrl } from '@/lib/storage'
import { getCombinedStoryboardConfigForPanelCount } from '@/lib/config-service'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function layoutForCount(count: number) {
  if (count <= 1) return { columns: 1, rows: 1 }
  if (count === 2) return { columns: 2, rows: 1 }
  if (count === 3) return { columns: 3, rows: 1 }
  if (count === 4) return { columns: 2, rows: 2 }
  if (count <= 6) return { columns: 3, rows: 2 }
  if (count <= 8) return { columns: 4, rows: 2 }
  return { columns: 3, rows: 3 }
}

function toAspectRatio(baseAspectRatio: string, columns: number, rows: number) {
  const [wRaw, hRaw] = baseAspectRatio.split(':').map(Number)
  const width = Math.max(1, (Number.isFinite(wRaw) ? wRaw : 1) * columns)
  const height = Math.max(1, (Number.isFinite(hRaw) ? hRaw : 1) * rows)
  const divisor = gcd(width, height)
  return `${Math.floor(width / divisor)}:${Math.floor(height / divisor)}`
}

function buildLayoutLabel(columns: number, rows: number) {
  return `${columns}x${rows}`
}

const GRSAI_BASE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const
const GRSAI_EXTENDED_ASPECT_RATIO_MODELS = new Set(['nano-banana-2', 'nano-banana-2-cl', 'nano-banana-2-4k-cl'])

function parseRatioValue(aspectRatio: string): number | null {
  const [widthRaw, heightRaw] = aspectRatio.split(':').map(Number)
  if (!Number.isFinite(widthRaw) || !Number.isFinite(heightRaw) || widthRaw <= 0 || heightRaw <= 0) {
    return null
  }
  return widthRaw / heightRaw
}

function extractProviderAndModelId(modelKey: string): { provider: string | null; modelId: string } {
  const trimmed = modelKey.trim()
  const separatorIndex = trimmed.indexOf('::')
  if (separatorIndex === -1) return { provider: null, modelId: trimmed }
  return {
    provider: trimmed.slice(0, separatorIndex),
    modelId: trimmed.slice(separatorIndex + 2),
  }
}

function resolveSupportedAspectRatios(modelKey: string): string[] | null {
  const { provider, modelId } = extractProviderAndModelId(modelKey)
  if (provider !== 'grsai') return null

  const supported: string[] = [...GRSAI_BASE_ASPECT_RATIOS]
  if (GRSAI_EXTENDED_ASPECT_RATIO_MODELS.has(modelId)) {
    supported.push('1:4', '4:1', '1:8', '8:1')
  }
  return supported
}

function chooseClosestAspectRatio(targetAspectRatio: string, supportedAspectRatios: readonly string[]): string {
  const targetValue = parseRatioValue(targetAspectRatio)
  if (targetValue === null) return targetAspectRatio

  let bestRatio = targetAspectRatio
  let bestDistance = Number.POSITIVE_INFINITY

  for (const supportedRatio of supportedAspectRatios) {
    const supportedValue = parseRatioValue(supportedRatio)
    if (supportedValue === null) continue
    const distance = Math.abs(supportedValue - targetValue)
    if (distance < bestDistance) {
      bestRatio = supportedRatio
      bestDistance = distance
      continue
    }
    if (distance === bestDistance && supportedValue >= 1 && parseRatioValue(bestRatio) !== null && (parseRatioValue(bestRatio) || 0) < 1) {
      bestRatio = supportedRatio
    }
  }

  return bestRatio
}

function normalizeAspectRatioForModel(modelKey: string, rawAspectRatio: string): string {
  const supportedAspectRatios = resolveSupportedAspectRatios(modelKey)
  if (!supportedAspectRatios || supportedAspectRatios.includes(rawAspectRatio)) {
    return rawAspectRatio
  }
  return chooseClosestAspectRatio(rawAspectRatio, supportedAspectRatios)
}

function normalizePanelCharacters(raw: string | null | undefined, projectData: Awaited<ReturnType<typeof resolveNovelData>>) {
  return parsePanelCharacterReferences(raw).map((reference) => {
    const character = findCharacterByName(projectData.characters || [], reference.name)
    return {
      name: reference.name,
      appearance: reference.appearance || null,
      slot: reference.slot || null,
      matchedCharacter: character?.name || null,
    }
  })
}

async function sourceToBuffer(source: string): Promise<Buffer> {
  if (source.startsWith('data:')) {
    const base64 = source.split(',')[1] || ''
    return Buffer.from(base64, 'base64')
  }
  const response = await fetch(toFetchableUrl(source))
  if (!response.ok) {
    throw new Error(`Failed to download combined image: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function handlePanelGroupImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const panelIds = Array.isArray(payload.panelIds)
    ? payload.panelIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  if (panelIds.length === 0) throw new Error('panelIds missing')

  const panels = await prisma.novelPromotionPanel.findMany({
    where: { id: { in: panelIds } },
    orderBy: { panelIndex: 'asc' },
  })
  if (panels.length !== panelIds.length) throw new Error('Panels not found')

  const projectData = await resolveNovelData(job.data.projectId)
  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const combinedConfig = getCombinedStoryboardConfigForPanelCount(modelConfig, panels.length)
  const modelKey = typeof payload.imageModel === 'string' && payload.imageModel.trim()
    ? payload.imageModel
    : combinedConfig.model
  if (!modelKey) throw new Error('Combined storyboard model not configured')
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')

  const resolution = typeof payload.resolution === 'string' && payload.resolution.trim()
    ? payload.resolution
    : combinedConfig.resolution
  const layout = layoutForCount(panels.length)
  const layoutLabel = buildLayoutLabel(layout.columns, layout.rows)
  const rawAspectRatio = toAspectRatio(projectData.videoRatio, layout.columns, layout.rows)
  const aspectRatio = normalizeAspectRatioForModel(modelKey, rawAspectRatio)
  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)

  const promptPayload = {
    layout: layoutLabel,
    panels: panels.map((panel, index) => ({
      order: index + 1,
      panel_id: panel.id,
      panel_number: panel.panelNumber,
      shot_type: panel.shotType || '',
      camera_move: panel.cameraMove || '',
      description: panel.description || '',
      source_text: panel.srtSegment || '',
      location: panel.location || '',
      characters: normalizePanelCharacters(panel.characters, projectData),
      image_prompt: panel.imagePrompt || '',
      video_prompt: panel.videoPrompt || '',
    })),
  }

  const prompt = buildPrompt({
    promptId: PROMPT_IDS.NP_STORYBOARD_PANEL_GROUP_IMAGE,
    locale: job.data.locale,
    variables: {
      panel_group_json_input: JSON.stringify(promptPayload, null, 2),
      aspect_ratio: projectData.videoRatio,
      style: artStyle || 'Match the reference image style',
      layout: layoutLabel,
    },
  })

  const logger = createScopedLogger({
    module: 'worker.panel-group-image',
    action: 'panel_group_image_generate',
    requestId: job.data.trace?.requestId || undefined,
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })
  logger.info({
    message: 'panel group image generation started',
    details: {
      panelCount: panels.length,
      layout: layoutLabel,
      resolution,
      aspectRatio,
      rawAspectRatio,
      modelKey,
    },
  })

  const referenceImages = await Promise.all(
    panels.map(async (panel) => await collectPanelReferenceImages(projectData, panel)),
  )

  let normalizedRefs: string[] = []
  try {
    normalizedRefs = await normalizeReferenceImagesForGeneration(referenceImages.flat(), {
      context: {
        taskId: job.data.taskId,
        projectId: job.data.projectId,
        panelIds,
        layout: layoutLabel,
      },
    })
  } catch (error) {
    if (
      error instanceof OutboundImageNormalizeError &&
      error.code === 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED'
    ) {
      logger.warn({
        message: 'panel group references unavailable, continuing without references',
        details: {
          panelCount: panels.length,
          layout: layoutLabel,
          panelIds,
        },
      })
    } else {
      throw error
    }
  }

  await reportTaskProgress(job, 20, { stage: 'generate_panel_group', panelCount: panels.length })

  const source = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: modelKey,
    prompt,
    options: {
      referenceImages: normalizedRefs,
      aspectRatio,
      resolution,
    },
    allowTaskExternalIdResume: true,
    pollProgress: { start: 30, end: 82 },
  })

  await assertTaskActive(job, 'split_panel_group')
  await reportTaskProgress(job, 86, { stage: 'split_panel_group', panelCount: panels.length })

  const sourceBuffer = await sourceToBuffer(source)
  const image = sharp(sourceBuffer)
  const metadata = await image.metadata()
  const width = metadata.width
  const height = metadata.height
  if (!width || !height) {
    throw new Error('Combined image metadata missing')
  }

  const cellWidth = Math.floor(width / layout.columns)
  const cellHeight = Math.floor(height / layout.rows)
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error('Combined image layout is invalid')
  }

  const uploadedKeys: string[] = []
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index]
    const column = index % layout.columns
    const row = Math.floor(index / layout.columns)
    const left = column * cellWidth
    const top = row * cellHeight
    const cropWidth = column === layout.columns - 1 ? width - left : cellWidth
    const cropHeight = row === layout.rows - 1 ? height - top : cellHeight
    const buffer = await sharp(sourceBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer()
    const key = await uploadImageSourceToCos(buffer, 'panel-group-split', panel.id)
    uploadedKeys.push(key)
  }

  await assertTaskActive(job, 'persist_panel_group')
  await prisma.$transaction(
    uploadedKeys.map((imageUrl, index) =>
      prisma.novelPromotionPanel.update({
        where: { id: panels[index].id },
        data: {
          ...(panels[index].imageUrl ? { previousImageUrl: panels[index].imageUrl } : {}),
          imageUrl,
          candidateImages: null,
        },
      })),
  )

  return {
    panelIds,
    imageUrls: uploadedKeys,
    resolution,
    layout: layoutLabel,
  }
}
