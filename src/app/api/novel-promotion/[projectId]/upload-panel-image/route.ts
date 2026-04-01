import sharp from 'sharp'
import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'

/**
 * POST /api/novel-promotion/[projectId]/upload-panel-image
 * 上传用户自定义分镜图到指定 panel，替代 AI 生成结果。
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

  if (!file.type.startsWith('image/')) {
    throw new ApiError('INVALID_PARAMS', { message: 'Only image files are supported' })
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
      imageUrl: true,
      imageMediaId: true,
    },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  const sourceBuffer = Buffer.from(await file.arrayBuffer())
  const normalized = sharp(sourceBuffer).rotate()
  const metadata = await normalized.metadata()
  const processed = await normalized.jpeg({ quality: 92, mozjpeg: true }).toBuffer()

  const key = generateUniqueKey(`storyboard-panel-${panel.id}-upload`, 'jpg')

  await uploadObject(processed, key)

  const media = await ensureMediaObjectFromStorageKey(key, {
    mimeType: 'image/jpeg',
    sizeBytes: processed.length,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  })

  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      previousImageUrl: panel.imageUrl || null,
      previousImageMediaId: panel.imageMediaId || null,
      imageUrl: key,
      imageMediaId: media.id,
      candidateImages: null,
    },
  })

  return NextResponse.json({
    success: true,
    panelId: panel.id,
    imageUrl: media.url,
    media,
  })
})
