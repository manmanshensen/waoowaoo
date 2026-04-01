'use client'

import { useTranslations } from 'next-intl'
import { NovelPromotionClip } from '@/types/project'
import { AppIcon } from '@/components/ui/icons'

interface StoryboardGroupHeaderProps {
  clip: NovelPromotionClip | undefined
  sbIndex: number
  totalStoryboards: number
  movingClipId: string | null
  storyboardClipId: string
  formatClipTitle: (clip: NovelPromotionClip | undefined) => string
  onMoveUp: () => void
  onMoveDown: () => void
  onClearStoryboardVideoPrompts: () => void
}

export default function StoryboardGroupHeader({
  clip,
  sbIndex,
  totalStoryboards,
  movingClipId,
  storyboardClipId,
  formatClipTitle,
  onMoveUp,
  onMoveDown,
  onClearStoryboardVideoPrompts,
}: StoryboardGroupHeaderProps) {
  const t = useTranslations('storyboard')
  const handleConfirmClear = () => {
    if (!window.confirm(t('panelActions.confirmClearSegmentVideoPrompts'))) return
    onClearStoryboardVideoPrompts()
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col gap-1">
        <button
          onClick={onMoveUp}
          disabled={sbIndex === 0 || movingClipId === storyboardClipId}
          className={`rounded p-1 transition-colors ${sbIndex === 0 || movingClipId === storyboardClipId
            ? 'cursor-not-allowed text-[var(--glass-text-tertiary)]'
            : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-tone-info-bg)] hover:text-[var(--glass-tone-info-fg)]'
            }`}
          title={t('panel.moveUp')}
        >
          <AppIcon name="chevronUp" className="w-4 h-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={sbIndex === totalStoryboards - 1 || movingClipId === storyboardClipId}
          className={`rounded p-1 transition-colors ${sbIndex === totalStoryboards - 1 || movingClipId === storyboardClipId
            ? 'cursor-not-allowed text-[var(--glass-text-tertiary)]'
            : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-tone-info-bg)] hover:text-[var(--glass-tone-info-fg)]'
            }`}
          title={t('panel.moveDown')}
        >
          <AppIcon name="chevronDown" className="w-4 h-4" />
        </button>
      </div>
      <div className="glass-surface-soft flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-bold text-[var(--glass-tone-info-fg)]">
        {sbIndex + 1}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-[var(--glass-text-secondary)]">
          {t('group.segment')}【{formatClipTitle(clip)}】
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--glass-text-tertiary)]">{clip?.summary}</p>
      </div>
      <button
        type="button"
        onClick={handleConfirmClear}
        className="glass-btn-base glass-btn-soft ml-auto px-2.5 py-1.5 text-xs"
        title={t('panelActions.clearSegmentVideoPrompts')}
      >
        <AppIcon name="trash" className="h-3.5 w-3.5" />
        <span>{t('panelActions.clearSegmentVideoPrompts')}</span>
      </button>
    </div>
  )
}
