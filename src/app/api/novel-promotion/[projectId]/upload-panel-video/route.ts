import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

/**
 * POST /api/novel-promotion/[projectId]/upload-panel-video
 * 上传用户自定义视频到指定 panel，替代 AI 生成视频。
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const file = formData.get('file')
  const panelId = formData.get('panelId')

  if (!(file instanceof File) || typeof panelId !== 'string' || !panelId.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  if (!file.type.startsWith('video/')) {
    throw new ApiError('INVALID_PARAMS', { message: 'Only video files are supported' })
  }

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: {
        episode: {
          novelPromotionProject: {
            projectId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4'
  const key = generateUniqueKey(`panel-video-upload-${panel.id}`, ext)

  await uploadObject(buffer, key, 3, file.type || 'video/mp4')

  const media = await ensureMediaObjectFromStorageKey(key, {
    mimeType: file.type || 'video/mp4',
    sizeBytes: buffer.length,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      videoUrl: key,
      videoMediaId: media.id,
      videoGenerationMode: 'normal',
      lipSyncVideoUrl: null,
      lipSyncVideoMediaId: null,
      lipSyncTaskId: null,
    },
  })

  return NextResponse.json({
    success: true,
    panelId: panel.id,
    videoUrl: media.url,
    media,
  })
})
