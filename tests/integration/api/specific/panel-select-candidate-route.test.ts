import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionPanel: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}))

const storageMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn(() => 'https://signed.example/panel-c.png'),
  generateUniqueKey: vi.fn(() => 'generated/panel-c.png'),
  downloadAndUploadImage: vi.fn(async () => 'generated/panel-c.png'),
  toFetchableUrl: vi.fn((value: string) => value),
}))

const mediaServiceMock = vi.hoisted(() => ({
  resolveStorageKeyFromMediaValue: vi.fn(async (value: unknown) => {
    if (value === '/m/pub-c') return 'cos/panel-c.png'
    if (value === 'cos/panel-c.png') return 'cos/panel-c.png'
    if (value === 'uploads/panel-b.jpg') return 'uploads/panel-b.jpg'
    return null
  }),
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: `media:${storageKey}`,
    publicId: 'pub-c',
    url: '/m/pub-c',
    storageKey,
    mimeType: 'image/png',
    sizeBytes: 123,
    width: 1024,
    height: 1024,
    durationMs: null,
    sha256: null,
    updatedAt: '2026-04-07T00:00:00.000Z',
  })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)

describe('api specific - panel select candidate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      imageUrl: 'uploads/panel-b.jpg',
      imageMediaId: 'media-b',
      candidateImages: JSON.stringify(['cos/panel-c.png']),
      imageHistory: null,
    })
  })

  it('promotes the selected candidate to the main image and updates media refs', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/panel/select-candidate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/panel/select-candidate',
      method: 'POST',
      body: {
        panelId: 'panel-1',
        selectedImageUrl: '/m/pub-c',
        action: 'select',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    expect(mediaServiceMock.ensureMediaObjectFromStorageKey).toHaveBeenCalledWith('cos/panel-c.png')
    expect(storageMock.downloadAndUploadImage).not.toHaveBeenCalled()
    expect(prismaMock.novelPromotionPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        previousImageUrl: 'uploads/panel-b.jpg',
        previousImageMediaId: 'media-b',
        imageUrl: 'cos/panel-c.png',
        imageMediaId: 'media:cos/panel-c.png',
        imageHistory: expect.any(String),
        candidateImages: null,
      },
    })

    const updateArg = prismaMock.novelPromotionPanel.update.mock.calls[0]?.[0] as {
      data?: { imageHistory?: string }
    }
    expect(updateArg.data?.imageHistory).toContain('uploads/panel-b.jpg')

    const json = await res.json() as { imageUrl?: string; cosKey?: string }
    expect(json.imageUrl).toBe('https://signed.example/panel-c.png')
    expect(json.cosKey).toBe('cos/panel-c.png')
  })
})
