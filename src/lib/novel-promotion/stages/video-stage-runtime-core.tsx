'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Chat } from '@ai-sdk/react'
import {
  type VideoPromptOptimizerPayload,
  VideoToolbar,
  type VideoGenerationOptionValue,
  type VideoGenerationOptions,
  type VideoModelOption,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { AssistantChatModal, extractMessageContent } from '@/components/assistant/AssistantChatModal'
import { DefaultChatTransport, type ChatStatus, type UIMessage } from 'ai'
import { AppIcon } from '@/components/ui/icons'
import {
  useDownloadRemoteBlob,
  useListProjectEpisodeVideoUrls,
  useMatchedVoiceLines,
  useUploadProjectPanelVideo,
  useUpdateProjectPanelLink,
} from '@/lib/query/hooks'
import { useLipSync } from '@/lib/query/hooks/useStoryboards'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import VideoTimelinePanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoTimelinePanel'
import VideoRenderPanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel'
import type { VideoStageShellProps } from './video-stage-runtime/types'
import {
  type EffectiveVideoCapabilityDefinition,
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import { projectVideoPricingTiersByFixedSelections } from '@/lib/model-pricing/video-tier'
import { useVideoTaskStates } from './video-stage-runtime/useVideoTaskStates'
import { useVideoPanelsProjection } from './video-stage-runtime/useVideoPanelsProjection'
import { useVideoPromptState } from './video-stage-runtime/useVideoPromptState'
import { useVideoPanelLinking } from './video-stage-runtime/useVideoPanelLinking'
import { useVideoVoiceLines } from './video-stage-runtime/useVideoVoiceLines'
import { useVideoDownloadAll } from './video-stage-runtime/useVideoDownloadAll'
import { useVideoStageUiState } from './video-stage-runtime/useVideoStageUiState'
import { useVideoPanelViewport } from './video-stage-runtime/useVideoPanelViewport'
import { useVideoFirstLastFrameFlow } from './video-stage-runtime/useVideoFirstLastFrameFlow'
import { filterNormalVideoModelOptions } from '@/lib/model-capabilities/video-model-options'
import {
  buildVideoSubmissionKey,
  createVideoSubmissionBaseline,
  shouldResolveVideoSubmissionLock,
  type VideoSubmissionBaseline,
} from './video-stage-runtime/immediate-video-submission'

export type { VideoStageShellProps } from './video-stage-runtime/types'

type BatchCapabilityDefinition = EffectiveVideoCapabilityDefinition

interface BatchCapabilityField {
  field: string
  label: string
  labelKey?: string
  unitKey?: string
  options: VideoGenerationOptionValue[]
  disabledOptions?: VideoGenerationOptionValue[]
}

interface PromptOptimizerSession {
  taskKey: string
  requestKey: number
  storyboardId: string
  panelIndex: number
  panelKey: string
  promptField: 'videoPrompt' | 'firstLastFramePrompt'
  shotNumber: number
  panelContextJson: string
  initialMessage: string
  sourceFingerprint: string
  messages: UIMessage[]
  input: string
  status: ChatStatus
  pending: boolean
  error: Error | undefined
}

type PromptOptimizerUiStatus = 'idle' | 'running' | 'done' | 'error'

function buildPromptOptimizerTaskKey(panelKey: string, promptField: PromptOptimizerSession['promptField']): string {
  return `${promptField}:${panelKey}`
}

function buildPromptOptimizerSourceFingerprint(input: {
  currentPrompt: string
  defaultFlPrompt?: string
  originalText?: string
  dialogueLines?: string[]
  panelContextJson: string
}): string {
  return JSON.stringify({
    currentPrompt: input.currentPrompt.trim(),
    defaultFlPrompt: input.defaultFlPrompt?.trim() || '',
    originalText: input.originalText?.trim() || '',
    dialogueLines: (input.dialogueLines || []).map((line) => line.trim()).filter(Boolean),
    panelContextJson: input.panelContextJson,
  })
}

function getPromptOptimizerTaskUiStatus(task: Pick<PromptOptimizerSession, 'pending' | 'error' | 'messages'>): PromptOptimizerUiStatus {
  if (task.pending) return 'running'
  if (task.error) return 'error'
  for (let index = task.messages.length - 1; index >= 0; index -= 1) {
    const message = task.messages[index]
    if (message?.role !== 'assistant') continue
    if (extractMessageContent(message).lines.join('\n\n').trim()) return 'done'
  }
  return 'idle'
}

function buildPromptOptimizerInitialMessage(input: {
  currentPrompt?: string
  defaultFlPrompt?: string
  originalText?: string
  dialogueLines?: string[]
}): string {
  const currentPrompt = input.currentPrompt?.trim() || ''
  const defaultFlPrompt = input.defaultFlPrompt?.trim() || ''
  const originalText = input.originalText?.trim() || ''
  const dialogueLines = (input.dialogueLines || []).map((line) => line.trim()).filter(Boolean)

  const sections = [
    '请基于当前 panel 的完整 JSON 优化当前视频提示词，直接输出可复制的最终提示词正文。',
    currentPrompt ? `当前原始提示词：\n${currentPrompt}` : '',
    originalText ? `当前 panel 原文：\n${originalText}` : '',
    dialogueLines.length > 0 ? `当前 panel 台词：\n${dialogueLines.join('\n')}` : '',
    defaultFlPrompt ? `可参考的默认首尾帧提示词：\n${defaultFlPrompt}` : '',
  ].filter(Boolean)

  return sections.join('\n\n')
}

function toFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

export function useVideoStageRuntime({
  projectId,
  episodeId,
  storyboards,
  clips,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio = '16:9',
  videoPromptPrefix = '',
  videoPromptSuffix = '',
  userVideoModels,
  onGenerateVideo,
  onGenerateAllVideos,
  onBack,
  onUpdateVideoPrompt,
  onUpdatePanelVideoModel,
  onOpenAssetLibraryForCharacter,
  onEnterEditor,
}: VideoStageShellProps) {
  const t = useTranslations('video')
  const locale = useLocale()

  const {
    panelVideoPreference,
    voiceLinesExpanded,
    previewImage,
    setPreviewImage,
    toggleVoiceLinesExpanded,
    toggleLipSyncVideo,
    closePreviewImage,
  } = useVideoStageUiState()

  const {
    panelRefs,
    highlightedPanelKey,
    locateVoiceLinePanel,
  } = useVideoPanelViewport()

  const lipSyncMutation = useLipSync(projectId, episodeId)
  const listEpisodeVideoUrlsMutation = useListProjectEpisodeVideoUrls(projectId)
  const uploadPanelVideoMutation = useUploadProjectPanelVideo(projectId)
  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()
  const matchedVoiceLinesQuery = useMatchedVoiceLines(projectId, episodeId)

  const { panelVideoStates, panelLipStates } = useVideoTaskStates({
    projectId,
    storyboards,
  })
  const { allPanels } = useVideoPanelsProjection({
    storyboards,
    clips,
    panelVideoStates,
    panelLipStates,
  })

  const {
    savingPrompts,
    getLocalPrompt,
    updateLocalPrompt,
    savePrompt,
  } = useVideoPromptState({
    allPanels,
    onUpdateVideoPrompt,
  })

  const { linkedPanels, handleToggleLink } = useVideoPanelLinking({
    allPanels,
    updatePanelLinkMutation,
  })

  const {
    panelVoiceLines,
    allVoiceLines,
    runningVoiceLineIds,
    reloadVoiceLines,
  } = useVideoVoiceLines({
    projectId,
    matchedVoiceLinesQuery,
  })

  const {
    isDownloading,
    videosWithUrl,
    handleDownloadAllVideos,
  } = useVideoDownloadAll({
    episodeId,
    t: (key) => t(key as never),
    allPanels,
    panelVideoPreference,
    listEpisodeVideoUrlsMutation,
    downloadRemoteBlobMutation,
  })

  const allVideoModelOptions = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )
  const normalVideoModelOptions = useMemo(
    () => filterNormalVideoModelOptions(allVideoModelOptions),
    [allVideoModelOptions],
  )

  const safeTranslate = useCallback((key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }, [t])

  const renderCapabilityLabel = useCallback((field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }, [safeTranslate])

  const [isBatchConfigOpen, setIsBatchConfigOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSubmittingVideoBatch, setIsSubmittingVideoBatch] = useState(false)
  const [submittingVideoPanelKeys, setSubmittingVideoPanelKeys] = useState<Set<string>>(new Set())
  const [submittingVideoBaselines, setSubmittingVideoBaselines] = useState<Map<string, VideoSubmissionBaseline>>(new Map())
  const [batchSelectedModel, setBatchSelectedModel] = useState('')
  const [batchGenerationOptions, setBatchGenerationOptions] = useState<VideoGenerationOptions>({})
  const [promptOptimizerTasks, setPromptOptimizerTasks] = useState<Map<string, PromptOptimizerSession>>(new Map())
  const [activePromptOptimizerTaskKey, setActivePromptOptimizerTaskKey] = useState<string | null>(null)
  const promptOptimizerRequestCounterRef = useRef(0)
  const promptOptimizerChatsRef = useRef(new Map<string, Chat<UIMessage>>())
  const promptOptimizerUnsubscribersRef = useRef(new Map<string, Array<() => void>>())

  useEffect(() => {
    if (normalVideoModelOptions.length === 0) {
      if (batchSelectedModel) setBatchSelectedModel('')
      return
    }
    if (normalVideoModelOptions.some((model) => model.value === batchSelectedModel)) return

    const nextDefault = normalVideoModelOptions.some((model) => model.value === defaultVideoModel)
      ? defaultVideoModel
      : (normalVideoModelOptions[0]?.value || '')
    setBatchSelectedModel(nextDefault)
  }, [normalVideoModelOptions, batchSelectedModel, defaultVideoModel])

  const selectedBatchModelOption = useMemo<VideoModelOption | undefined>(
    () => normalVideoModelOptions.find((option) => option.value === batchSelectedModel),
    [normalVideoModelOptions, batchSelectedModel],
  )
  const batchPricingTiers = useMemo(
    () => projectVideoPricingTiersByFixedSelections({
      tiers: selectedBatchModelOption?.videoPricingTiers ?? [],
      fixedSelections: {
        generationMode: 'normal',
      },
    }),
    [selectedBatchModelOption?.videoPricingTiers],
  )

  const batchCapabilityDefinitions = useMemo<BatchCapabilityDefinition[]>(() => {
    return resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: selectedBatchModelOption?.capabilities?.video,
      pricingTiers: batchPricingTiers,
    })
  }, [batchPricingTiers, selectedBatchModelOption?.capabilities?.video])

  useEffect(() => {
    setBatchGenerationOptions((previous) => {
      return normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: previous,
      })
    })
  }, [batchCapabilityDefinitions, batchPricingTiers])

  const batchEffectiveCapabilityFields = useMemo(
    () => resolveEffectiveVideoCapabilityFields({
      definitions: batchCapabilityDefinitions,
      pricingTiers: batchPricingTiers,
      selection: batchGenerationOptions,
    }),
    [batchCapabilityDefinitions, batchGenerationOptions, batchPricingTiers],
  )

  const batchEffectiveFieldMap = useMemo(
    () => new Map(batchEffectiveCapabilityFields.map((field) => [field.field, field])),
    [batchEffectiveCapabilityFields],
  )
  const batchDefinitionFieldMap = useMemo(
    () => new Map(batchCapabilityDefinitions.map((definition) => [definition.field, definition])),
    [batchCapabilityDefinitions],
  )

  const batchCapabilityFields = useMemo<BatchCapabilityField[]>(() => {
    return batchCapabilityDefinitions.map((definition) => {
      const effectiveField = batchEffectiveFieldMap.get(definition.field)
      const enabledOptions = effectiveField?.options ?? []
      return {
        field: definition.field,
        label: toFieldLabel(definition.field),
        labelKey: definition.fieldI18n?.labelKey,
        unitKey: definition.fieldI18n?.unitKey,
        options: definition.options as VideoGenerationOptionValue[],
        disabledOptions: (definition.options as VideoGenerationOptionValue[])
          .filter((option) => !enabledOptions.includes(option)),
      }
    })
  }, [batchCapabilityDefinitions, batchEffectiveFieldMap])

  const batchMissingCapabilityFields = useMemo(
    () => batchEffectiveCapabilityFields
      .filter((field) => field.options.length === 0 || field.value === undefined)
      .map((field) => field.field),
    [batchEffectiveCapabilityFields],
  )

  const syncPromptOptimizerTask = useCallback((taskKey: string) => {
    const chat = promptOptimizerChatsRef.current.get(taskKey)
    if (!chat) return
    setPromptOptimizerTasks((previous) => {
      const task = previous.get(taskKey)
      if (!task) return previous
      const pending = chat.status === 'submitted' || chat.status === 'streaming'
      const nextTask: PromptOptimizerSession = {
        ...task,
        messages: [...chat.messages],
        status: chat.status,
        pending,
        error: chat.error,
      }
      const next = new Map(previous)
      next.set(taskKey, nextTask)
      return next
    })
  }, [])

  const removePromptOptimizerTask = useCallback((taskKey: string) => {
    const chat = promptOptimizerChatsRef.current.get(taskKey)
    if (chat) chat.stop()
    const unsubscribers = promptOptimizerUnsubscribersRef.current.get(taskKey) || []
    for (const unsubscribe of unsubscribers) unsubscribe()
    promptOptimizerUnsubscribersRef.current.delete(taskKey)
    promptOptimizerChatsRef.current.delete(taskKey)
    setPromptOptimizerTasks((previous) => {
      if (!previous.has(taskKey)) return previous
      const next = new Map(previous)
      next.delete(taskKey)
      return next
    })
    setActivePromptOptimizerTaskKey((previous) => (previous === taskKey ? null : previous))
  }, [])

  const createPromptOptimizerTask = useCallback((task: Omit<PromptOptimizerSession, 'messages' | 'input' | 'status' | 'pending' | 'error'>) => {
    const transport = new DefaultChatTransport({
      api: '/api/user/assistant/chat',
      body: {
        assistantId: 'sd2-pe',
        context: {
          locale,
          panelContextJson: task.panelContextJson,
        },
      },
    })
    const chat = new Chat<UIMessage>({ transport })
    promptOptimizerChatsRef.current.set(task.taskKey, chat)
    const unsubscribers = [
      chat['~registerMessagesCallback'](() => { syncPromptOptimizerTask(task.taskKey) }),
      chat['~registerStatusCallback'](() => { syncPromptOptimizerTask(task.taskKey) }),
      chat['~registerErrorCallback'](() => { syncPromptOptimizerTask(task.taskKey) }),
    ]
    promptOptimizerUnsubscribersRef.current.set(task.taskKey, unsubscribers)
    setPromptOptimizerTasks((previous) => {
      const next = new Map(previous)
      next.set(task.taskKey, {
        ...task,
        messages: [],
        input: '',
        status: 'ready',
        pending: false,
        error: undefined,
      })
      return next
    })
    setActivePromptOptimizerTaskKey(task.taskKey)
    void chat.sendMessage({ text: task.initialMessage }).catch(() => {
      syncPromptOptimizerTask(task.taskKey)
    })
  }, [locale, syncPromptOptimizerTask])

  const setBatchCapabilityValue = useCallback((field: string, rawValue: string) => {
    const capabilityDefinition = batchDefinitionFieldMap.get(field)
    if (!capabilityDefinition || capabilityDefinition.options.length === 0) return
    const sample = capabilityDefinition.options[0]
    const parsedValue =
      typeof sample === 'number'
        ? Number(rawValue)
        : typeof sample === 'boolean'
          ? rawValue === 'true'
          : rawValue
    if (!capabilityDefinition.options.includes(parsedValue)) return
    setBatchGenerationOptions((previous) => ({
      ...normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: {
          ...previous,
          [field]: parsedValue,
        },
        pinnedFields: [field],
      }),
    }))
  }, [batchCapabilityDefinitions, batchDefinitionFieldMap, batchPricingTiers])

  const handleOpenPromptOptimizer = useCallback((payload: VideoPromptOptimizerPayload) => {
    const shotNumber = payload.panel.textPanel?.panel_number || payload.panelIndex + 1
    const panelContextJson = JSON.stringify({
      projectId,
      episodeId,
      panelKey: payload.panelKey,
      promptField: payload.promptField,
      currentPrompt: payload.currentPrompt,
      originalText: payload.originalText || '',
      dialogueLines: payload.dialogueLines || [],
      defaultFlPrompt: payload.defaultFlPrompt || '',
      layout: {
        isLinked: payload.isLinked,
        isLastFrame: payload.isLastFrame,
        hasNext: payload.hasNext,
        videoRatio: payload.videoRatio || videoRatio,
      },
      panel: payload.panel,
      prevPanel: payload.prevPanel,
      nextPanel: payload.nextPanel,
    }, null, 2)
    const taskKey = buildPromptOptimizerTaskKey(payload.panelKey, payload.promptField)
    const sourceFingerprint = buildPromptOptimizerSourceFingerprint({
      currentPrompt: payload.currentPrompt,
      defaultFlPrompt: payload.defaultFlPrompt,
      originalText: payload.originalText,
      dialogueLines: payload.dialogueLines,
      panelContextJson,
    })
    const existingTask = promptOptimizerTasks.get(taskKey)
    if (existingTask && existingTask.sourceFingerprint === sourceFingerprint) {
      setActivePromptOptimizerTaskKey(taskKey)
      return
    }
    if (existingTask) {
      removePromptOptimizerTask(taskKey)
    }

    promptOptimizerRequestCounterRef.current += 1
    createPromptOptimizerTask({
      taskKey,
      requestKey: promptOptimizerRequestCounterRef.current,
      storyboardId: payload.panel.storyboardId,
      panelIndex: payload.panel.panelIndex,
      panelKey: payload.panelKey,
      promptField: payload.promptField,
      shotNumber,
      panelContextJson,
      initialMessage: buildPromptOptimizerInitialMessage({
        currentPrompt: payload.currentPrompt,
        defaultFlPrompt: payload.defaultFlPrompt,
        originalText: payload.originalText,
        dialogueLines: payload.dialogueLines,
      }),
      sourceFingerprint,
    })
  }, [createPromptOptimizerTask, episodeId, projectId, promptOptimizerTasks, removePromptOptimizerTask, videoRatio])

  const handleClosePromptOptimizer = useCallback(() => {
    setActivePromptOptimizerTaskKey(null)
  }, [])

  const activePromptOptimizerTask = useMemo(
    () => (activePromptOptimizerTaskKey ? (promptOptimizerTasks.get(activePromptOptimizerTaskKey) || null) : null),
    [activePromptOptimizerTaskKey, promptOptimizerTasks],
  )

  const latestPromptOptimizerResult = useMemo(() => {
    if (!activePromptOptimizerTask) return null
    for (let index = activePromptOptimizerTask.messages.length - 1; index >= 0; index -= 1) {
      const message = activePromptOptimizerTask.messages[index]
      if (message?.role !== 'assistant') continue
      const content = extractMessageContent(message)
      const text = content.lines.join('\n\n').trim()
      if (!text) continue
      return {
        messageId: message.id,
        text,
      }
    }
    return null
  }, [activePromptOptimizerTask])

  const promptOptimizerStatuses = useMemo(() => {
    const next = new Map<string, PromptOptimizerUiStatus>()
    for (const [taskKey, task] of promptOptimizerTasks.entries()) {
      next.set(taskKey, getPromptOptimizerTaskUiStatus(task))
    }
    return next
  }, [promptOptimizerTasks])

  const handlePromptOptimizerInputChange = useCallback((value: string) => {
    if (!activePromptOptimizerTaskKey) return
    setPromptOptimizerTasks((previous) => {
      const task = previous.get(activePromptOptimizerTaskKey)
      if (!task || task.input === value) return previous
      const next = new Map(previous)
      next.set(activePromptOptimizerTaskKey, {
        ...task,
        input: value,
      })
      return next
    })
  }, [activePromptOptimizerTaskKey])

  const handlePromptOptimizerSend = useCallback(async () => {
    if (!activePromptOptimizerTaskKey) return
    const task = promptOptimizerTasks.get(activePromptOptimizerTaskKey)
    const chat = promptOptimizerChatsRef.current.get(activePromptOptimizerTaskKey)
    if (!task || !chat || task.pending) return
    const text = task.input.trim()
    if (!text) return
    setPromptOptimizerTasks((previous) => {
      const current = previous.get(activePromptOptimizerTaskKey)
      if (!current) return previous
      const next = new Map(previous)
      next.set(activePromptOptimizerTaskKey, {
        ...current,
        input: '',
      })
      return next
    })
    await chat.sendMessage({ text })
  }, [activePromptOptimizerTaskKey, promptOptimizerTasks])

  const handleStopPromptOptimizer = useCallback(() => {
    if (!activePromptOptimizerTaskKey) return
    promptOptimizerChatsRef.current.get(activePromptOptimizerTaskKey)?.stop()
  }, [activePromptOptimizerTaskKey])

  const handleDiscardPromptOptimizer = useCallback(() => {
    if (!activePromptOptimizerTaskKey) return
    removePromptOptimizerTask(activePromptOptimizerTaskKey)
  }, [activePromptOptimizerTaskKey, removePromptOptimizerTask])

  const handleRetryPromptOptimizer = useCallback(() => {
    if (!activePromptOptimizerTask) return
    const {
      taskKey,
      storyboardId,
      panelIndex,
      panelKey,
      promptField,
      shotNumber,
      panelContextJson,
      initialMessage,
      sourceFingerprint,
    } = activePromptOptimizerTask
    removePromptOptimizerTask(taskKey)
    promptOptimizerRequestCounterRef.current += 1
    createPromptOptimizerTask({
      taskKey,
      requestKey: promptOptimizerRequestCounterRef.current,
      storyboardId,
      panelIndex,
      panelKey,
      promptField,
      shotNumber,
      panelContextJson,
      initialMessage,
      sourceFingerprint,
    })
  }, [activePromptOptimizerTask, createPromptOptimizerTask, removePromptOptimizerTask])

  useEffect(() => {
    const chatInstances = promptOptimizerChatsRef.current
    const taskUnsubscribers = promptOptimizerUnsubscribersRef.current
    return () => {
      for (const chat of chatInstances.values()) {
        chat.stop()
      }
      for (const unsubscribers of taskUnsubscribers.values()) {
        for (const unsubscribe of unsubscribers) unsubscribe()
      }
      chatInstances.clear()
      taskUnsubscribers.clear()
    }
  }, [])

  const handleLipSync = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    voiceLineId: string,
    panelId?: string,
  ) => {
    try {
      await lipSyncMutation.mutateAsync({
        storyboardId,
        panelIndex,
        voiceLineId,
        panelId,
      })
    } catch (error: unknown) {
      _ulogError('Lip sync error:', error)
      throw error
    }
  }, [lipSyncMutation])

  const handleUploadVideo = useCallback(async (panelId: string, file: File) => {
    await uploadPanelVideoMutation.mutateAsync({ panelId, file })
  }, [uploadPanelVideoMutation])

  const panelBySubmissionKey = useMemo(() => {
    const next = new Map<string, (typeof allPanels)[number]>()
    for (const panel of allPanels) {
      next.set(buildVideoSubmissionKey(panel), panel)
    }
    return next
  }, [allPanels])

  const handleGenerateVideoWithImmediateLock = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
    },
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => {
    if (isSubmittingVideoBatch) return

    const panelKey = buildVideoSubmissionKey({ panelId, storyboardId, panelIndex })
    const currentPanel = panelBySubmissionKey.get(panelKey)
    if (currentPanel?.videoTaskRunning || submittingVideoPanelKeys.has(panelKey)) return

    setSubmittingVideoPanelKeys((previous) => {
      if (previous.has(panelKey)) return previous
      const next = new Set(previous)
      next.add(panelKey)
      return next
    })
    if (currentPanel) {
      setSubmittingVideoBaselines((previous) => {
        const next = new Map(previous)
        next.set(panelKey, createVideoSubmissionBaseline(currentPanel))
        return next
      })
    }

    try {
      await onGenerateVideo(storyboardId, panelIndex, videoModel, firstLastFrame, generationOptions, panelId)
    } catch (error) {
      setSubmittingVideoPanelKeys((previous) => {
        if (!previous.has(panelKey)) return previous
        const next = new Set(previous)
        next.delete(panelKey)
        return next
      })
      setSubmittingVideoBaselines((previous) => {
        if (!previous.has(panelKey)) return previous
        const next = new Map(previous)
        next.delete(panelKey)
        return next
      })
      throw error
    }
  }, [
    isSubmittingVideoBatch,
    onGenerateVideo,
    panelBySubmissionKey,
    submittingVideoPanelKeys,
  ])

  const {
    flModel,
    flModelOptions,
    flGenerationOptions,
    flCapabilityFields,
    flMissingCapabilityFields,
    flCustomPrompts,
    setFlModel,
    setFlCapabilityValue,
    setFlCustomPrompt,
    resetFlCustomPrompt,
    handleGenerateFirstLastFrame,
    getDefaultFlPrompt,
    getNextPanel,
    isLinkedAsLastFrame,
  } = useVideoFirstLastFrameFlow({
    allPanels,
    linkedPanels,
    videoModelOptions: allVideoModelOptions,
    onGenerateVideo: handleGenerateVideoWithImmediateLock,
    t: (key) => t(key as never),
  })

  const handleApplyOptimizedPrompt = useCallback(async (message: UIMessage) => {
    if (!activePromptOptimizerTask) return
    const text = extractMessageContent(message).lines.join('\n\n').trim()
    if (!text) return

    updateLocalPrompt(activePromptOptimizerTask.panelKey, text, activePromptOptimizerTask.promptField)
    if (activePromptOptimizerTask.promptField === 'firstLastFramePrompt') {
      setFlCustomPrompt(activePromptOptimizerTask.panelKey, text)
    }
    await savePrompt(
      activePromptOptimizerTask.storyboardId,
      activePromptOptimizerTask.panelIndex,
      activePromptOptimizerTask.panelKey,
      text,
      activePromptOptimizerTask.promptField,
    )
    removePromptOptimizerTask(activePromptOptimizerTask.taskKey)
  }, [
    activePromptOptimizerTask,
    removePromptOptimizerTask,
    savePrompt,
    setFlCustomPrompt,
    updateLocalPrompt,
  ])

  useEffect(() => {
    if (submittingVideoPanelKeys.size === 0) return

    const now = Date.now()
    setSubmittingVideoPanelKeys((previous) => {
      let changed = false
      const next = new Set(previous)
      for (const key of previous) {
        if (!shouldResolveVideoSubmissionLock(panelBySubmissionKey.get(key), submittingVideoBaselines.get(key), now)) {
          continue
        }
        next.delete(key)
        changed = true
      }
      return changed ? next : previous
    })
    setSubmittingVideoBaselines((previous) => {
      let changed = false
      const next = new Map(previous)
      for (const key of previous.keys()) {
        if (submittingVideoPanelKeys.has(key) && !shouldResolveVideoSubmissionLock(panelBySubmissionKey.get(key), previous.get(key), now)) {
          continue
        }
        next.delete(key)
        changed = true
      }
      return changed ? next : previous
    })
  }, [panelBySubmissionKey, submittingVideoBaselines, submittingVideoPanelKeys])

  useEffect(() => {
    if (!isSubmittingVideoBatch || allPanels.some((panel) => panel.videoTaskRunning)) {
      if (isSubmittingVideoBatch && allPanels.some((panel) => panel.videoTaskRunning)) {
        setIsSubmittingVideoBatch(false)
      }
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsSubmittingVideoBatch(false)
    }, 90_000)
    return () => window.clearTimeout(timeoutId)
  }, [allPanels, isSubmittingVideoBatch])

  const handleGenerateAllVideosWithImmediateLock = useCallback(async (options?: Parameters<typeof onGenerateAllVideos>[0]) => {
    if (isSubmittingVideoBatch) return
    setIsSubmittingVideoBatch(true)
    try {
      await onGenerateAllVideos(options)
    } catch (error) {
      setIsSubmittingVideoBatch(false)
      throw error
    }
  }, [isSubmittingVideoBatch, onGenerateAllVideos])

  const projectedPanels = useMemo(() => (
    allPanels.map((panel) => {
      const panelKey = buildVideoSubmissionKey(panel)
      if (!isSubmittingVideoBatch && !submittingVideoPanelKeys.has(panelKey)) return panel
      return {
        ...panel,
        videoTaskRunning: true,
      }
    })
  ), [allPanels, isSubmittingVideoBatch, submittingVideoPanelKeys])

  const runningCount = projectedPanels.filter((panel) => panel.videoTaskRunning || panel.lipSyncTaskRunning).length
  const failedCount = allPanels.filter((panel) => !!panel.videoErrorMessage || !!panel.lipSyncErrorMessage).length
  const isAnyTaskRunning = runningCount > 0 || isSubmittingVideoBatch
  const canSubmitBatchGenerate = !!batchSelectedModel && batchMissingCapabilityFields.length === 0

  const handleOpenBatchGenerateModal = useCallback(() => {
    if (isAnyTaskRunning) return
    setIsBatchConfigOpen(true)
  }, [isAnyTaskRunning])

  const handleCloseBatchGenerateModal = useCallback(() => {
    setIsBatchConfigOpen(false)
  }, [])

  const handleConfirmBatchGenerate = useCallback(async () => {
    if (!canSubmitBatchGenerate || isConfirming) return

    setIsConfirming(true)
    try {
      await handleGenerateAllVideosWithImmediateLock({
        videoModel: batchSelectedModel,
        generationOptions: batchGenerationOptions,
      })
      setIsBatchConfigOpen(false)
    } finally {
      setIsConfirming(false)
    }
  }, [
    batchGenerationOptions,
    batchSelectedModel,
    canSubmitBatchGenerate,
    handleGenerateAllVideosWithImmediateLock,
    isConfirming,
  ])

  return (
    <div className="space-y-6 pb-20">
      <VideoToolbar
        totalPanels={projectedPanels.length}
        runningCount={runningCount}
        videosWithUrl={videosWithUrl}
        failedCount={failedCount}
        isAnyTaskRunning={isAnyTaskRunning}
        isDownloading={isDownloading}
        onGenerateAll={handleOpenBatchGenerateModal}
        onDownloadAll={handleDownloadAllVideos}
        onBack={onBack}
        onEnterEditor={onEnterEditor}
        videosReady={videosWithUrl > 0}
      />

      <VideoTimelinePanel
        projectId={projectId}
        episodeId={episodeId}
        allVoiceLines={allVoiceLines}
        expanded={voiceLinesExpanded}
        onToggleExpanded={toggleVoiceLinesExpanded}
        onReloadVoiceLines={reloadVoiceLines}
        onLocateVoiceLine={locateVoiceLinePanel}
        onOpenAssetLibraryForCharacter={onOpenAssetLibraryForCharacter}
      />

      <VideoRenderPanel
        allPanels={projectedPanels}
        linkedPanels={linkedPanels}
        highlightedPanelKey={highlightedPanelKey}
        panelRefs={panelRefs}
        videoRatio={videoRatio}
        defaultVideoModel={defaultVideoModel}
        capabilityOverrides={capabilityOverrides}
        videoPromptPrefix={videoPromptPrefix}
        videoPromptSuffix={videoPromptSuffix}
        userVideoModels={normalVideoModelOptions}
        projectId={projectId}
        episodeId={episodeId}
        runningVoiceLineIds={runningVoiceLineIds}
        panelVoiceLines={panelVoiceLines}
        panelVideoPreference={panelVideoPreference}
        savingPrompts={savingPrompts}
        flModel={flModel}
        flModelOptions={flModelOptions}
        flGenerationOptions={flGenerationOptions}
        flCapabilityFields={flCapabilityFields}
        flMissingCapabilityFields={flMissingCapabilityFields}
        flCustomPrompts={flCustomPrompts}
        onGenerateVideo={handleGenerateVideoWithImmediateLock}
        onUpdatePanelVideoModel={onUpdatePanelVideoModel}
        onLipSync={handleLipSync}
        onUploadVideo={handleUploadVideo}
        onToggleLink={handleToggleLink}
        onFlModelChange={setFlModel}
        onFlCapabilityChange={setFlCapabilityValue}
        onFlCustomPromptChange={setFlCustomPrompt}
        onResetFlPrompt={resetFlCustomPrompt}
        onGenerateFirstLastFrame={handleGenerateFirstLastFrame}
        onPreviewImage={setPreviewImage}
        onToggleLipSyncVideo={toggleLipSyncVideo}
        getNextPanel={getNextPanel}
        isLinkedAsLastFrame={isLinkedAsLastFrame}
        getDefaultFlPrompt={getDefaultFlPrompt}
        getLocalPrompt={getLocalPrompt}
        updateLocalPrompt={updateLocalPrompt}
        savePrompt={savePrompt}
        promptOptimizerStatuses={promptOptimizerStatuses}
        onOpenPromptOptimizer={handleOpenPromptOptimizer}
      />

      {isBatchConfigOpen && (
        <div
          className="fixed inset-0 z-[120] glass-overlay flex items-center justify-center p-4"
          onClick={handleCloseBatchGenerateModal}
        >
          <div
            className="glass-surface-modal w-full max-w-2xl p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                {t('toolbar.batchConfigTitle')}
              </h3>
              <p className="text-sm text-[var(--glass-text-tertiary)]">
                {t('toolbar.batchConfigDesc')}
              </p>
            </div>

            <ModelCapabilityDropdown
              models={normalVideoModelOptions}
              value={batchSelectedModel || undefined}
              onModelChange={setBatchSelectedModel}
              capabilityFields={batchCapabilityFields.map((field) => ({
                field: field.field,
                label: renderCapabilityLabel(field),
                options: field.options,
                disabledOptions: field.disabledOptions,
              }))}
              capabilityOverrides={batchGenerationOptions}
              onCapabilityChange={(field, rawValue) => setBatchCapabilityValue(field, rawValue)}
              placeholder={t('panelCard.selectModel')}
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCloseBatchGenerateModal}
                className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm font-medium"
              >
                {t('panelCard.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmBatchGenerate() }}
                disabled={!canSubmitBatchGenerate || isConfirming}
                className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConfirming ? (
                  <>
                    <AppIcon name="loader" className="animate-spin h-4 w-4" />
                    <span>{t('toolbar.confirming')}</span>
                  </>
                ) : (
                  <span>{t('toolbar.confirmGenerateAll')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <AssistantChatModal
        open={activePromptOptimizerTask !== null}
        title={t('promptOptimizer.title', { number: activePromptOptimizerTask?.shotNumber || 0 })}
        subtitle={t('promptOptimizer.subtitle')}
        closeLabel={t('promptOptimizer.close')}
        userLabel={t('promptOptimizer.userLabel')}
        assistantLabel="SD2 PE"
        reasoningTitle={t('promptOptimizer.reasoningTitle')}
        reasoningExpandLabel={t('promptOptimizer.reasoningExpand')}
        reasoningCollapseLabel={t('promptOptimizer.reasoningCollapse')}
        emptyAssistantMessage={t('promptOptimizer.emptyAssistantMessage')}
        inputPlaceholder={t('promptOptimizer.inputPlaceholder')}
        sendLabel={t('promptOptimizer.send')}
        pendingLabel={t('promptOptimizer.pending')}
        stopLabel={t('panelCard.cancel')}
        messages={activePromptOptimizerTask?.messages || []}
        input={activePromptOptimizerTask?.input || ''}
        pending={activePromptOptimizerTask?.pending || false}
        errorMessage={activePromptOptimizerTask?.error?.message}
        onClose={handleClosePromptOptimizer}
        onInputChange={handlePromptOptimizerInputChange}
        onSend={() => { void handlePromptOptimizerSend() }}
        onStop={handleStopPromptOptimizer}
        footerActions={
          activePromptOptimizerTask?.error && !activePromptOptimizerTask.pending ? (
            <button
              type="button"
              onClick={handleRetryPromptOptimizer}
              className="glass-btn-base glass-btn-secondary px-3 py-2 text-sm font-medium"
            >
              {t('panelCard.retry')}
            </button>
          ) : undefined
        }
        renderMessageActions={(message) => {
          if (message.role !== 'assistant') return null
          if (activePromptOptimizerTask?.pending) return null
          if (!latestPromptOptimizerResult || latestPromptOptimizerResult.messageId !== message.id) return null
          return (
            <>
              <button
                type="button"
                onClick={handleDiscardPromptOptimizer}
                className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs font-medium"
              >
                {t('promptOptimizer.discard')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const sourceMessage = activePromptOptimizerTask?.messages.find((item) => item.id === message.id)
                  if (!sourceMessage) return
                  void handleApplyOptimizedPrompt(sourceMessage)
                }}
                className="glass-btn-base glass-btn-primary px-3 py-1.5 text-xs font-medium"
              >
                使用该提示词
              </button>
            </>
          )
        }}
      />

      {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={closePreviewImage} />}
    </div>
  )
}
