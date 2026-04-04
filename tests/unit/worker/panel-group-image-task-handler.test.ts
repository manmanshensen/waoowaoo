import sharp from 'sharp'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findMany: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => await Promise.all(operations)),
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({
    storyboardModel: 'storyboard-model-1',
    combinedStoryboardModel: 'storyboard-group-model-1',
    combinedStoryboardResolution: '4K',
    combinedStoryboard1x1Model: 'storyboard-group-model-1x1',
    combinedStoryboard2x2Model: 'storyboard-group-model-2x2',
    combinedStoryboard3x3Model: 'storyboard-group-model-3x3',
    combinedStoryboard1x1Resolution: '1K',
    combinedStoryboard2x2Resolution: '2K',
    combinedStoryboard3x3Resolution: '4K',
    artStyle: 'realistic',
  })),
  resolveImageSourceFromGeneration: vi.fn(),
  uploadImageSourceToCos: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  collectPanelReferenceImages: vi.fn(async () => ['https://signed.example/ref-1.png']),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '9:16',
    characters: [],
    locations: [],
  })),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async () => ['normalized-ref-1']),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn(() => 'panel-group-prompt'),
  PROMPT_IDS: { NP_STORYBOARD_PANEL_GROUP_IMAGE: 'np_storyboard_panel_group_image' },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    collectPanelReferenceImages: sharedMock.collectPanelReferenceImages,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})
vi.mock('@/lib/prompt-i18n', () => promptMock)
vi.mock('@/lib/storage', () => ({ toFetchableUrl: vi.fn((value: string) => value) }))
vi.mock('@/lib/constants', () => ({ getArtStylePrompt: vi.fn(() => 'realistic style') }))

import { OutboundImageNormalizeError } from '@/lib/media/outbound-image'
import { handlePanelGroupImageTask } from '@/lib/workers/handlers/panel-group-image-task-handler'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-panel-group-1',
      type: TASK_TYPE.IMAGE_PANEL_GROUP,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker panel-group-image-task-handler behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    prismaMock.novelPromotionPanel.findMany.mockResolvedValue([
      {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: 1,
        storyboardId: 'storyboard-1',
        shotType: 'wide',
        cameraMove: 'static',
        description: 'panel 1',
        srtSegment: 'one',
        location: 'Room',
        characters: '[]',
        imagePrompt: '',
        videoPrompt: '',
        imageUrl: null,
      },
      {
        id: 'panel-2',
        panelIndex: 1,
        panelNumber: 2,
        storyboardId: 'storyboard-1',
        shotType: 'close-up',
        cameraMove: 'push',
        description: 'panel 2',
        srtSegment: 'two',
        location: 'Room',
        characters: '[]',
        imagePrompt: '',
        videoPrompt: '',
        imageUrl: 'cos/old-panel-2.png',
      },
    ])

    const combinedBuffer = await sharp({
      create: {
        width: 1200,
        height: 1600,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValue(
      `data:image/png;base64,${combinedBuffer.toString('base64')}`,
    )
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('cos/panel-group-1.png')
      .mockResolvedValueOnce('cos/panel-group-2.png')
  })

  it('splits combined image and persists every panel result', async () => {
    const result = await handlePanelGroupImageTask(buildJob({
      panelIds: ['panel-1', 'panel-2'],
      imageModel: 'storyboard-group-model-1',
      resolution: '4K',
    }))

    expect(result).toEqual({
      panelIds: ['panel-1', 'panel-2'],
      imageUrls: ['cos/panel-group-1.png', 'cos/panel-group-2.png'],
      resolution: '4K',
      layout: '2x1',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-group-model-1',
        options: expect.objectContaining({
          resolution: '4K',
          aspectRatio: '9:8',
        }),
      }),
    )

    expect(prismaMock.novelPromotionPanel.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'panel-1' },
      data: {
        imageUrl: 'cos/panel-group-1.png',
        candidateImages: null,
      },
    })
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'panel-2' },
      data: {
        previousImageUrl: 'cos/old-panel-2.png',
        imageUrl: 'cos/panel-group-2.png',
        candidateImages: null,
      },
    })
  })

  it('normalizes unsupported aspect ratio for grsai panel-group models', async () => {
    await handlePanelGroupImageTask(buildJob({
      panelIds: ['panel-1', 'panel-2'],
      imageModel: 'grsai::nano-banana-2-4k-cl',
      resolution: '4K',
    }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'grsai::nano-banana-2-4k-cl',
        options: expect.objectContaining({
          resolution: '4K',
          aspectRatio: '5:4',
        }),
      }),
    )
  })

  it('continues without references when every reference image fails normalization', async () => {
    outboundMock.normalizeReferenceImagesForGeneration.mockRejectedValueOnce(
      new OutboundImageNormalizeError({
        code: 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED',
        stage: 'normalize_reference',
        input: 'candidates=2',
        message: 'all reference images failed to normalize',
      }),
    )

    await handlePanelGroupImageTask(buildJob({
      panelIds: ['panel-1', 'panel-2'],
      imageModel: 'storyboard-group-model-1',
      resolution: '4K',
    }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          referenceImages: [],
        }),
      }),
    )
  })
})
