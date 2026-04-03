import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { resolveModelSelection } from '@/lib/api-config'

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const panelIds = uniqueStrings(body?.panelIds)
  if (panelIds.length === 0 || panelIds.length > 9) {
    throw new ApiError('INVALID_PARAMS', { code: 'INVALID_PANEL_GROUP_SIZE' })
  }

  const panels = await prisma.novelPromotionPanel.findMany({
    where: {
      id: { in: panelIds },
    },
    include: {
      storyboard: {
        select: {
          id: true,
          episode: {
            select: {
              novelPromotionProject: {
                select: {
                  projectId: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { panelIndex: 'asc' },
  })

  if (panels.length !== panelIds.length) {
    throw new ApiError('INVALID_PARAMS', { code: 'PANEL_NOT_FOUND' })
  }

  const storyboardId = panels[0]?.storyboardId
  const allSameStoryboard = panels.every((panel) => panel.storyboardId === storyboardId)
  const allSameProject = panels.every(
    (panel) => panel.storyboard.episode.novelPromotionProject.projectId === projectId,
  )
  const isContinuous = panels.every((panel, index) => {
    if (index === 0) return true
    return panel.panelIndex === panels[index - 1].panelIndex + 1
  })

  if (!allSameStoryboard || !allSameProject || !isContinuous) {
    throw new ApiError('INVALID_PARAMS', { code: 'INVALID_PANEL_GROUP' })
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  const imageModel = projectModelConfig.combinedStoryboardModel || projectModelConfig.storyboardModel
  const resolution = projectModelConfig.combinedStoryboardResolution || '4K'

  if (!imageModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_NOT_CONFIGURED',
    })
  }

  try {
    await resolveModelSelection(session.user.id, imageModel, 'image')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Combined storyboard image model is invalid'
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_INVALID',
      message,
    })
  }

  let generationOptions: Record<string, unknown> = {}
  try {
    generationOptions = await resolveProjectModelCapabilityGenerationOptions({
      projectId,
      userId: session.user.id,
      modelType: 'image',
      modelKey: imageModel,
      runtimeSelections: { resolution },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Combined storyboard image capability not configured'
    throw new ApiError('INVALID_PARAMS', {
      code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED',
      message,
    })
  }

  const payload = {
    panelIds,
    imageModel,
    resolution,
    generationOptions,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.IMAGE_PANEL_GROUP,
    targetType: 'NovelPromotionPanel',
    targetId: panels[0].id,
    payload,
    dedupeKey: `image_panel_group:${storyboardId}:${panelIds.join(',')}:${resolution}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL_GROUP, payload),
  })

  return NextResponse.json({
    ...result,
    panelIds,
  })
})
