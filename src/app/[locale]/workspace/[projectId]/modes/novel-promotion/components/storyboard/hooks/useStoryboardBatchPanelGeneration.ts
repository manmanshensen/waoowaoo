'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { StoryboardPanel } from './useStoryboardState'
import { getErrorMessage } from './storyboard-panel-asset-utils'

interface UseStoryboardBatchPanelGenerationProps {
  sortedStoryboards: NovelPromotionStoryboard[]
  submittingPanelImageIds: Set<string>
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  regeneratePanelImage: (panelId: string, count?: number, force?: boolean) => Promise<void>
  regeneratePanelGroupImages: (panelIds: string[]) => Promise<void>
  setIsEpisodeBatchSubmitting: (value: boolean) => void
}

function buildPendingPanelGroups(input: {
  sortedStoryboards: NovelPromotionStoryboard[]
  submittingPanelImageIds: Set<string>
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
}): string[][] {
  const groups: string[][] = []

  for (const storyboard of input.sortedStoryboards) {
    let currentGroup: StoryboardPanel[] = []
    const panels = input.getTextPanels(storyboard)

    const flushGroup = () => {
      if (currentGroup.length === 0) return
      for (let index = 0; index < currentGroup.length; index += 9) {
        groups.push(currentGroup.slice(index, index + 9).map((panel) => panel.id))
      }
      currentGroup = []
    }

    for (const panel of panels) {
      const isTaskRunning =
        Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning) || input.submittingPanelImageIds.has(panel.id)
      const isPending = !panel.imageUrl && !isTaskRunning
      if (!isPending) {
        flushGroup()
        continue
      }
      currentGroup.push(panel)
    }

    flushGroup()
  }

  return groups
}

export function useStoryboardBatchPanelGeneration({
  sortedStoryboards,
  submittingPanelImageIds,
  getTextPanels,
  regeneratePanelImage,
  regeneratePanelGroupImages,
  setIsEpisodeBatchSubmitting,
}: UseStoryboardBatchPanelGenerationProps) {
  const t = useTranslations('storyboard')
  const runningCount = useMemo(() => {
    return sortedStoryboards.reduce((count, storyboard) => {
      const panels = getTextPanels(storyboard)
      return count + panels.filter((panel) => panel.imageTaskRunning || submittingPanelImageIds.has(panel.id)).length
    }, 0)
  }, [getTextPanels, sortedStoryboards, submittingPanelImageIds])

  const pendingPanelGroups = useMemo(() => buildPendingPanelGroups({
    sortedStoryboards,
    submittingPanelImageIds,
    getTextPanels,
  }), [getTextPanels, sortedStoryboards, submittingPanelImageIds])

  const pendingPanelCount = useMemo(() => {
    return sortedStoryboards.reduce((count, storyboard) => {
      const panels = getTextPanels(storyboard)
      return (
        count +
        panels.filter(
          (panel) => !panel.imageUrl && !panel.imageTaskRunning && !submittingPanelImageIds.has(panel.id),
        ).length
      )
    }, 0)
  }, [getTextPanels, sortedStoryboards, submittingPanelImageIds])

  const handleGenerateAllPanels = useCallback(async () => {
    setIsEpisodeBatchSubmitting(true)
    try {
      const panelsToGenerate: string[] = []
      sortedStoryboards.forEach((storyboard) => {
        const panels = getTextPanels(storyboard)
        panels.forEach((panel) => {
          const isTaskRunning =
            Boolean((panel as { imageTaskRunning?: boolean }).imageTaskRunning) ||
            submittingPanelImageIds.has(panel.id)
          if (!panel.imageUrl && !isTaskRunning) {
            panelsToGenerate.push(panel.id)
          }
        })
      })

      if (panelsToGenerate.length === 0) {
        _ulogInfo('[批量生成] 没有需要生成的分镜图片')
        return
      }

      _ulogInfo(`[批量生成] 开始生成 ${panelsToGenerate.length} 个分镜图片`)

      const concurrencyLimit = 10
      const results: Array<PromiseSettledResult<unknown>> = []
      for (let index = 0; index < panelsToGenerate.length; index += concurrencyLimit) {
        const batch = panelsToGenerate.slice(index, index + concurrencyLimit)
        const currentBatch = Math.floor(index / concurrencyLimit) + 1
        const totalBatches = Math.ceil(panelsToGenerate.length / concurrencyLimit)
        _ulogInfo(`[批量生成] 处理第 ${currentBatch}/${totalBatches} 批 (${batch.length} 个)`)

        const batchResults = await Promise.allSettled(
          batch.map((panelId) => regeneratePanelImage(panelId, 1)),
        )
        results.push(...batchResults)

        const completed = Math.min(index + concurrencyLimit, panelsToGenerate.length)
        _ulogInfo(`[批量生成] 已完成 ${completed}/${panelsToGenerate.length}`)
      }

      const succeeded = results.filter((result) => result.status === 'fulfilled').length
      const failed = results.filter((result) => result.status === 'rejected').length
      _ulogInfo(`[批量生成] 完成: 成功 ${succeeded}, 失败 ${failed}`)

      if (failed > 0) {
        const failedReasons = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason?.message || result.reason)
          .slice(0, 3)
          .join('; ')
        alert(
          t('messages.batchGenerateCompleted', {
            succeeded,
            failed,
            errors: failedReasons || t('common.none'),
          }),
        )
      } else if (succeeded > 0) {
        _ulogInfo(`[批量生成] 全部成功生成 ${succeeded} 个分镜图片`)
      }
    } catch (error: unknown) {
      _ulogError('[批量生成] 发生意外错误:', error)
      alert(
        t('messages.batchGenerateFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setIsEpisodeBatchSubmitting(false)
    }
  }, [getTextPanels, regeneratePanelImage, setIsEpisodeBatchSubmitting, sortedStoryboards, submittingPanelImageIds, t])

  const handleGeneratePanelGroups = useCallback(async () => {
    setIsEpisodeBatchSubmitting(true)
    try {
      if (pendingPanelGroups.length === 0) {
        _ulogInfo('[合并生成] 没有需要生成的分镜图片')
        return
      }

      for (let index = 0; index < pendingPanelGroups.length; index += 1) {
        const group = pendingPanelGroups[index]
        _ulogInfo(`[合并生成] 提交第 ${index + 1}/${pendingPanelGroups.length} 组 (${group.length} 个)`)
        await regeneratePanelGroupImages(group)
      }
    } catch (error: unknown) {
      _ulogError('[合并生成] 发生意外错误:', error)
      alert(
        t('messages.batchGenerateFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setIsEpisodeBatchSubmitting(false)
    }
  }, [pendingPanelGroups, regeneratePanelGroupImages, setIsEpisodeBatchSubmitting, t])

  return {
    runningCount,
    pendingPanelCount,
    pendingGroupCount: pendingPanelGroups.length,
    handleGenerateAllPanels,
    handleGeneratePanelGroups,
  }
}
