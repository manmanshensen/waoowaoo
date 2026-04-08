'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    ART_STYLES,
    VIDEO_RATIOS,
} from '@/lib/constants'
import type {
    CapabilitySelections,
    CapabilityValue,
    ModelCapabilities,
} from '@/lib/model-config-contract'
import { filterNormalVideoModelOptions } from '@/lib/model-capabilities/video-model-options'
import { RatioSelector, StyleSelector } from './config-modal-selectors'
import { ModelCapabilityDropdown } from './ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'

interface ModelOption {
    value: string
    label: string
    provider?: string
    providerName?: string
    capabilities?: ModelCapabilities
}

interface UserModels {
    llm: ModelOption[]
    image: ModelOption[]
    video: ModelOption[]
    audio: ModelOption[]
}

interface CapabilityFieldDefinition {
    field: string
    options: CapabilityValue[]
    label: string
}

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    availableModels?: Partial<UserModels>
    modelsLoaded?: boolean
    artStyle?: string
    analysisModel?: string
    characterModel?: string
    locationModel?: string
    imageModel?: string
    combinedStoryboard1x1Model?: string
    combinedStoryboard2x2Model?: string
    combinedStoryboard3x3Model?: string
    combinedStoryboard1x1Resolution?: string
    combinedStoryboard2x2Resolution?: string
    combinedStoryboard3x3Resolution?: string
    editModel?: string

    videoModel?: string
    audioModel?: string
    videoRatio?: string
    videoPromptPrefix?: string
    videoPromptSuffix?: string
    capabilityOverrides?: CapabilitySelections
    ttsRate?: string
    onArtStyleChange?: (value: string) => void
    onAnalysisModelChange?: (value: string) => void
    onCharacterModelChange?: (value: string) => void
    onLocationModelChange?: (value: string) => void
    onImageModelChange?: (value: string) => void
    onCombinedStoryboard1x1ModelChange?: (value: string) => void
    onCombinedStoryboard2x2ModelChange?: (value: string) => void
    onCombinedStoryboard3x3ModelChange?: (value: string) => void
    onCombinedStoryboard1x1ResolutionChange?: (value: string) => void
    onCombinedStoryboard2x2ResolutionChange?: (value: string) => void
    onCombinedStoryboard3x3ResolutionChange?: (value: string) => void
    onEditModelChange?: (value: string) => void

    onVideoModelChange?: (value: string) => void
    onAudioModelChange?: (value: string) => void
    onVideoRatioChange?: (value: string) => void
    onVideoPromptPrefixChange?: (value: string) => void
    onVideoPromptSuffixChange?: (value: string) => void
    onCapabilityOverridesChange?: (value: CapabilitySelections) => void
    onTTSRateChange?: (value: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function toFieldLabel(field: string): string {
    return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function parseBySample(input: string, sample: CapabilityValue): CapabilityValue {
    if (typeof sample === 'number') return Number(input)
    if (typeof sample === 'boolean') return input === 'true'
    return input
}

function extractCapabilityFields(
    capabilities: ModelCapabilities | undefined,
    namespace: 'llm' | 'image' | 'video' | 'audio',
): CapabilityFieldDefinition[] {
    const rawNamespace = capabilities?.[namespace]
    if (!isRecord(rawNamespace)) return []

    return Object.entries(rawNamespace)
        .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
        .map(([key, value]) => {
            const field = key.slice(0, -'Options'.length)
            return {
                field,
                options: value as CapabilityValue[],
                label: toFieldLabel(field),
            }
        })
}

function readCapabilitySelectionForModel(
    overrides: CapabilitySelections | undefined,
    modelKey: string | undefined,
): Record<string, CapabilityValue> {
    if (!modelKey || !overrides) return {}
    const raw = overrides[modelKey]
    if (!isRecord(raw)) return {}

    const normalized: Record<string, CapabilityValue> = {}
    for (const [field, value] of Object.entries(raw)) {
        if (isCapabilityValue(value)) {
            normalized[field] = value
        }
    }
    return normalized
}

export function SettingsModal({
    isOpen,
    onClose,
    availableModels,
    modelsLoaded = false,
    artStyle = 'american-comic',
    analysisModel,
    characterModel,
    locationModel,
    imageModel,
    combinedStoryboard1x1Model,
    combinedStoryboard2x2Model,
    combinedStoryboard3x3Model,
    combinedStoryboard1x1Resolution = '1K',
    combinedStoryboard2x2Resolution = '2K',
    combinedStoryboard3x3Resolution = '4K',
    editModel,
    videoModel,
    audioModel,
    videoRatio = '9:16',
    videoPromptPrefix = '',
    videoPromptSuffix = '',
    capabilityOverrides,
    ttsRate,
    onArtStyleChange,
    onAnalysisModelChange,
    onCharacterModelChange,
    onLocationModelChange,
    onImageModelChange,
    onCombinedStoryboard1x1ModelChange,
    onCombinedStoryboard2x2ModelChange,
    onCombinedStoryboard3x3ModelChange,
    onCombinedStoryboard1x1ResolutionChange,
    onCombinedStoryboard2x2ResolutionChange,
    onCombinedStoryboard3x3ResolutionChange,
    onEditModelChange,
    onVideoModelChange,
    onAudioModelChange,
    onVideoRatioChange,
    onVideoPromptPrefixChange,
    onVideoPromptSuffixChange,
    onCapabilityOverridesChange,
    onTTSRateChange,
}: SettingsModalProps) {
    const t = useTranslations('configModal')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
    const [videoPromptPrefixDraft, setVideoPromptPrefixDraft] = useState(videoPromptPrefix)
    const [videoPromptSuffixDraft, setVideoPromptSuffixDraft] = useState(videoPromptSuffix)
    const [isSavingVideoPromptWrapper, setIsSavingVideoPromptWrapper] = useState(false)
    const wasOpenRef = useRef(false)
    const userModels = useMemo<UserModels>(() => ({
        llm: Array.isArray(availableModels?.llm) ? availableModels.llm : [],
        image: Array.isArray(availableModels?.image) ? availableModels.image : [],
        video: Array.isArray(availableModels?.video) ? availableModels.video : [],
        audio: Array.isArray(availableModels?.audio) ? availableModels.audio : [],
    }), [availableModels])
    const normalVideoModels = useMemo<ModelOption[]>(
        () => filterNormalVideoModelOptions(userModels.video),
        [userModels.video],
    )

    const selectedVideoModelOption = useMemo(
        () => normalVideoModels.find((model) => model.value === videoModel) || null,
        [normalVideoModels, videoModel],
    )
    const selectedAnalysisModelOption = useMemo(
        () => userModels.llm.find((model) => model.value === analysisModel) || null,
        [userModels.llm, analysisModel],
    )
    const selectedAudioModelOption = useMemo(
        () => userModels.audio.find((model) => model.value === audioModel) || null,
        [userModels.audio, audioModel],
    )

    const videoCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedVideoModelOption?.capabilities, 'video'),
        [selectedVideoModelOption],
    )
    const analysisCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedAnalysisModelOption?.capabilities, 'llm'),
        [selectedAnalysisModelOption],
    )
    const audioCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedAudioModelOption?.capabilities, 'audio'),
        [selectedAudioModelOption],
    )
    const selectedCharacterModelOption = useMemo(
        () => userModels.image.find((model) => model.value === characterModel) || null,
        [userModels.image, characterModel],
    )
    const selectedLocationModelOption = useMemo(
        () => userModels.image.find((model) => model.value === locationModel) || null,
        [userModels.image, locationModel],
    )
    const selectedStoryboardModelOption = useMemo(
        () => userModels.image.find((model) => model.value === imageModel) || null,
        [userModels.image, imageModel],
    )
    const selectedEditModelOption = useMemo(
        () => userModels.image.find((model) => model.value === editModel) || null,
        [userModels.image, editModel],
    )
    const selectedCombinedStoryboard1x1ModelOption = useMemo(
        () => userModels.image.find((model) => model.value === combinedStoryboard1x1Model) || null,
        [combinedStoryboard1x1Model, userModels.image],
    )
    const selectedCombinedStoryboard2x2ModelOption = useMemo(
        () => userModels.image.find((model) => model.value === combinedStoryboard2x2Model) || null,
        [combinedStoryboard2x2Model, userModels.image],
    )
    const selectedCombinedStoryboard3x3ModelOption = useMemo(
        () => userModels.image.find((model) => model.value === combinedStoryboard3x3Model) || null,
        [combinedStoryboard3x3Model, userModels.image],
    )
    const characterCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedCharacterModelOption?.capabilities, 'image'),
        [selectedCharacterModelOption],
    )
    const locationCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedLocationModelOption?.capabilities, 'image'),
        [selectedLocationModelOption],
    )
    const storyboardCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedStoryboardModelOption?.capabilities, 'image'),
        [selectedStoryboardModelOption],
    )
    const editCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedEditModelOption?.capabilities, 'image'),
        [selectedEditModelOption],
    )
    const combinedStoryboard1x1ResolutionOptions = useMemo(() => {
        const options = selectedCombinedStoryboard1x1ModelOption?.capabilities?.image?.resolutionOptions
        if (Array.isArray(options) && options.length > 0) return options
        return ['1K', '2K', '4K']
    }, [selectedCombinedStoryboard1x1ModelOption])
    const combinedStoryboard2x2ResolutionOptions = useMemo(() => {
        const options = selectedCombinedStoryboard2x2ModelOption?.capabilities?.image?.resolutionOptions
        if (Array.isArray(options) && options.length > 0) return options
        return ['1K', '2K', '4K']
    }, [selectedCombinedStoryboard2x2ModelOption])
    const combinedStoryboard3x3ResolutionOptions = useMemo(() => {
        const options = selectedCombinedStoryboard3x3ModelOption?.capabilities?.image?.resolutionOptions
        if (Array.isArray(options) && options.length > 0) return options
        return ['1K', '2K', '4K']
    }, [selectedCombinedStoryboard3x3ModelOption])

    const selectedVideoOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, videoModel)
    }, [capabilityOverrides, videoModel])
    const selectedAnalysisOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, analysisModel)
    }, [capabilityOverrides, analysisModel])
    const selectedAudioOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, audioModel)
    }, [capabilityOverrides, audioModel])
    const selectedCharacterOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, characterModel)
    }, [capabilityOverrides, characterModel])
    const selectedLocationOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, locationModel)
    }, [capabilityOverrides, locationModel])
    const selectedStoryboardOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, imageModel)
    }, [capabilityOverrides, imageModel])
    const selectedEditOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, editModel)
    }, [capabilityOverrides, editModel])

    const applyCapabilityOverride = (modelKey: string | undefined, field: string, value: string, sample: CapabilityValue) => {
        if (!modelKey || !onCapabilityOverridesChange) return

        const nextOverrides: CapabilitySelections = {
            ...(capabilityOverrides || {}),
        }
        const currentSelection = isRecord(nextOverrides[modelKey])
            ? { ...(nextOverrides[modelKey] as Record<string, CapabilityValue>) }
            : {}

        if (!value) {
            delete currentSelection[field]
        } else {
            currentSelection[field] = parseBySample(value, sample)
        }

        if (Object.keys(currentSelection).length === 0) {
            delete nextOverrides[modelKey]
        } else {
            nextOverrides[modelKey] = currentSelection
        }

        onCapabilityOverridesChange(nextOverrides)
        showSaved()
    }

    /**
     * 切换模型时，自动将该模型所有 capability fields 的第一个 option 写入 overrides
     * 解决 UI 视觉上显示默认选中（第一项高亮）但 DB 实际为空，导致 requireAllFields 报错的问题
     */
    const handleModelChange = (
        modelKey: string,
        modelOptions: ModelOption[],
        namespace: 'llm' | 'image' | 'video' | 'audio',
        onModelChangeFn?: (v: string) => void,
    ) => {
        onModelChangeFn?.(modelKey)
        showSaved()
        if (!onCapabilityOverridesChange) return
        // 用新选中的模型的 capabilities 计算 fields，而不是旧模型的
        const newModel = modelOptions.find((m) => m.value === modelKey)
        const capabilityFieldsForModel = extractCapabilityFields(newModel?.capabilities, namespace)
        if (capabilityFieldsForModel.length === 0) return
        const nextOverrides: CapabilitySelections = { ...(capabilityOverrides || {}) }
        const existing = isRecord(nextOverrides[modelKey])
            ? { ...(nextOverrides[modelKey] as Record<string, CapabilityValue>) }
            : {}
        // 只对尚未配置的 field 设置默认值（不覆盖已有配置）
        let changed = false
        for (const def of capabilityFieldsForModel) {
            if (existing[def.field] === undefined && def.options.length > 0) {
                existing[def.field] = def.options[0]
                changed = true
            }
        }
        if (changed) {
            nextOverrides[modelKey] = existing
            onCapabilityOverridesChange(nextOverrides)
        }
    }

    void ttsRate
    void onTTSRateChange

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setVideoPromptPrefixDraft(videoPromptPrefix)
            setVideoPromptSuffixDraft(videoPromptSuffix)
        }
        wasOpenRef.current = isOpen
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, videoPromptPrefix, videoPromptSuffix])

    const showSaved = () => {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
    }

    const handleChange = (callback?: (value: string) => void) => (value: string) => {
        callback?.(value)
        showSaved()
    }

    const isVideoPromptWrapperDirty =
        videoPromptPrefixDraft !== videoPromptPrefix || videoPromptSuffixDraft !== videoPromptSuffix

    async function handleSaveVideoPromptWrapper() {
        if (isSavingVideoPromptWrapper) return
        setIsSavingVideoPromptWrapper(true)
        try {
            if (onVideoPromptPrefixChange) {
                await onVideoPromptPrefixChange(videoPromptPrefixDraft)
            }
            if (onVideoPromptSuffixChange) {
                await onVideoPromptSuffixChange(videoPromptSuffixDraft)
            }
            showSaved()
        } finally {
            setIsSavingVideoPromptWrapper(false)
        }
    }

    function handleCloseModal() {
        onClose()
    }

    const handleCombinedLayoutModelChange = (
        value: string,
        currentResolution: string,
        onModelChange?: (value: string) => void,
        onResolutionChange?: (value: string) => void,
    ) => {
        onModelChange?.(value)
        const nextModel = userModels.image.find((model) => model.value === value)
        const supportedResolutions = nextModel?.capabilities?.image?.resolutionOptions
        if (
            Array.isArray(supportedResolutions)
            && supportedResolutions.length > 0
            && !supportedResolutions.includes(currentResolution)
        ) {
            onResolutionChange?.(supportedResolutions[0])
        }
        showSaved()
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center glass-overlay animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget) handleCloseModal()
            }}
        >
            <div className="glass-surface-modal p-7 w-full max-w-3xl transform transition-all scale-100 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold text-[var(--glass-text-primary)]">{t('title')}</h2>
                    <div className="flex items-center gap-3">
                        <div className={`glass-chip text-xs transition-all duration-300 ${saveStatus === 'saved'
                            ? 'glass-chip-success'
                            : 'glass-chip-neutral'
                            }`}>
                            {saveStatus === 'saved' ? (
                                <>
                                    <AppIcon name="check" className="w-3.5 h-3.5" />
                                    {t('saved')}
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 bg-[var(--glass-tone-success-fg)] rounded-full"></span>
                                    {t('autoSave')}
                                </>
                            )}
                        </div>
                        <button
                            onClick={handleCloseModal}
                            className="glass-btn-base glass-btn-soft rounded-full p-2 text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]"
                        >
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                <p className="text-[12px] text-[var(--glass-text-tertiary)] mb-6">{t('subtitle')}</p>
                <div className="space-y-5 flex-1 min-h-0 overflow-y-auto app-scrollbar">
                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('visualSettings')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('visualStyle')}</label>
                                <StyleSelector
                                    value={artStyle}
                                    onChange={(value) => handleChange(onArtStyleChange)(value)}
                                    options={ART_STYLES}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('aspectRatio')}</label>
                                <RatioSelector
                                    value={videoRatio}
                                    onChange={(value) => { handleChange(onVideoRatioChange)(value) }}
                                    options={VIDEO_RATIOS}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('modelParams')}</h3>
                        {!modelsLoaded && (
                            <div className="text-xs text-[var(--glass-text-tertiary)]">{t('loadingModels')}</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('analysisModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.llm}
                                    value={analysisModel}
                                    onModelChange={(v) => handleChange(onAnalysisModelChange)(v)}
                                    capabilityFields={analysisCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedAnalysisOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(analysisModel, field, rawValue, sample)
                                    }}
                                    placeholder={t('pleaseSelect')}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('characterModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={characterModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onCharacterModelChange)}
                                    capabilityFields={characterCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedCharacterOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(characterModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('locationModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={locationModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onLocationModelChange)}
                                    capabilityFields={locationCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedLocationOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(locationModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('storyboardModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={imageModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onImageModelChange)}
                                    capabilityFields={storyboardCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedStoryboardOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(imageModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-4 md:col-span-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardSettings')}</label>
                                    <p className="text-xs text-[var(--glass-text-tertiary)]">{t('combinedStoryboardResolutionHint')}</p>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                    <div className="glass-surface p-4 space-y-3">
                                        <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('combinedStoryboard1x1')}</div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardModel')}</label>
                                            <ModelCapabilityDropdown
                                                models={userModels.image}
                                                value={combinedStoryboard1x1Model}
                                                onModelChange={(value) => handleCombinedLayoutModelChange(
                                                    value,
                                                    combinedStoryboard1x1Resolution,
                                                    onCombinedStoryboard1x1ModelChange,
                                                    onCombinedStoryboard1x1ResolutionChange,
                                                )}
                                                capabilityFields={[]}
                                                placementMode="downward"
                                                capabilityOverrides={{}}
                                                onCapabilityChange={() => undefined}
                                                placeholder={t('pleaseSelect')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardResolution')}</label>
                                            <select
                                                value={combinedStoryboard1x1Resolution}
                                                onChange={(event) => handleChange(onCombinedStoryboard1x1ResolutionChange)(event.target.value)}
                                                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                                            >
                                                {combinedStoryboard1x1ResolutionOptions.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="glass-surface p-4 space-y-3">
                                        <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('combinedStoryboard2x2')}</div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardModel')}</label>
                                            <ModelCapabilityDropdown
                                                models={userModels.image}
                                                value={combinedStoryboard2x2Model}
                                                onModelChange={(value) => handleCombinedLayoutModelChange(
                                                    value,
                                                    combinedStoryboard2x2Resolution,
                                                    onCombinedStoryboard2x2ModelChange,
                                                    onCombinedStoryboard2x2ResolutionChange,
                                                )}
                                                capabilityFields={[]}
                                                placementMode="downward"
                                                capabilityOverrides={{}}
                                                onCapabilityChange={() => undefined}
                                                placeholder={t('pleaseSelect')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardResolution')}</label>
                                            <select
                                                value={combinedStoryboard2x2Resolution}
                                                onChange={(event) => handleChange(onCombinedStoryboard2x2ResolutionChange)(event.target.value)}
                                                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                                            >
                                                {combinedStoryboard2x2ResolutionOptions.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="glass-surface p-4 space-y-3">
                                        <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('combinedStoryboard3x3')}</div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardModel')}</label>
                                            <ModelCapabilityDropdown
                                                models={userModels.image}
                                                value={combinedStoryboard3x3Model}
                                                onModelChange={(value) => handleCombinedLayoutModelChange(
                                                    value,
                                                    combinedStoryboard3x3Resolution,
                                                    onCombinedStoryboard3x3ModelChange,
                                                    onCombinedStoryboard3x3ResolutionChange,
                                                )}
                                                capabilityFields={[]}
                                                placementMode="downward"
                                                capabilityOverrides={{}}
                                                onCapabilityChange={() => undefined}
                                                placeholder={t('pleaseSelect')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('combinedStoryboardResolution')}</label>
                                            <select
                                                value={combinedStoryboard3x3Resolution}
                                                onChange={(event) => handleChange(onCombinedStoryboard3x3ResolutionChange)(event.target.value)}
                                                className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                                            >
                                                {combinedStoryboard3x3ResolutionOptions.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('editModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={editModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onEditModelChange)}
                                    capabilityFields={editCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedEditOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(editModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('videoModel')}</label>
                                <ModelCapabilityDropdown
                                    models={normalVideoModels}
                                    value={videoModel}
                                    onModelChange={(v) => handleModelChange(v, normalVideoModels, 'video', onVideoModelChange)}
                                    capabilityFields={videoCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedVideoOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(videoModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('audioModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.audio}
                                    value={audioModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.audio, 'audio', onAudioModelChange)}
                                    capabilityFields={audioCapabilityFields}
                                    placementMode="downward"
                                    capabilityOverrides={selectedAudioOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(audioModel, field, rawValue, sample)
                                    }}
                                    placeholder={t('pleaseSelect')}
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('videoPromptPrefix')}</label>
                                <textarea
                                    value={videoPromptPrefixDraft}
                                    onChange={(event) => setVideoPromptPrefixDraft(event.target.value)}
                                    rows={3}
                                    placeholder={t('videoPromptPrefixHint')}
                                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none resize-y min-h-[88px]"
                                />
                                <p className="text-xs text-[var(--glass-text-tertiary)]">{t('videoPromptPrefixHint')}</p>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('videoPromptSuffix')}</label>
                                <textarea
                                    value={videoPromptSuffixDraft}
                                    onChange={(event) => setVideoPromptSuffixDraft(event.target.value)}
                                    rows={3}
                                    placeholder={t('videoPromptSuffixHint')}
                                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none resize-y min-h-[88px]"
                                />
                                <p className="text-xs text-[var(--glass-text-tertiary)]">{t('videoPromptSuffixHint')}</p>
                            </div>

                            <div className="md:col-span-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => void handleSaveVideoPromptWrapper()}
                                    disabled={!isVideoPromptWrapperDirty || isSavingVideoPromptWrapper}
                                    className="glass-btn-base glass-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSavingVideoPromptWrapper ? t('savingVideoPromptWrapper') : t('saveVideoPromptWrapper')}
                                </button>
                            </div>
                        </div>
                    </div>


                </div>
            </div>
        </div>
    )
}

export { SettingsModal as ConfigEditModal }
export { WorldContextModal } from './WorldContextModal'
